import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const requireDependency = createRequire(import.meta.url);
function load(file, mocks = {}, globals = {}) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const loaded = { exports: {} };
  vm.runInNewContext(output, {
    module: loaded, exports: loaded.exports, URL, URLSearchParams, Buffer, Date, Error, Set, AbortSignal,
    process: { env: {} }, require: (name) => name === "server-only" ? {} : Object.hasOwn(mocks, name) ? mocks[name] : requireDependency(name),
    ...globals,
  });
  return loaded.exports;
}
const { AIError } = load("src/lib/ai/http.ts", {
  "next/server": { NextResponse: { json: (body, options) => ({ body, ...options }) } },
  "@/lib/auth/roles": {},
  "@/lib/site-url": {},
});
const types = load("src/lib/ai/types.ts");
const validation = load("src/lib/ai/validation.ts");
const data = load("src/lib/ai/data.ts", {
  "@/lib/supabase/admin": {},
  "./types": types,
  "./validation": validation,
  "./http": { AIError, checkDB() {} },
});
const entry = { id: "11111111-1111-4111-8111-111111111111", title: "Horario Centro", content: "Lunes de 10 a 20", category: "horarios", franchiseId: null, url: "https://bears.example/reservas", enabled: true, validFrom: null, validUntil: null };

test("settings reject unsafe URLs, oversized instructions and unknown fields", () => {
  assert.equal(validation.settingsSchema.safeParse(types.defaultBotSettings).success, true);
  for (const salesUrl of ["javascript:alert(1)", "http://bears.example", "https://user:pass@bears.example"]) {
    assert.equal(validation.settingsSchema.safeParse({ ...types.defaultBotSettings, salesUrl }).success, false);
  }
  assert.equal(validation.settingsSchema.safeParse({ ...types.defaultBotSettings, instructions: "x".repeat(6001) }).success, false);
  assert.equal(validation.settingsSchema.safeParse({ ...types.defaultBotSettings, apiKey: "secret" }).success, false);
});
test("knowledge validates local UUIDs, actual dates and chronological validity", () => {
  assert.equal(validation.knowledgeSchema.safeParse(entry).success, true);
  for (const fields of [{ franchiseId: "fake" }, { validFrom: "2026-02-30" }, { validFrom: "2026-11-01", validUntil: "2026-10-01" }, { content: "x".repeat(4001) }]) {
    assert.equal(validation.knowledgeSchema.safeParse({ ...entry, ...fields }).success, false);
  }
});
test("only enabled and currently valid knowledge reaches the model", () => {
  const filtered = data.activeKnowledge([
    entry, { ...entry, id: "disabled", enabled: false },
    { ...entry, id: "future", validFrom: "2026-11-01" },
    { ...entry, id: "expired", validUntil: "2026-10-30" },
    { ...entry, id: "inclusive", validFrom: "2026-10-31", validUntil: "2026-10-31" },
  ], "2026-10-31");
  assert.deepEqual(Array.from(filtered, (item) => item.id), [entry.id, "inclusive"]);
});
const meta = load("src/lib/ai/meta.ts", {
  "@/lib/supabase/admin": {}, "@/lib/site-url": { getConfiguredSiteUrl: () => "https://bears.example" },
  "./http": { AIError, checkDB() {} },
}, { process: { env: { META_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64") } } });
test("Meta webhook verifies the exact signed body and rejects missing or modified signatures", () => {
  const body = '{"object":"instagram"}';
  const signature = `sha256=${createHmac("sha256", "test-secret").update(body).digest("hex")}`;
  assert.equal(meta.validSignature(body, signature, "test-secret"), true);
  assert.equal(meta.validSignature(`${body} `, signature, "test-secret"), false);
  assert.equal(meta.validSignature(body, null, "test-secret"), false);
  assert.equal(meta.validSignature(body, "sha256=x", "test-secret"), false);
});
test("Meta tokens are encrypted, randomized and tamper-evident", () => {
  const a = meta.encryptMetaToken("test-access-token");
  const b = meta.encryptMetaToken("test-access-token");
  assert.notEqual(a, b);
  assert.ok(!a.includes("test-access-token"));
  assert.equal(meta.decryptMetaToken(a), "test-access-token");
  const parts = a.split(".");
  parts[2] = Buffer.alloc(16).toString("base64url");
  assert.throws(() => meta.decryptMetaToken(parts.join(".")));
});
const webhook = load("src/lib/ai/webhook.ts");
test("webhook parses story mentions and never treats an attachment as understood", () => {
  const event = { object: "instagram", entry: [{ id: "123", messaging: [{ sender: { id: "456" }, recipient: { id: "123" }, message: { mid: "mid1", attachments: [{ type: "story_mention", payload: { url: "https://cdn.example/story" } }] } }] }] };
  assert.equal(webhook.webhookSchema.safeParse(event).success, true);
  assert.match(webhook.incomingText(event.entry[0].messaging[0].message), /Requiere revisión humana/);
  assert.equal(webhook.safeSocialUrl("javascript:alert(1)"), null);
  assert.equal(webhook.safeSocialUrl("https://cdn.example/story"), "https://cdn.example/story");
});
function openaiHarness(answer, status = 200) {
  const calls = [];
  const openai = load("src/lib/ai/openai.ts", {
    "@/lib/supabase/admin": { createAdminClient: () => ({ from: () => {
      const query = { select: () => query, in: () => query, gte: () => query, order: () => query, limit: async () => ({ data: [], error: null }) };
      return query;
    } }) },
    "./data": { activeKnowledge: data.activeKnowledge, getBotContext: async () => ({ settings: types.defaultBotSettings, knowledge: [entry], franchises: [] }) },
    "./http": { AIError, checkDB() {} },
  }, {
    process: { env: { OPENAI_API_KEY: "test-server-key" } },
    fetch: async (url, options) => {
      calls.push([url, options]);
      return { ok: status === 200, status, json: async () => ({ choices: [{ message: { content: JSON.stringify(answer) } }] }) };
    },
  });
  return { ...openai, calls };
}
test("OpenAI receives structured business context and returns validated answers", async () => {
  const h = openaiHarness({ reply: "Reservá en https://bears.example/reservas", handoff: false, topic: "horarios" });
  const result = await h.generateReply("Qué horario tienen?", [], true);
  assert.equal(result.handoff, false);
  const payload = JSON.parse(h.calls[0][1].body);
  assert.equal(payload.model, "gpt-4.1-mini");
  assert.equal(payload.response_format.json_schema.strict, true);
  assert.match(payload.messages[0].content, /Horario Centro/);
  assert.match(payload.messages[0].content, /asistente virtual/);
});
test("invented sales links cause a safe human handoff", async () => {
  const h = openaiHarness({ reply: "Pagá en https://invented.example/checkout", handoff: false, topic: "productos" });
  const result = await h.generateReply("Quiero comprar", []);
  assert.equal(result.handoff, true);
  assert.equal(result.reply, types.defaultBotSettings.handoffMessage);
});
test("OpenAI failures and malformed replies are explicit, not successful fake answers", async () => {
  await assert.rejects(openaiHarness({}, 429).generateReply("Hola", []), /OpenAI rechazó/);
  await assert.rejects(openaiHarness({ reply: "", handoff: false, topic: "wrong" }).generateReply("Hola", []), /formato esperado/);
});
test("admin guard denies employees, anonymous users and previews before mutation", async () => {
  for (const [viewer, preview, status] of [[null, false, 401], [{ role: "empleado" }, false, 403], [{ role: "franquiciado" }, false, 403], [{ role: "admin" }, true, 403]]) {
    const http = load("src/lib/ai/http.ts", {
      "next/server": {}, "@/lib/auth/roles": { getViewer: async () => viewer, hasAdminPreview: async () => preview },
      "@/lib/site-url": { getConfiguredSiteUrl: () => "https://bears.example" },
    });
    await assert.rejects(http.requireAIAdmin(new Request("https://bears.example/api/ai/workspace"), true), (error) => error.status === status);
  }
});
test("admin mutations enforce canonical origin", async () => {
  const http = load("src/lib/ai/http.ts", {
    "next/server": {}, "@/lib/auth/roles": { getViewer: async () => ({ role: "admin" }), hasAdminPreview: async () => false },
    "@/lib/site-url": { getConfiguredSiteUrl: () => "https://bears.example" },
  });
  await assert.rejects(http.requireAIAdmin(new Request("https://bears.example/api/ai/workspace", { headers: { origin: "https://attacker.example" } }), true), (error) => error.status === 403);
  assert.equal((await http.requireAIAdmin(new Request("https://bears.example/api/ai/workspace", { headers: { origin: "https://bears.example" } }), true)).role, "admin");
});
test("migration keeps secrets server-only, ingress atomic and jobs uniquely associated with replies", () => {
  const sql = fs.readFileSync(path.join(root, "supabase/migrations/022_ai_assistant.sql"), "utf8");
  assert.match(sql, /ai_record_incoming/);
  assert.match(sql, /on conflict\(external_id\) do nothing returning id into mid/);
  assert.match(sql, /job_id uuid unique references public.ai_jobs/);
  assert.match(sql, /revoke all on function public.ai_claim_job\(\) from public/);
  assert.match(sql, /ai_meta_secrets','ai_oauth_states','ai_oauth_pending','ai_usage/);
});

function workerHarness({ enabled = true, status = "bot", age = 0, prior = null, attachment = false, modelError = false, sendError = false } = {}) {
  const changes = [];
  let claims = 0;
  let generated = 0;
  let sends = 0;
  const job = { id: "job-1", conversation_id: "chat-1", message_id: "incoming-1" };
  const conversation = { id: "chat-1", status, channel: "instagram", account_id: "123", participant_id: "456" };
  const message = { id: "incoming-1", content: attachment ? "[Adjunto recibido: image]" : "Hola", created_at: new Date(Date.now() - age).toISOString() };
  const db = {
    rpc: async () => ({ data: claims++ === 0 ? [job] : [], error: null }),
    from(table) {
      let operation = "select";
      let value;
      const filters = [];
      const query = {
        select() { return query; }, order() { return query; }, limit() { return query; }, or() { return query; },
        eq(key, entry) { filters.push([key, entry]); return query; },
        insert(entry) { operation = "insert"; value = entry; return query; },
        update(entry) { operation = "update"; value = entry; return query; },
        async single() { return resolve(true); },
        async maybeSingle() { return resolve(true); },
        then(onFulfilled, onRejected) { return Promise.resolve(resolve(false)).then(onFulfilled, onRejected); },
      };
      function resolve(single) {
        if (operation !== "select") {
          changes.push({ table, operation, value, filters });
          return { data: single ? { id: "outgoing-1" } : null, error: null };
        }
        if (table === "ai_conversations") return { data: conversation, error: null };
        if (filters.some(([key]) => key === "job_id")) return { data: prior, error: null };
        if (filters.some(([key, entry]) => key === "id" && entry === job.message_id)) return { data: message, error: null };
        return { data: [], error: null };
      }
      return query;
    },
  };
  const worker = load("src/lib/ai/worker.ts", {
    "@/lib/supabase/admin": { createAdminClient: () => db },
    "./data": { getBotContext: async () => ({ settings: { ...types.defaultBotSettings, enabled }, knowledge: [entry] }) },
    "./http": { AIError, checkDB() {} },
    "./meta": { sendMetaMessage: async () => { sends++; if (sendError) throw new AIError("Meta rechazó el mensaje", 502); return "meta-mid"; } },
    "./openai": { generateReply: async () => { generated++; if (modelError) throw new AIError("Cuota OpenAI agotada", 502); return { reply: "Hola", handoff: false, topic: "general" }; } },
  });
  return { worker, changes, generated: () => generated, sends: () => sends };
}
test("worker never sends when paused, under human control or outside 24h", async () => {
  for (const options of [{ enabled: false }, { status: "human" }, { age: 24 * 3600_000 + 1000 }]) {
    const h = workerHarness(options);
    const result = await h.worker.processAIJobs();
    assert.equal(result.processed, 1);
    assert.equal(h.generated(), 0);
    assert.equal(h.sends(), 0);
  }
});
test("worker does not duplicate already confirmed or ambiguous outgoing messages", async () => {
  for (const status of ["sent", "pending"]) {
    const h = workerHarness({ prior: { id: "outgoing-1", status } });
    const result = await h.worker.processAIJobs();
    assert.equal(h.sends(), 0);
    assert.equal(h.generated(), 0);
    assert.equal(status === "sent" ? result.processed : result.failed, 1);
  }
});
test("worker persists confirmed replies and routes attachments to humans without model analysis", async () => {
  const h = workerHarness({ attachment: true });
  await h.worker.processAIJobs();
  assert.equal(h.generated(), 0);
  assert.equal(h.sends(), 1);
  assert.ok(h.changes.some((change) => change.table === "ai_messages" && change.value.status === "sent"));
  assert.ok(h.changes.some((change) => change.table === "ai_conversations" && change.value.status === "human"));
});
test("worker failures remain visible, do not count as sent and hand off safely", async () => {
  for (const options of [{ modelError: true }, { sendError: true }]) {
    const h = workerHarness(options);
    const result = await h.worker.processAIJobs();
    assert.equal(result.failed, 1);
    assert.ok(h.changes.some((change) => change.table === "ai_jobs" && change.value.status === "failed"));
    assert.ok(h.changes.some((change) => change.table === "ai_messages" && change.value.status === "failed"));
    assert.ok(!h.changes.some((change) => change.table === "ai_messages" && change.value.status === "sent"));
    assert.ok(h.changes.some((change) => change.table === "ai_conversations" && change.value.status === "human"));
  }
});

test("webhook route rejects unsigned events before DB access and isolates Bears accounts", async () => {
  const records = [];
  let reads = 0;
  const next = { NextResponse: { json: (body, options) => new Response(JSON.stringify(body), options) }, after() {} };
  const http = load("src/lib/ai/http.ts", { "next/server": next, "@/lib/auth/roles": {}, "@/lib/site-url": {} });
  const route = load("src/app/api/meta/webhooks/route.ts", {
    "next/server": next,
    "@/lib/supabase/admin": { createAdminClient: () => ({ rpc: async (name, params) => { records.push([name, params]); return { error: null }; } }) },
    "@/lib/ai/http": http,
    "@/lib/ai/meta": { validSignature: meta.validSignature, getConnection: async () => { reads++; return { page_id: "123", instagram_id: "789" }; } },
    "@/lib/ai/webhook": webhook,
    "@/lib/ai/worker": {},
  }, { process: { env: { META_APP_SECRET: "test-secret" } } });
  const body = JSON.stringify({ object: "instagram", entry: [
    { id: "not-bears", messaging: [{ sender: { id: "456" }, recipient: { id: "not-bears" }, message: { mid: "bad", text: "No almacenar" } }] },
    { id: "789", messaging: [{ sender: { id: "456" }, recipient: { id: "789" }, timestamp: Date.now(), message: { mid: "good", text: "Hola Bears" } }] },
  ] });
  assert.equal((await route.POST(new Request("https://bears.example/api/meta/webhooks", { method: "POST", body }))).status, 403);
  assert.equal(reads, 0);
  const signature = `sha256=${createHmac("sha256", "test-secret").update(body).digest("hex")}`;
  assert.equal((await route.POST(new Request("https://bears.example/api/meta/webhooks", { method: "POST", body, headers: { "x-hub-signature-256": signature } }))).status, 200);
  assert.equal(records.length, 1);
  assert.equal(records[0][1].p_external, "good");
  assert.equal(records[0][1].p_account, "789");
});

test("admin workspace renders every tab with real data and explicit empty states", () => {
  const workspace = {
    settings: types.defaultBotSettings, knowledge: [entry], franchises: [],
    connection: null, readiness: { openai: false, meta: false }, conversations: [],
    assets: [], period: 30,
    metrics: { conversations: 23, incoming: 41, replies: 12, handoffs: 7, failed: 2, daily: [], topics: [] },
  };
  const source = fs.readFileSync(path.join(root, "src/components/admin/ai-workspace.tsx"), "utf8");
  const tabDefinition = source.match(/const tabs:[\s\S]*?=\s*\[([\s\S]*?)\];/)?.[1] ?? "";
  const tabIds = Array.from(tabDefinition.matchAll(/id:\s*"([^"]+)"/g), (match) => match[1]);
  assert.equal(tabIds.length, 7);
  for (const tab of tabIds) {
    let stateIndex = 0;
    const mockReact = {
      ...React,
      useState: (initial) => {
        const index = stateIndex++;
        return [index === 0 ? workspace : index === 2 ? false : index === 3 ? tab : initial, () => {}];
      },
      useEffect() {},
      useMemo: (callback) => callback(),
      useCallback: (callback) => callback,
    };
    const { AIWorkspace } = load("src/components/admin/ai-workspace.tsx", {
      "react/jsx-runtime": {
        ...requireDependency("react/jsx-runtime"),
        jsx: (type, props, key) => {
          assert.ok(type, `Undefined JSX type on tab ${tab}: ${JSON.stringify(props)}`);
          return requireDependency("react/jsx-runtime").jsx(type, props, key);
        },
        jsxs: (type, props, key) => {
          assert.ok(type, `Undefined JSX type on tab ${tab}`);
          return requireDependency("react/jsx-runtime").jsxs(type, props, key);
        },
      },
      react: mockReact,
      "next/link": ({ children, ...props }) => React.createElement("a", props, children),
      "next/navigation": {},
      sonner: { Toaster: () => null, toast: { success() {}, error() {} } },
      "@/lib/ai/types": types,
    });
    const html = renderToStaticMarkup(React.createElement(AIWorkspace));
    assert.match(html, /Bears/);
    assert.doesNotMatch(html, /test-server-key|test-access-token/);
    if (tab === "resumen") {
      assert.match(html, /Chats en atención humana/);
      assert.ok(html.includes(">7<"), "Human-attention KPI uses full-period aggregate, not last 100 conversations.");
    }
  }
});
