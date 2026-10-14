import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";
import { z } from "zod";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const requireDependency = createRequire(import.meta.url);
const source = (file) => fs.readFileSync(path.join(root, file), "utf8");
function loadModule(file, mocks = {}, globals = {}) {
  const { outputText } = ts.transpileModule(source(file), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  });
  const loaded = { exports: {} };
  vm.runInNewContext(outputText, {
    module: loaded, exports: loaded.exports, URL,
    require: (name) => Object.hasOwn(mocks, name) ? mocks[name] : requireDependency(name),
    ...globals,
  });
  return loaded.exports;
}

const assetId = "33333333-3333-4333-8333-333333333333";
function routeHarness({ duration = 60, current = { watched_ranges: [[0, 15]], updated_at: new Date(Date.now() - 30_000).toISOString(), completed: false }, readError = null, writeError = null } = {}) {
  const writes = [];
  const db = {
    from: (table) => {
      const query = {
        select: () => query, eq: () => query,
        single: async () => ({ data: { id: assetId, duration_seconds: duration } }),
        maybeSingle: async () => ({ data: current, error: readError }),
        upsert: async (value) => { writes.push({ table, value }); return { error: writeError }; },
      };
      return query;
    },
  };
  const { POST } = loadModule("src/app/api/video-progress/route.ts", {
    "next/server": { NextResponse: { json: (body, options) => ({ body, ...options }) } },
    "@/lib/auth/roles": { getViewer: async () => ({ id: "user-1" }), hasAdminPreview: async () => false },
    "@/lib/supabase/server": { createClient: async () => db },
    "@/lib/validations/ids": { databaseUuid: z.string().guid() },
    "@/lib/video-ranges": loadModule("src/lib/video-ranges.ts"),
  });
  return {
    writes,
    post: (body) => POST(new Request("https://bears.example/api/video-progress", {
      method: "POST", headers: { origin: "https://bears.example" }, body: JSON.stringify({ assetId, ...body }),
    })),
  };
}

test("video API only confirms completion after persistence at 90%, preserving an existing completion", async () => {
  const h = routeHarness();
  const result = await h.post({ event: "progress", lastPosition: 60, watchedRanges: [[0, 54]] });
  assert.equal(result.status, 200);
  assert.equal(result.body.completed, true);
  assert.equal(h.writes[0].value.completed, true);
  assert.equal(h.writes[0].value.last_position, 54);
  const replay = routeHarness({ current: { watched_ranges: [], completed: true, updated_at: new Date().toISOString() } });
  assert.equal((await replay.post({ event: "progress", lastPosition: 1, watchedRanges: [[0, 1]] })).body.completed, true);
  const failure = routeHarness({ writeError: new Error("DB unavailable") });
  assert.equal((await failure.post({ event: "progress", lastPosition: 54, watchedRanges: [[0, 54]] })).status, 500);
});

test("video API permits real 2x playback but rejects impossible advancement and invalid duration", async () => {
  const h = routeHarness({ current: { watched_ranges: [], updated_at: new Date(Date.now() - 15_000).toISOString(), completed: false } });
  assert.equal((await h.post({ event: "progress", lastPosition: 30, watchedRanges: [[0, 30]] })).status, 200);
  assert.equal((await h.post({ event: "progress", lastPosition: 60, watchedRanges: [[0, 60]] })).status, 422);
  const invalid = routeHarness({ duration: 0 });
  assert.equal((await invalid.post({ event: "start" })).status, 422);
  assert.equal(invalid.writes.length, 0);
});

test("video API distinguishes a failed progress read from a missing start", async () => {
  const progress = { event: "progress", lastPosition: 1, watchedRanges: [[0, 1]] };
  assert.equal((await routeHarness({ current: null }).post(progress)).status, 409);
  assert.equal((await routeHarness({ current: null, readError: new Error("DB unavailable") }).post(progress)).status, 500);
});

test("video client never reports local/HTTP/error completion as server-confirmed", async () => {
  for (const [response, expected] of [
    [{ ok: true, json: async () => ({ completed: true }) }, true],
    [{ ok: true, json: async () => ({ completed: false }) }, false],
    [{ ok: false, json: async () => ({ completed: true }) }, false],
    [{ ok: true, json: async () => { throw new Error("invalid JSON"); } }, false],
  ]) {
    const client = loadModule("src/lib/video-progress-client.ts", {}, { fetch: async () => response });
    assert.equal(await client.saveVideoProgress({ assetId, lastPosition: 60, watchedRanges: [[0, 60]] }), expected);
  }
});

test("employee completion reads approved attempts for every active visible exam, without changing blockers", () => {
  const employee = source("src/lib/platform/employee.ts");
  const visibleIds = employee.slice(employee.indexOf("const visibleExamIds"), employee.indexOf("if (passedExamError)"));
  assert.doesNotMatch(visibleIds, /filter.*blocks_progress/);
  assert.match(visibleIds, /\.eq\("passed", true\)/);
  const blockers = employee.slice(employee.indexOf("export async function getUnpassedBlockingExam"), employee.indexOf("function shuffle"));
  assert.match(blockers, /\.eq\("blocks_progress", true\)/);
  assert.match(blockers, /\.eq\("is_active", true\)/);
  assert.match(blockers, /\.eq\("passed", true\)/);
});

test("employee reads never mutate enrollment timestamps or progress, including administrative preview", () => {
  const employee = source("src/lib/platform/employee.ts");
  assert.doesNotMatch(employee, /\.(?:update|insert|upsert|delete|rpc)\s*\(/);
});

test("both course players pass readonly through to native/YouTube and adaptive omits resource recorder", () => {
  const jsx = (type, props) => ({ type, props });
  const mocks = {
    react: { useState: (value) => [value, () => {}], useEffect: () => {}, useRef: (value) => ({ current: value }) },
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "next/image": { default: "image" },
    "next/link": { default: "link" },
    "next/navigation": { useRouter: () => ({ refresh: () => {} }) },
    "lucide-react": new Proxy({}, { get: (_, name) => String(name) }),
    "@/components/learning/native-video": { NativeVideo: "NativeVideo" },
    "@/components/learning/youtube-video": { YouTubeVideo: "YouTubeVideo" },
    "@/lib/youtube": {
      getYouTubeVideoId: (url) => url.includes("youtu.be") ? "M7lc1UVf-VE" : null,
      isYouTubeUrl: () => false,
    },
  };
  function nodes(tree) {
    if (!tree || typeof tree !== "object") return [];
    const children = tree.props?.children;
    return [tree, ...(Array.isArray(children) ? children : [children]).flatMap(nodes)];
  }
  const currentModule = { id: "module-1", title: "Module" };
  const base = {
    course: { slug: "course", title: "Course" }, currentModule, modules: [currentModule],
    enrollment: { progress_percent: 0 }, courseAssets: [], exams: [], courseExams: [],
    completedExamIds: [], completedModuleIds: [], accessBlockedBy: null,
  };
  for (const [file, name] of [
    ["adaptive-course-player", "AdaptiveCoursePlayer"],
    ["employee-course-player", "EmployeeCoursePlayer"],
  ]) {
    const Component = loadModule(`src/components/learning/${file}.tsx`, mocks)[name];
    for (const url of ["https://example.com/video.mp4", "https://youtu.be/M7lc1UVf-VE"]) {
      for (const readOnly of [false, true]) {
        const data = { ...base, assets: [{ id: "asset-1", type: "video", url, duration_seconds: 60 }] };
        const tree = Component({ data, readOnly });
        if (name === "AdaptiveCoursePlayer") {
          assert.equal(nodes(tree).some((node) => node.type?.name === "ResourceProgressRecorder"), !readOnly);
        }
        let stage = nodes(tree).find((node) => ["AssetStage", "AssetContent"].includes(node.type?.name));
        while (typeof stage.type === "function") stage = stage.type(stage.props);
        assert.equal(stage.type, url.includes("youtu.be") ? "YouTubeVideo" : "NativeVideo");
        assert.equal(stage.props.readOnly, readOnly);
      }
    }
  }
});

const enginePath = process.env.COMPLETION_PGLITE_PATH;
test("SQL 014/016 -> 021 backfill and live triggers keep module/course completion authoritative", {
  skip: enginePath ? false : "Set COMPLETION_PGLITE_PATH to a local @electric-sql/pglite entry point for executable SQL regression",
}, async () => {
  const { PGlite } = await import(pathToFileURL(path.resolve(enginePath)).href);
  const db = new PGlite();
  const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const [user, other, assigned, course, module, video, resource, blocking, nonblocking, inactive, final] = Array.from({ length: 11 }, (_, n) => id(n + 1));
  const rows = async (sql) => (await db.query(sql)).rows;
  const enrollment = async (who = user) => (await rows(`select status, progress_percent::float as progress, completed_at from enrollments where user_id = '${who}'`))[0];
  const complete = async (who = user) => (await rows(`select is_completed from module_progress where user_id = '${who}' and module_id = '${module}'`))[0]?.is_completed;
  try {
    await db.exec(`
      create type enrollment_status as enum ('asignado', 'en_progreso', 'completado');
      create table enrollments (user_id uuid, course_id uuid, status enrollment_status default 'asignado', progress_percent numeric default 0, started_at timestamptz, completed_at timestamptz, unique(user_id, course_id));
      create table modules (id uuid primary key, course_id uuid, is_published boolean default true);
      create table assets (id uuid primary key, module_id uuid, course_id uuid, type text);
      create table exams (id uuid primary key, module_id uuid, course_id uuid, is_active boolean default true, blocks_progress boolean default true);
      create table exam_attempts (id int generated always as identity, exam_id uuid, user_id uuid, passed boolean, finished_at timestamptz);
      create table module_progress (user_id uuid, module_id uuid, is_completed boolean, completed_at timestamptz, updated_at timestamptz, unique(user_id, module_id));
      create table video_progress (user_id uuid, asset_id uuid, completed boolean, unique(user_id, asset_id));
      create table resource_progress (user_id uuid, asset_id uuid, viewed_at timestamptz default now());
    `);
    const historical = source("supabase/migrations/014_resource_progress.sql");
    await db.exec(historical.slice(historical.indexOf("create or replace function public.recalculate_enrollment_progress")));
    await db.exec(source("supabase/migrations/016_video_progress_refresh.sql"));
    const automation = source("supabase/migrations/006_platform_automation.sql");
    await db.exec(automation.slice(automation.indexOf("create or replace function public.refresh_progress_from_exam")));
    await db.exec(`
      insert into modules values ('${module}', '${course}', true);
      insert into assets values ('${video}', '${module}', null, 'video'), ('${resource}', '${module}', null, 'pdf');
      insert into exams values
        ('${blocking}', '${module}', null, true, true),
        ('${nonblocking}', '${module}', null, true, false),
        ('${inactive}', '${module}', null, false, true),
        ('${final}', null, '${course}', true, true);
      insert into enrollments (user_id, course_id, status, progress_percent, completed_at) values
        ('${user}', '${course}', 'en_progreso', 0, null),
        ('${other}', '${course}', 'completado', 100, now()),
        ('${assigned}', '${course}', 'asignado', 0, null);
      insert into exam_attempts (exam_id, user_id, passed, finished_at) values
        ('${blocking}', '${user}', true, now()), ('${nonblocking}', '${user}', true, now()),
        ('${blocking}', '${other}', true, now()), ('${nonblocking}', '${other}', false, now()),
        ('${blocking}', '${assigned}', true, now()), ('${nonblocking}', '${assigned}', true, now());
      update enrollments set status = 'completado', progress_percent = 100, completed_at = now() where user_id = '${other}';
      delete from module_progress;
    `);
    const migration = source("supabase/migrations/021_completion_authority.sql");
    await db.exec(migration);
    assert.equal(await complete(), true, "passed evaluations override unread video/PDF");
    assert.equal(await complete(other), false, "nonblocking active evaluations still count toward completion");
    assert.equal(await complete(assigned), true, "backfill covers every enrollment, not just active video users");
    assert.deepEqual(await enrollment(), { status: "en_progreso", progress: 99, completed_at: null });
    assert.deepEqual(await enrollment(other), { status: "en_progreso", progress: 0, completed_at: null });
    await db.exec(`update exam_attempts set passed = true where user_id = '${other}' and exam_id = '${nonblocking}'`);
    assert.equal(await complete(other), true, "exam approval UPDATE trigger recalculates");
    await db.exec(`insert into exam_attempts (exam_id, user_id, passed, finished_at) values ('${final}', '${user}', false, now())`);
    assert.equal((await enrollment()).status, "en_progreso", "submission alone never passes");
    await db.exec(`insert into exam_attempts (exam_id, user_id, passed, finished_at) values ('${final}', '${user}', true, now())`);
    const completed = await enrollment();
    assert.equal(completed.status, "completado");
    assert.equal(completed.progress, 100);
    assert.ok(completed.completed_at);
    await db.exec(`insert into exam_attempts (exam_id, user_id, passed, finished_at) values ('${nonblocking}', '${user}', false, now())`);
    assert.equal((await enrollment()).status, "completado", "later failure does not erase a previous approval");
    await db.exec(migration);
    assert.deepEqual(await enrollment(), completed, "backfill is idempotent and retains completion date");
    await db.exec(`update exams set is_active = false where module_id = '${module}';
      select recalculate_enrollment_progress('${user}', '${course}')`);
    assert.equal(await complete(), false, "without active evaluations all resources are required");
    await db.exec(`insert into video_progress values ('${user}', '${video}', true)`);
    assert.equal(await complete(), false, "video alone does not complete an unread PDF");
    await db.exec(`insert into resource_progress (user_id, asset_id) values ('${user}', '${resource}')`);
    assert.equal(await complete(), true, "resource trigger completes a video-only certification path");
    await db.exec(`update module_progress set is_completed = false where user_id = '${user}';
      update video_progress set completed = true where user_id = '${user}'`);
    assert.equal(await complete(), true, "same completed=true video update repairs stale derived state");
  } finally {
    await db.close();
  }
});
