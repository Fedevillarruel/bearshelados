import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";

function load(file, mocks = {}) {
  const { outputText } = ts.transpileModule(fs.readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const loaded = { exports: {} };
  vm.runInNewContext(outputText, {
    module: loaded, exports: loaded.exports,
    require: (name) => {
      if (!Object.hasOwn(mocks, name)) throw new Error(`Unexpected dependency: ${name}`);
      return mocks[name];
    },
  });
  return loaded.exports;
}
const completion = load("lib/platform/completion.ts");

function fixture({ errorTable = null, extraAttempts = [] } = {}) {
  const calls = [];
  const modules = Array.from({ length: 10 }, (_, index) => ({
    id: `m${index + 1}`, course_id: "course", title: `Module ${index + 1}`, order_index: index, is_published: true,
  }));
  const tables = {
    courses: [{ id: "course", slug: "welcome", title: "Welcome", cover_storage_path: null }],
    modules,
    enrollments: [{ id: "enrollment", user_id: "learner", course_id: "course", status: "en_progreso", progress_percent: 40, completed_at: null }],
    exams: modules.map((module) => ({ id: `e${module.id}`, module_id: module.id, course_id: null, is_active: true, blocks_progress: true })),
    assets: modules.flatMap((module) => [
      { id: `v${module.id}`, module_id: module.id, course_id: null, type: "video", storage_path: null, duration_seconds: 180 },
      { id: `r${module.id}`, module_id: module.id, course_id: null, type: "pdf", storage_path: null },
    ]),
    exam_attempts: [
      ...extraAttempts,
      ...[1, 2, 3, 4, 8].map((index) => ({ id: `pass-${index}`, user_id: "learner", exam_id: `em${index}`, passed: true })),
      { id: "failed-later", user_id: "learner", exam_id: "em4", passed: false },
      { id: "another-learner", user_id: "another", exam_id: "em5", passed: true },
    ],
    video_progress: [{ asset_id: "vm4", user_id: "learner", completed: true }],
    resource_progress: [],
  };
  const client = {
    from: (table) => {
      assert.notEqual(table, "module_progress", "must not trust stale derived module rows");
      let filters = [];
      const result = () => ({ data: errorTable === table ? null : (tables[table] ?? []).filter((row) => filters.every((filter) => filter(row))), error: errorTable === table ? { message: "offline" } : null });
      const query = {
        select: () => query,
        eq: (key, value) => { filters.push((row) => row[key] === value); return query; },
        in: (key, values) => { filters.push((row) => values.includes(row[key])); return query; },
        is: (key, value) => { filters.push((row) => row[key] === value); return query; },
        order: () => query,
        range: async (start, end) => { calls.push({ table, start, end }); const response = result(); return { ...response, data: response.data?.slice(start, end + 1) ?? null }; },
        maybeSingle: async () => { const response = result(); return { ...response, data: response.data?.[0] ?? null }; },
        then: (resolve, reject) => Promise.resolve(result()).then(resolve, reject),
      };
      return query;
    },
  };
  const employee = load("lib/platform/employee.ts", {
    "@/lib/supabase/server": { createClient: async () => client },
    "@/lib/supabase/admin": { createAdminClient: () => client },
    "@/lib/platform/completion": completion,
  });
  return { client, employee, modules, calls, tables };
}

test("screenshot regression: approved evaluation, completed video and unread PDF still mark module and fix 40% to 50%", async () => {
  for (const previewAdminId of [undefined, "admin"]) {
    const h = fixture();
    const viewer = { id: "learner", previewAdminId };
    const data = await h.employee.getEmployeeCourseModule(viewer, "welcome", "m4");
    assert.equal(data.completedExamIds.includes("em4"), true);
    assert.equal(data.assets.find((asset) => asset.id === "vm4").isCompleted, true);
    assert.equal(data.assets.find((asset) => asset.id === "rm4").isCompleted, false);
    assert.equal(data.completedModuleIds.includes("m4"), true);
    assert.equal(data.completedModuleIds.includes("m8"), true, "other modules are verified too");
    assert.equal(data.completedModuleIds.includes("m5"), false, "another user's pass cannot count");
    assert.equal(data.enrollment.progress_percent, 50);
    const [course] = await h.employee.getEmployeeCourses(viewer);
    assert.equal(course.enrollment.progress_percent, 50);
    assert.equal(h.tables.enrollments[0].progress_percent, 40, "readonly reconciliation must never mutate stored progress");
  }
});

test("all active exams are required; passed exams override video and later failures", () => {
  const base = {
    modules: [{ id: "m" }],
    exams: [{ id: "e1", module_id: "m", blocks_progress: true }, { id: "e2", module_id: "m", blocks_progress: false }],
    assets: [{ id: "v", module_id: "m", type: "video" }],
    completedVideoIds: [], viewedResourceIds: [],
  };
  assert.equal(completion.calculateCourseCompletion({ ...base, passedExamIds: ["e1"] }).isCompleted, false);
  const passed = completion.calculateCourseCompletion({ ...base, passedExamIds: ["e1", "e2"] });
  assert.equal(passed.isCompleted, true);
  assert.equal(passed.progressPercent, 100);
});

test("modules without exams still require videos/resources, final exam caps progress and empty courses stay incomplete", () => {
  const base = {
    modules: [{ id: "m" }], exams: [],
    assets: [{ id: "v", module_id: "m", type: "video" }, { id: "pdf", module_id: "m", type: "pdf" }],
    completedVideoIds: ["v"], viewedResourceIds: [], passedExamIds: [],
  };
  assert.equal(completion.calculateCourseCompletion(base).progressPercent, 0);
  const viewed = { ...base, viewedResourceIds: ["pdf"] };
  assert.equal(completion.calculateCourseCompletion(viewed).progressPercent, 100);
  const final = { ...viewed, exams: [{ id: "final", module_id: null, blocks_progress: true }] };
  assert.equal(completion.calculateCourseCompletion(final).progressPercent, 99);
  assert.equal(completion.calculateCourseCompletion({ ...final, passedExamIds: ["final"] }).isCompleted, true);
  assert.equal(completion.calculateCourseCompletion({ ...base, modules: [] }).isCompleted, false);
});

test("older approvals beyond 1000 attempts are read and inactive exams do not count", async () => {
  const extraAttempts = Array.from({ length: 1000 }, (_, index) => ({
    id: `duplicate-${index}`, exam_id: "em1", user_id: "learner", passed: true,
  }));
  const h = fixture({ extraAttempts });
  h.tables.exams.push({ id: "inactive", module_id: "m4", is_active: false, blocks_progress: true });
  const result = await completion.getCourseCompletion(h.client, "learner", "course", h.modules);
  assert.equal(result.completedModuleIds.includes("m4"), true);
  assert.ok(h.calls.some((call) => call.table === "exam_attempts" && call.start === 1000));
});

test("evidence read failures are explicit instead of falsely showing incomplete modules", async () => {
  for (const errorTable of ["exams", "assets", "exam_attempts", "video_progress", "resource_progress"]) {
    const h = fixture({ errorTable });
    await assert.rejects(completion.getCourseCompletion(h.client, "learner", "course", h.modules), /No pudimos verificar/);
  }
});

test("stale stored completion cannot produce a certificate while an active evaluation is pending", async () => {
  const h = fixture();
  Object.assign(h.tables.enrollments[0], { status: "completado", progress_percent: 100, completed_at: "2026-10-10T12:00:00Z" });
  const [course] = await h.employee.getEmployeeCourses({ id: "learner" });
  assert.equal(course.enrollment.status, "en_progreso");
  assert.equal(course.enrollment.progress_percent, 50);
  assert.equal(course.enrollment.completed_at, null);
});
