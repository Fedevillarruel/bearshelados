import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { z } from "zod";
import { NextResponse } from "next/server.js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const requireDependency = createRequire(import.meta.url);
const adminId = "11111111-1111-4111-8111-111111111111";
const targetId = "22222222-2222-4222-8222-222222222222";
const cookieName = "bears-admin-preview";
const admin = { id: adminId, role: "admin", email: "admin@example.test", mustChangePassword: false };
const employee = { id: targetId, role: "empleado", email: "employee@example.test", full_name: "Employee", franchise_id: "branch", is_active: true };
const policy = { ADMIN_PREVIEW_COOKIE: cookieName, isPreviewRole: (role) => ["empleado", "franquiciado"].includes(role) };
const redirect = (url) => { throw new Error(`REDIRECT:${url}`); };

function load(relativePath, mocks, globals = {}) {
  const { outputText } = ts.transpileModule(fs.readFileSync(path.join(root, relativePath), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  });
  const loaded = { exports: {} };
  vm.runInNewContext(outputText, {
    module: loaded, exports: loaded.exports, URL, Request, Response, Error,
    process: { env: { NEXT_PUBLIC_SUPABASE_URL: "https://example.test", NEXT_PUBLIC_SUPABASE_ANON_KEY: "test", NODE_ENV: "production" } },
    require: (name) => Object.hasOwn(mocks, name) ? mocks[name] : requireDependency(name),
    ...globals,
  });
  return loaded.exports;
}

function rolesHarness({ actorRole = "admin", target = employee, cookie = targetId, queryError = null } = {}) {
  let reads = 0;
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: adminId } } }) },
    from: () => ({
      select: () => ({
        eq: (_, id) => ({
          single: async () => ({ data: { id: adminId, role: actorRole, email: "actor@example.test", is_active: true } }),
          maybeSingle: async () => { reads++; assert.equal(id, targetId); return { data: target, error: queryError }; },
        }),
      }),
    }),
  };
  const roles = load("src/lib/auth/roles.ts", {
    "next/navigation": { redirect },
    "next/headers": { cookies: async () => ({ get: () => cookie ? { value: cookie } : undefined }) },
    "@/lib/supabase/server": { createClient: async () => client },
    "@/lib/auth/preview": policy,
    "@/lib/validations/ids": { databaseUuid: z.string().uuid() },
  });
  return { roles, reads: () => reads };
}

test("preview resolves selected learner data but never changes the authenticated identity", async () => {
  for (const role of ["empleado", "franquiciado"]) {
    const h = rolesHarness({ target: { ...employee, role } });
    const viewer = await h.roles.getPortalViewer();
    assert.equal(viewer.id, targetId);
    assert.equal(viewer.role, role);
    assert.equal(viewer.franchiseId, "branch");
    assert.equal(viewer.previewAdminId, adminId);
    assert.equal(viewer.isSuperAdmin, false);
    assert.equal((await h.roles.getViewer()).id, adminId);
    assert.equal((await h.roles.requireRole(["admin"])).id, adminId);
    await assert.rejects(h.roles.requireRole(["empleado"]), /REDIRECT:\/admin\/dashboard/);
  }
});

test("forged cookies never let employees or franchisees impersonate users", async () => {
  for (const actorRole of ["empleado", "franquiciado"]) {
    const h = rolesHarness({ actorRole });
    assert.equal((await h.roles.getPortalViewer()).id, adminId);
    assert.equal(h.reads(), 0);
    assert.equal(await h.roles.hasAdminPreview(), false);
  }
});

test("invalid, missing, inactive or admin targets do not activate preview", async () => {
  for (const options of [
    { cookie: "invalid" }, { cookie: null }, { target: null },
    { target: { ...employee, is_active: false } }, { target: { ...employee, role: "admin" } },
  ]) {
    const h = rolesHarness(options);
    assert.equal((await h.roles.getPortalViewer()).role, "admin");
    assert.equal(await h.roles.hasAdminPreview(), false);
  }
  await assert.rejects(rolesHarness({ queryError: { message: "offline" } }).roles.getPortalViewer(), /No pudimos cargar/);
});

function actionHarness({ actor = admin, target = employee, queryError = null } = {}) {
  const writes = [];
  const actions = load("src/app/actions/preview.ts", {
    "next/navigation": { redirect },
    "next/cache": { revalidatePath: (...args) => writes.push(["revalidate", ...args]) },
    "next/headers": { cookies: async () => ({
      set: (...args) => writes.push(["set", ...args]), delete: (...args) => writes.push(["delete", ...args]),
    }) },
    "@/lib/auth/roles": {
      getViewer: async () => actor,
      defaultRouteForRole: (role) => role === "franquiciado" ? "/franquicia/dashboard" : "/cursos/mis-cursos",
    },
    "@/lib/auth/preview": policy,
    "@/lib/supabase/server": { createClient: async () => ({
      from: () => ({ select: () => ({ eq: (_, id) => ({
        maybeSingle: async () => { assert.equal(id, targetId); return { data: target, error: queryError }; },
      }) }) }),
    }) },
    "@/lib/validations/ids": { databaseUuid: z.string().uuid() },
  });
  return { actions, writes };
}

test("only authenticated administrators can select or exit preview", async () => {
  for (const actor of [null, { ...admin, role: "empleado" }, { ...admin, role: "franquiciado" }, { ...admin, mustChangePassword: true }]) {
    const h = actionHarness({ actor });
    assert.match((await h.actions.selectPortalView(targetId)).error, /Solo el administrador/);
    assert.match((await h.actions.selectPortalView(null)).error, /Solo el administrador/);
    assert.equal(h.writes.length, 0);
  }
});

test("selection validates targets and persists a secure readonly view with the correct landing page", async () => {
  for (const role of ["empleado", "franquiciado"]) {
    const h = actionHarness({ target: { ...employee, role } });
    await assert.rejects(h.actions.selectPortalView(targetId), new RegExp(`REDIRECT:${role === "empleado" ? "/cursos/mis-cursos" : "/franquicia/dashboard"}`));
    const [operation, name, value, options] = h.writes[0];
    assert.equal(operation, "set");
    assert.equal(name, cookieName);
    assert.equal(value, targetId);
    assert.equal(options.httpOnly, true);
    assert.equal(options.secure, true);
    assert.equal(options.sameSite, "lax");
    assert.equal(options.path, "/");
    assert.equal(h.writes[1][0], "revalidate");
  }
  const exit = actionHarness();
  await assert.rejects(exit.actions.selectPortalView(null), /REDIRECT:\/admin\/dashboard/);
  assert.deepEqual(exit.writes[0], ["delete", cookieName]);
  for (const options of [{ target: null }, { target: { ...employee, is_active: false } }, { target: { ...employee, role: "admin" } }, { queryError: {} }]) {
    const h = actionHarness(options);
    assert.ok((await h.actions.selectPortalView(targetId)).error);
    assert.equal(h.writes.length, 0);
  }
  assert.match((await actionHarness().actions.selectPortalView("invalid")).error, /no es válido/);
});

async function middlewareResult({ role = "admin", target = employee, cookie = targetId, pathname = "/cursos/mis-cursos", password = false } = {}) {
  const middleware = load("src/middleware.ts", {
    "@supabase/ssr": { createServerClient: () => ({
      auth: { getUser: async () => ({ data: { user: { id: adminId } } }) },
      from: () => ({ select: () => ({ eq: () => ({
        single: async () => ({ data: { role, is_active: true, must_change_password: password } }),
        maybeSingle: async () => ({ data: target }),
      }) }) }),
    }) },
    "next/server": { NextResponse },
    "@/lib/auth/preview": policy,
    "@/lib/validations/ids": { databaseUuid: z.string().uuid() },
  });
  const url = new URL(`https://bears.example${pathname}`);
  return middleware.middleware({
    nextUrl: { pathname, clone: () => new URL(url) },
    cookies: { get: () => cookie ? { value: cookie } : undefined, getAll: () => [], set: () => {} },
  });
}

test("middleware respects the selected role and retains real admin authorization", async () => {
  assert.equal((await middlewareResult()).status, 200);
  assert.equal((await middlewareResult({ pathname: "/admin/dashboard" })).status, 200);
  assert.equal((await middlewareResult({ pathname: "/franquicia/dashboard" })).headers.get("location"), "https://bears.example/cursos/mis-cursos");
  assert.equal((await middlewareResult({ target: { ...employee, role: "franquiciado" }, pathname: "/franquicia/dashboard" })).status, 200);
  assert.equal((await middlewareResult({ cookie: null })).headers.get("location"), "https://bears.example/admin/dashboard");
  assert.equal((await middlewareResult({ cookie: "invalid" })).headers.get("location"), "https://bears.example/admin/dashboard");
  assert.equal((await middlewareResult({ role: "empleado", pathname: "/admin/dashboard" })).headers.get("location"), "https://bears.example/cursos/mis-cursos");
  assert.equal((await middlewareResult({ password: true })).headers.get("location"), "https://bears.example/cambiar-contrasena");
});

test("search filters emails as typed and keeps the administrator return option", () => {
  const jsx = (type, props) => ({ type, props });
  let stateIndex = 0;
  const selector = load("src/components/portal/admin-view-selector.tsx", {
    react: {
      useState: () => [[true, "FRANCHISE", null][stateIndex++], () => {}],
      useRef: () => ({ current: null }), useEffect: () => {}, useTransition: () => [false, () => {}],
    },
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "lucide-react": { ChevronDown: "chevron", Search: "search" },
    "@/app/actions/preview": { selectPortalView: async () => ({}) },
  });
  const tree = selector.AdminViewSelector({
    selectedId: targetId,
    users: [{ id: targetId, email: "employee@example.test", role: "empleado" }, { id: "branch", email: "franchise@example.test", role: "franquiciado" }],
  });
  const dropdown = tree.props.children[1];
  assert.equal(dropdown.props.children[0].props.children[1].props["aria-label"], "Buscar vista por email");
  assert.match(dropdown.props.children[1].props.children[0], /Vista administrador/);
  const results = dropdown.props.children[2].props.children[0];
  assert.equal(results.length, 1);
  assert.equal(results[0].props.children[0].props.children, "franchise@example.test");
});

test("readonly preview blocks resource and video progress before any database write", async () => {
  for (const route of ["resource-progress", "video-progress"]) {
    const api = load(`src/app/api/${route}/route.ts`, {
      "next/server": { NextResponse },
      "@/lib/auth/roles": { getViewer: async () => admin, hasAdminPreview: async () => true },
      "@/lib/supabase/server": { createClient: async () => { throw new Error("Readonly preview must not write"); } },
      "@/lib/validations/ids": { databaseUuid: z.string().uuid() },
      "@/lib/video-ranges": load("src/lib/video-ranges.ts", {}),
    });
    const result = await api.POST(new Request(`https://bears.example/api/${route}`, {
      method: "POST", headers: { origin: "https://bears.example", "Content-Type": "application/json" },
      body: JSON.stringify({ assetId: targetId, ...(route === "video-progress" ? { event: "start" } : {}) }),
    }));
    assert.equal(result.status, 403);
    assert.match((await result.json()).error, /solo lectura/);
  }
});

function findElement(tree, type) {
  if (!tree || typeof tree !== "object") return null;
  if (tree.type === type) return tree;
  for (const child of [tree.props?.children].flat(Infinity)) {
    const match = findElement(child, type);
    if (match) return match;
  }
  return null;
}

test("header selector is admin-only and includes users beyond the first database page", async () => {
  const jsx = (type, props) => ({ type, props });
  const offsets = [];
  const firstPage = Array.from({ length: 1000 }, (_, index) => ({ id: `user-${index}`, email: `${index}@example.test`, role: "empleado" }));
  function layout(actor) {
    return load("src/components/portal/portal-layout.tsx", {
      "react/jsx-runtime": { jsx, jsxs: jsx },
      "next/image": "image", "next/link": "link",
      "@/app/actions/auth": { signOut: () => {} },
      "@/lib/auth/roles": { getViewer: async () => actor, defaultRouteForRole: () => "/" },
      "@/lib/auth/preview": policy,
      "@/components/portal/admin-view-selector": { AdminViewSelector: "selector" },
      "@/components/portal/theme-toggle": { ThemeToggle: "theme" },
      "@/components/portal/portal-navigation": { PortalNavigation: "nav", PortalMobileNavigation: "mobile" },
      "@/lib/supabase/server": { createClient: async () => ({
        from: () => {
          const query = {
            select: () => query, eq: () => query, in: () => query, order: () => query,
            range: async (offset) => { offsets.push(offset); return { data: offset ? [employee] : firstPage }; },
          };
          return query;
        },
      }) },
    });
  }
  const preview = { ...employee, fullName: "Employee", previewAdminId: adminId };
  const tree = await layout(admin).PortalLayout({ viewer: preview, activeKey: "learning", children: "content" });
  const selector = findElement(tree, "selector");
  assert.equal(selector.props.users.length, 1001);
  assert.equal(selector.props.selectedId, targetId);
  assert.deepEqual(offsets, [0, 1000]);
  for (const role of ["empleado", "franquiciado"]) {
    const tree = await layout({ ...employee, role }).PortalLayout({ viewer: { ...preview, role, previewAdminId: undefined }, activeKey: "learning", children: "content" });
    assert.equal(findElement(tree, "selector"), null);
    assert.equal(offsets.length, 2);
  }
});

test("preview exports only the selected franchise and never exports reports for employees", async () => {
  for (const role of ["franquiciado", "empleado"]) {
    const calls = [];
    const api = load("src/app/api/reportes/capacitacion.csv/route.ts", {
      "next/server": { NextResponse },
      "@/lib/auth/roles": { getPortalViewer: async () => ({ ...employee, role, franchiseId: "branch", previewAdminId: adminId }) },
      "@/lib/platform/reporting": { getTrainingOverview: async (scope) => { calls.push(scope); return { team: [], moduleScores: [] }; } },
    });
    const result = await api.GET();
    assert.equal(result.status, role === "franquiciado" ? 200 : 403);
    assert.equal(calls.length, role === "franquiciado" ? 1 : 0);
    if (calls.length) assert.equal(calls[0].franchiseId, "branch");
  }
});

test("preview manual downloads check selected role and do not record employee activity", async () => {
  for (const visibleTo of [["franquiciado"], ["admin"]]) {
    let signed = false;
    const api = load("src/app/api/manuals/[manualId]/download/route.ts", {
      "next/server": { NextResponse },
      "@/lib/auth/roles": { getPortalViewer: async () => ({ ...employee, role: "franquiciado", previewAdminId: adminId }) },
      "@/lib/validations/ids": { databaseUuid: z.string().uuid() },
      "@/lib/supabase/server": { createClient: async () => ({
        from: (table) => {
          assert.equal(table, "manuals");
          return { select: () => ({ eq: () => ({ single: async () => ({ data: { id: targetId, storage_path: "guide.pdf", visible_to: visibleTo } }) }) }) };
        },
        storage: { from: () => ({
          createSignedUrl: async () => { signed = true; return { data: { signedUrl: "https://storage.example/guide.pdf" } }; },
        }) },
      }) },
    });
    const response = await api.GET(null, { params: Promise.resolve({ manualId: targetId }) });
    assert.equal(response.status, visibleTo.includes("franquiciado") ? 307 : 403);
    assert.equal(signed, visibleTo.includes("franquiciado"));
  }
});

test("sign-in and sign-out clear the prior administrator's selected view", async () => {
  const deleted = [];
  const actions = load("src/app/actions/auth.ts", {
    "next/navigation": { redirect },
    "next/headers": { cookies: async () => ({ delete: (name) => deleted.push(name) }) },
    "@/lib/auth/preview": policy,
    "@/lib/auth/roles": { getViewer: async () => admin, defaultRouteForRole: () => "/admin/dashboard" },
    "@/lib/supabase/server": { createClient: async () => ({
      auth: { signInWithPassword: async () => ({ error: null }), signOut: async () => ({ error: null }) },
    }) },
    "@/lib/supabase/admin": { createAdminClient: () => ({}) },
    "@/lib/site-url": { getConfiguredSiteUrl: () => "https://bears.example" },
    "@/lib/validations/auth": { createUserSchema: z.object({}), signInSchema: z.object({ email: z.string(), password: z.string() }) },
    "@/lib/validations/ids": { databaseUuid: z.string().uuid() },
  });
  const form = new FormData();
  form.set("email", "admin@example.test");
  form.set("password", "test-password");
  await assert.rejects(actions.signIn({}, form), /REDIRECT:\/admin\/dashboard/);
  await assert.rejects(actions.signOut(), /REDIRECT:\/login/);
  assert.deepEqual(deleted, [cookieName, cookieName]);
});
