import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import ts from "typescript";
import { z } from "zod";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const requireDependency = createRequire(import.meta.url);

function loadModule(relativePath, mocks = {}, globals = {}) {
  const source = fs.readFileSync(path.join(root, relativePath), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  });
  const loaded = { exports: {} };
  vm.runInNewContext(outputText, {
    module: loaded, exports: loaded.exports, Error, process,
    require: (name) => Object.hasOwn(mocks, name) ? mocks[name] : requireDependency(name),
    ...globals,
  }, { filename: relativePath });
  return loaded.exports;
}

const sections = loadModule("src/lib/commerce/sections.ts");
const Link = ({ children, ...props }) => React.createElement("a", props, children);
const clientMocks = {
  "next/link": Link,
  "next/navigation": { useRouter: () => ({ refresh() {} }) },
  "@/lib/commerce/sections": sections,
};
const franchises = [
  { id: "local-1", name: "Local Centro", code: "CENTRO", city: "Buenos Aires", isActive: true },
  { id: "local-2", name: "Local Norte", code: null, city: null, isActive: false },
];
const { CommerceWorkspace } = loadModule("src/components/admin/commerce-workspace.tsx", clientMocks);
const navigation = loadModule("src/components/portal/portal-navigation.tsx", clientMocks);

test("all commerce sections have unique valid routes and unknown sections are rejected", () => {
  assert.equal(sections.commerceSections.length, 9);
  assert.equal(new Set(sections.commerceSections.map((section) => section.id)).size, 9);
  for (const section of sections.commerceSections) {
    assert.equal(sections.getCommerceSection(section.id), section);
    assert.equal(sections.commerceHref(section.id), `/admin/compras-ventas/${section.id}`);
    assert.equal(sections.commerceActiveKey(section.id), `commerce-${section.id}`);
  }
  assert.equal(sections.getCommerceSection("invalid"), undefined);
  assert.equal(sections.getCommerceSection("__proto__"), undefined);
});

test("commerce accordion is admin-only on desktop and mobile", () => {
  for (const component of [navigation.PortalNavigation, navigation.PortalMobileNavigation]) {
    for (const role of ["admin", "franquiciado", "empleado"]) {
      const html = renderToStaticMarkup(React.createElement(component, { role, activeKey: "dashboard" }));
      if (role === "admin") {
        assert.match(html, /Compras y Ventas/);
        for (const section of sections.commerceSections) assert.ok(html.includes(sections.commerceHref(section.id)));
      } else {
        assert.doesNotMatch(html, /Compras y Ventas|\/admin\/compras-ventas/);
      }
    }
  }
});

test("active commerce section opens the accordion and marks exactly one active link", () => {
  for (const component of [navigation.PortalNavigation, navigation.PortalMobileNavigation]) {
    const html = renderToStaticMarkup(React.createElement(component, { role: "admin", activeKey: "commerce-stock" }));
    assert.match(html, /<details[^>]*open=""/);
    assert.equal((html.match(/aria-current="page"/g) ?? []).length, 1);
    assert.match(html, /href="\/admin\/compras-ventas\/stock"[^>]*aria-current="page"/);
  }
});

test("mobile menu keeps every existing link reachable for all roles", () => {
  for (const [role, routes] of Object.entries({
    admin: ["/admin/dashboard", "/admin/usuarios", "/admin/cursos", "/admin/manuales", "/admin/franquicias"],
    franquiciado: ["/franquicia/dashboard", "/franquicia/equipo", "/cursos/mis-cursos", "/cursos/progreso", "/franquicia/manuales"],
    empleado: ["/cursos/mis-cursos", "/cursos/progreso"],
  })) {
    const html = renderToStaticMarkup(React.createElement(navigation.PortalMobileNavigation, { role, activeKey: "dashboard" }));
    for (const route of routes) assert.ok(html.includes(route), `${role}: ${route}`);
  }
});

function pageHarness(role) {
  let reads = 0;
  const roles = loadModule("src/lib/auth/roles.ts", {
    "@/lib/auth/preview": { ADMIN_PREVIEW_COOKIE: "bears-admin-preview", isPreviewRole: (value) => ["empleado", "franquiciado"].includes(value) },
    "@/lib/validations/ids": { databaseUuid: z.string().uuid() },
    "next/navigation": { redirect: (url) => { throw new Error(`REDIRECT:${url}`); } },
    "@/lib/supabase/server": {
      createClient: async () => ({
        auth: { getUser: async () => ({ data: { user: role ? { id: "viewer-1" } : null } }) },
        from: () => ({
          select: () => ({
            eq: () => ({
              single: async () => ({ data: {
                id: "viewer-1", role, email: "viewer@example.test", is_active: true,
                is_super_admin: false, must_change_password: false,
              } }),
            }),
          }),
        }),
      }),
    },
  }, {
    process: { env: { NEXT_PUBLIC_SUPABASE_URL: "https://example.test", NEXT_PUBLIC_SUPABASE_ANON_KEY: "test" } },
  });
  const mocks = {
    "@/lib/auth/roles": roles,
    "@/lib/commerce/sections": sections,
    "@/lib/commerce/data": { getCommerceFranchises: async () => { reads++; return { status: "available", franchises }; } },
    "@/components/admin/commerce-workspace": { CommerceWorkspace },
    "@/components/portal/portal-layout": { PortalLayout: ({ children }) => React.createElement("main", null, children) },
    "next/navigation": {
      notFound: () => { throw new Error("NOT_FOUND"); },
      redirect: (url) => { throw new Error(`REDIRECT:${url}`); },
    },
  };
  return {
    sectionPage: loadModule("src/app/admin/compras-ventas/[section]/page.tsx", mocks).default,
    indexPage: loadModule("src/app/admin/compras-ventas/page.tsx", mocks).default,
    reads: () => reads,
  };
}

test("every subpage and index reject non-admin users before reading commercial data", async () => {
  for (const [role, destination] of [["franquiciado", "/franquicia/dashboard"], ["empleado", "/cursos/mis-cursos"], [null, "/login"]]) {
    const h = pageHarness(role);
    for (const section of sections.commerceSections) {
      await assert.rejects(h.sectionPage({ params: Promise.resolve({ section: section.id }) }), { message: `REDIRECT:${destination}` });
    }
    await assert.rejects(h.indexPage(), { message: `REDIRECT:${destination}` });
    assert.equal(h.reads(), 0);
  }
});

test("admin can visit every section; unknown routes 404 without fetching franchises", async () => {
  const h = pageHarness("admin");
  for (const section of sections.commerceSections) {
    const output = await h.sectionPage({ params: Promise.resolve({ section: section.id }) });
    assert.match(renderToStaticMarkup(output), /Solo administración/);
  }
  assert.equal(h.reads(), 9);
  await assert.rejects(h.sectionPage({ params: Promise.resolve({ section: "invalid" }) }), { message: "NOT_FOUND" });
  assert.equal(h.reads(), 9);
  await assert.rejects(h.indexPage(), { message: "REDIRECT:/admin/compras-ventas/resumen" });
});

test("workspace renders real franchises and explicit pending states in every section", () => {
  for (const section of sections.commerceSections) {
    const html = renderToStaticMarkup(React.createElement(CommerceWorkspace, {
      sectionId: section.id, result: { status: "available", franchises },
    }));
    assert.doesNotMatch(html, /\$[\d.,]+/);
    assert.doesNotMatch(html, /type="password"/);
    if (["resumen", "stock"].includes(section.id)) {
      assert.match(html, /Local Centro/);
      assert.match(html, /Local Norte/);
    }
    if (section.id === "integracion") {
      assert.match(html, /Copiar cuestionario/);
      assert.match(html, /No implementada/);
      assert.equal(odooQuestionCount(html), 8);
    } else {
      assert.match(html, /No hay ventas, inventario ni costos sincronizados/);
    }
  }
});

function odooQuestionCount(html) {
  return sections.odooQuestions.filter((question) => html.includes(question.title)).length;
}

test("empty franchises and query failures are different visible states", () => {
  const empty = renderToStaticMarkup(React.createElement(CommerceWorkspace, {
    sectionId: "resumen", result: { status: "available", franchises: [] },
  }));
  assert.match(empty, /No hay locales para esta selección/);
  assert.doesNotMatch(empty, /role="alert"/);
  const failed = renderToStaticMarkup(React.createElement(CommerceWorkspace, {
    sectionId: "resumen", result: { status: "error", message: "No pudimos cargar las franquicias." },
  }));
  assert.match(failed, /role="alert"/);
  assert.match(failed, /Reintentar/);
  assert.doesNotMatch(failed, /No hay locales para esta selección/);
  assert.doesNotMatch(failed, /font-medium">0<\/p>/);
});

test("local and status filters select the actual franchise list without changing network totals", () => {
  for (const [localId, status, expected, excluded] of [
    ["local-1", "all", "Local Centro", "Local Norte"],
    ["all", "inactive", "Local Norte", "Local Centro"],
    ["local-1", "inactive", null, "Local Centro"],
  ]) {
    let stateIndex = 0;
    const component = loadModule("src/components/admin/commerce-workspace.tsx", {
      ...clientMocks,
      react: {
        ...React,
        useState: () => [[localId, status][stateIndex++], () => {}],
      },
    }).CommerceWorkspace;
    const html = renderToStaticMarkup(React.createElement(component, {
      sectionId: "resumen", result: { status: "available", franchises },
    }));
    const rows = html.match(/<tbody[\s\S]*?<\/tbody>/)?.[0] ?? "";
    if (expected) assert.ok(rows.includes(expected));
    else assert.match(html, /No hay locales para esta selección/);
    assert.ok(!rows.includes(excluded));
    assert.match(html, /font-medium">2<\/p>/);
  }
});

test("copy questionnaire reports success or clipboard failure explicitly", async () => {
  for (const fails of [false, true]) {
    const states = [];
    let copiedText = "";
    const component = loadModule("src/components/admin/commerce-workspace.tsx", {
      ...clientMocks,
      react: { ...React, useState: (initial) => [initial, (value) => states.push(value)] },
    }, {
      navigator: { clipboard: { writeText: async (text) => {
        if (fails) throw new Error("Clipboard unavailable");
        copiedText = text;
      } } },
    }).CommerceWorkspace;
    const tree = component({ sectionId: "integracion", result: { status: "available", franchises } });
    function findCopyButton(element) {
      if (!React.isValidElement(element)) return null;
      if (typeof element.type === "function") return findCopyButton(element.type(element.props));
      if (element.type === "button" && element.props.onClick) return element;
      for (const child of React.Children.toArray(element.props.children)) {
        const found = findCopyButton(child);
        if (found) return found;
      }
      return null;
    }
    const button = findCopyButton(tree);
    assert.ok(button);
    await button.props.onClick();
    assert.equal(states.at(-1), fails ? "error" : "copied");
    if (!fails) {
      for (const item of sections.odooQuestions) assert.ok(copiedText.includes(item.question));
      assert.match(copiedText, /No enviar contraseñas ni API keys/);
    }
  }
});

test("franchise query uses the authenticated client and preserves real values", async () => {
  let table;
  let order;
  let response = {
    data: [{ id: "local-1", name: "Local Centro", code: null, city: "Buenos Aires", is_active: true }],
    error: null,
  };
  const { getCommerceFranchises } = loadModule("src/lib/commerce/data.ts", {
    "server-only": {},
    "@/lib/supabase/server": { createClient: async () => ({
      from: (name) => {
        table = name;
        return { select: () => ({ order: async (field) => { order = field; return response; } }) };
      },
    }) },
  });
  const result = await getCommerceFranchises();
  assert.equal(table, "franchises");
  assert.equal(order, "name");
  assert.equal(result.status, "available");
  assert.equal(result.franchises[0].isActive, true);
  assert.equal(result.franchises[0].city, "Buenos Aires");
  response = { data: null, error: { message: "Database unavailable" } };
  const failure = await getCommerceFranchises();
  assert.equal(failure.status, "error");
  assert.match(failure.message, /No pudimos cargar/);
  assert.equal(Object.hasOwn(failure, "franchises"), false);
});
