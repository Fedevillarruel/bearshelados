import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { z } from "zod";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const requireDependency = createRequire(import.meta.url);

function loadModule(relativePath, mocks, globals = {}) {
  const source = fs.readFileSync(path.join(root, relativePath), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const loaded = { exports: {} };
  vm.runInNewContext(outputText, {
    module: loaded, exports: loaded.exports, URL, Error,
    require: (name) => Object.hasOwn(mocks, name) ? mocks[name] : requireDependency(name),
    ...globals,
  }, { filename: relativePath });
  return loaded.exports;
}

const userId = "11111111-1111-4111-8111-111111111111";
const routes = {
  admin: "/admin/dashboard",
  franquiciado: "/franquicia/dashboard",
  empleado: "/cursos/mis-cursos",
};

function authHarness({ role = "empleado", viewer = { id: userId, role }, authError = null, profileError = null, profile = { id: userId, must_change_password: false }, adminUnavailable = false } = {}) {
  const calls = [];
  let obligation = true;
  const actions = loadModule("src/app/actions/auth.ts", {
    "next/navigation": { redirect: (url) => { calls.push(["redirect", url]); throw new Error(`REDIRECT:${url}`); } },
    "@/lib/auth/roles": { getViewer: async () => viewer, defaultRouteForRole: (value) => routes[value] },
    "@/lib/supabase/server": {
      createClient: async () => ({
        auth: { updateUser: async () => { calls.push(["password"]); return { error: authError }; } },
        from: () => { throw new Error("Profile must not be updated with the RLS-restricted user client"); },
      }),
    },
    "@/lib/supabase/admin": {
      createAdminClient: () => {
        if (adminUnavailable) throw new Error("Faltan las variables de entorno de Supabase para la operación administrativa.");
        return { from: (table) => ({
          update: (payload) => ({
            eq: (column, value) => ({
              select: (fields) => ({
                single: async () => {
                  calls.push(["profile", table, JSON.parse(JSON.stringify(payload)), column, value, fields]);
                  if (!profileError && profile?.must_change_password === false) obligation = false;
                  return { data: profile, error: profileError };
                },
              }),
            }),
          }),
        }) };
      },
    },
    "@/lib/site-url": { getConfiguredSiteUrl: () => "https://bears.example" },
    "@/lib/validations/auth": { createUserSchema: z.object({}), signInSchema: z.object({}) },
    "@/lib/validations/ids": { databaseUuid: z.string().guid() },
  });
  return { actions, calls, obligation: () => obligation };
}

function passwordForm(value = "a-new-password-for-testing") {
  const form = new FormData();
  form.set("password", value);
  // An untrusted ID must never determine which profile is cleared.
  form.set("userId", "22222222-2222-4222-8222-222222222222");
  return form;
}

test("clears only the authenticated user's obligation after Auth succeeds, for every role", async () => {
  for (const role of Object.keys(routes)) {
    const h = authHarness({ role });
    await assert.rejects(h.actions.changePassword({}, passwordForm()), { message: `REDIRECT:${routes[role]}` });
    assert.equal(h.obligation(), false);
    assert.deepEqual(h.calls, [
      ["password"],
      ["profile", "profiles", { must_change_password: false }, "id", userId, "id, must_change_password"],
      ["redirect", routes[role]],
    ]);
  }
});

test("does not change the password or profile with invalid input or an expired session", async () => {
  const invalid = authHarness();
  assert.match((await invalid.actions.changePassword({}, passwordForm("short"))).error, /12 caracteres/);
  assert.equal(invalid.calls.length, 0);
  const expired = authHarness({ viewer: null });
  assert.match((await expired.actions.changePassword({}, passwordForm())).error, /sesión venció/);
  assert.equal(expired.calls.length, 0);
});

test("checks administrative configuration before changing the password", async () => {
  const h = authHarness({ adminUnavailable: true });
  assert.match((await h.actions.changePassword({}, passwordForm())).error, /variables de entorno/);
  assert.equal(h.calls.length, 0);
  assert.equal(h.obligation(), true);
});

test("Auth failures never clear the password obligation", async () => {
  for (const [code, message] of [["same_password", /diferente/], ["weak_password", /No pudimos actualizar/]]) {
    const h = authHarness({ authError: { code } });
    assert.match((await h.actions.changePassword({}, passwordForm())).error, message);
    assert.deepEqual(h.calls, [["password"]]);
    assert.equal(h.obligation(), true);
  }
});

test("profile failures and zero-row updates are explicit partial failures, not redirects", async () => {
  for (const options of [
    { profileError: { message: "Database unavailable" }, profile: null },
    { profile: null },
    { profile: { id: userId, must_change_password: true } },
  ]) {
    const h = authHarness(options);
    const response = await h.actions.changePassword({}, passwordForm());
    assert.match(response.error, /La contraseña se actualizó/);
    assert.match(response.error, /No vuelvas a usar la contraseña anterior/);
    assert.equal(h.calls.some(([name]) => name === "redirect"), false);
    assert.equal(h.obligation(), true);
  }
});

function cookieStore(initial = []) {
  const values = new Map(initial.map((cookie) => [cookie.name, cookie]));
  return {
    getAll: () => [...values.values()],
    set: (name, value, options) => {
      const cookie = typeof name === "string" ? { name, value, ...options } : name;
      values.set(cookie.name, cookie);
    },
  };
}

async function middlewareHarness({ pathname, profile, user = { id: userId } }) {
  const refreshedCookie = { name: "sb-session", value: "refreshed-test-token", httpOnly: true, path: "/" };
  const middlewareModule = loadModule("src/middleware.ts", {
    "@supabase/ssr": {
      createServerClient: (_url, _key, { cookies }) => ({
        auth: { getUser: async () => {
          cookies.setAll([{ name: refreshedCookie.name, value: refreshedCookie.value, options: { httpOnly: true, path: "/" } }]);
          return { data: { user } };
        } },
        from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: profile }) }) }) }),
      }),
    },
    "next/server": { NextResponse: {
      next: () => ({ cookies: cookieStore(), kind: "next" }),
      redirect: (url) => ({ cookies: cookieStore(), kind: "redirect", url }),
    } },
  }, { process: { env: { NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-key" } } });
  const nextUrl = new URL(`https://bears.example${pathname}`);
  nextUrl.clone = () => new URL(nextUrl);
  const response = await middlewareModule.middleware({ nextUrl, cookies: cookieStore() });
  return { response, refreshedCookie };
}

test("middleware stops sending the user to change-password after the flag is cleared", async () => {
  const base = { role: "empleado", is_active: true, is_super_admin: false };
  const before = await middlewareHarness({ pathname: "/cursos/mis-cursos", profile: { ...base, must_change_password: true } });
  assert.equal(before.response.url.pathname, "/cambiar-contrasena");
  assert.deepEqual(JSON.parse(JSON.stringify(before.response.cookies.getAll())), [before.refreshedCookie]);
  const after = await middlewareHarness({ pathname: "/cursos/mis-cursos", profile: { ...base, must_change_password: false } });
  assert.equal(after.response.kind, "next");
  assert.deepEqual(JSON.parse(JSON.stringify(after.response.cookies.getAll())), [after.refreshedCookie]);
});

test("other auth redirects also retain refreshed session cookies", async () => {
  for (const options of [
    { pathname: "/admin/dashboard", user: null, profile: null },
    { pathname: "/cursos/mis-cursos", profile: { is_active: false } },
    { pathname: "/admin/dashboard", profile: { role: "empleado", is_active: true, must_change_password: false } },
  ]) {
    const h = await middlewareHarness(options);
    assert.equal(h.response.kind, "redirect");
    assert.deepEqual(JSON.parse(JSON.stringify(h.response.cookies.getAll())), [h.refreshedCookie]);
  }
});
