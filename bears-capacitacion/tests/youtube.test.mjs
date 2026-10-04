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

function loadModule(relativePath, mocks = {}, globals = {}) {
  const source = fs.readFileSync(path.join(root, relativePath), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  });
  const loaded = { exports: {} };
  vm.runInNewContext(outputText, {
    module: loaded,
    exports: loaded.exports,
    URL,
    URLSearchParams,
    require: (name) => Object.hasOwn(mocks, name) ? mocks[name] : requireDependency(name),
    ...globals,
  }, { filename: relativePath });
  return loaded.exports;
}

const youtube = loadModule("src/lib/youtube.ts");
const id = "M7lc1UVf-VE";

test("recognizes common YouTube links and sharing parameters", () => {
  for (const url of [
    `https://www.youtube.com/watch?v=${id}&list=PLexample&t=30s`,
    `https://youtu.be/${id}?si=sharing`,
    `https://m.youtube.com/watch?v=${id}`,
    `https://www.youtube.com/shorts/${id}`,
    `https://www.youtube.com/live/${id}`,
    `https://www.youtube.com/embed/${id}`,
    `https://www.youtube-nocookie.com/embed/${id}`,
    `https://www.youtube.com/attribution_link?u=${encodeURIComponent(`/watch?v=${id}`)}`,
    `  https://youtu.be/${id}  `,
  ]) assert.equal(youtube.getYouTubeVideoId(url), id, url);
});

test("rejects channels, playlists without videos, invalid IDs, fake hosts and non-web protocols", () => {
  for (const url of [
    "https://youtube.com/@bears",
    "https://youtube.com/playlist?list=PLexample",
    "https://youtube.com/watch?v=short",
    `https://youtube.com.evil.example/watch?v=${id}`,
    `https://example.com/watch?v=${id}`,
    `ftp://youtube.com/watch?v=${id}`,
    "not a URL",
  ]) assert.equal(youtube.getYouTubeVideoId(url), null, url);
  assert.equal(youtube.isYouTubeUrl("https://youtube.com/@bears"), true);
  assert.equal(youtube.isYouTubeUrl(`ftp://youtube.com/watch?v=${id}`), false);
  assert.match(youtube.getYouTubeEmbedUrl(id), /^https:\/\/www\.youtube-nocookie\.com\/embed\//);
});

const courseId = "11111111-1111-4111-8111-111111111111";
const moduleId = "22222222-2222-4222-8222-222222222222";
const assetId = "33333333-3333-4333-8333-333333333333";

function courseActions() {
  const saved = [];
  const refreshed = [];
  const db = {
    from: (table) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { course_id: courseId } }) }) }),
      insert: (payload) => {
        saved.push({ table, payload });
        return { select: () => ({ single: async () => ({ data: { id: assetId } }) }) };
      },
    }),
  };
  const actions = loadModule("src/app/actions/courses.ts", {
    "next/cache": { revalidatePath: (value) => refreshed.push(value) },
    "@/lib/auth/roles": { requireRole: async () => ({ id: assetId }) },
    "@/lib/supabase/admin": { createAdminClient: () => { throw new Error("External YouTube videos must not use Storage"); } },
    "@/lib/supabase/server": { createClient: async () => db },
    "@/lib/validations/ids": { databaseUuid: z.string().guid() },
    "@/lib/youtube": youtube,
  });
  return { actions, saved, refreshed };
}

function videoInput(url) {
  return {
    courseId: null, moduleId, type: "video", title: "Inducción",
    description: null, url, storagePath: null, durationSeconds: 300,
    orderIndex: 1, isPrimary: true,
  };
}

test("saves an external YouTube video in a module without using Storage", async () => {
  const { actions, saved, refreshed } = courseActions();
  const response = await actions.saveAsset(videoInput(`https://youtu.be/${id}?si=example&t=30`));
  assert.equal(response.data.id, assetId);
  assert.equal(saved[0].payload.url, `https://www.youtube.com/watch?v=${id}`);
  assert.equal(saved[0].payload.module_id, moduleId);
  assert.equal(saved[0].payload.storage_path, null);
  assert.equal(saved[0].payload.is_primary, true);
  assert.equal(saved[0].payload.duration_seconds, 300);
  assert.ok(refreshed.includes(`/admin/cursos/${courseId}`));
});

test("rejects YouTube channels and playlists before persisting", async () => {
  for (const url of ["https://youtube.com/@bears", "https://youtube.com/playlist?list=PLexample"]) {
    const { actions, saved } = courseActions();
    const response = await actions.saveAsset(videoInput(url));
    assert.match(response.error, /enlace de un video de YouTube/);
    assert.equal(saved.length, 0);
  }
});

test("requires a real positive duration and preserves other video URLs", async () => {
  const { actions, saved } = courseActions();
  const response = await actions.saveAsset({ ...videoInput(`https://youtu.be/${id}`), durationSeconds: 0 });
  assert.match(response.error, /duración válida/);
  assert.equal(saved.length, 0);
  await actions.saveAsset(videoInput("https://example.com/video.mp4"));
  assert.equal(saved[0].payload.url, "https://example.com/video.mp4");
});

async function trackingHarness(options = {}, apiAvailable = true) {
  const intervals = new Map();
  const timeouts = new Map();
  const listeners = new Map();
  const states = [];
  const effects = [];
  const saved = [];
  const starts = [];
  const players = [];
  let now = 0;
  let timerId = 0;
  let completed = false;
  let completedCalls = 0;
  function element() {
    return {
      children: [], attributes: {},
      appendChild(child) { this.children.push(child); },
      replaceChildren() { this.children = []; },
      setAttribute(key, value) { this.attributes[key] = value; },
    };
  }
  const container = element();
  const document = {
    visibilityState: "visible",
    createElement: element,
    getElementById: () => null,
    head: element(),
    addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener: (name) => listeners.delete(name),
  };
  class Player {
    constructor(target, config) {
      this.target = target;
      this.config = config;
      this.position = 0;
      this.state = 1;
      this.iframe = element();
      players.push(this);
    }
    getCurrentTime() { return this.position; }
    getPlayerState() { return this.state; }
    getPlaybackRate() { return 1; }
    getIframe() { return this.iframe; }
    seekTo(position) { this.position = position; }
    playVideo() { this.playRequested = true; }
    destroy() { this.destroyed = true; }
  }
  const window = {
    ...(apiAvailable ? { YT: { Player } } : {}),
    location: { origin: "https://bears.example" },
    setInterval: (callback, delay) => { const key = ++timerId; intervals.set(key, { callback, delay }); return key; },
    clearInterval: (key) => intervals.delete(key),
    setTimeout: (callback) => { const key = ++timerId; timeouts.set(key, callback); return key; },
    clearTimeout: (key) => timeouts.delete(key),
  };
  const hook = loadModule("src/hooks/use-youtube-video-tracking.ts", {
    react: {
      useRef: (value) => ({ current: value }),
      useState: (value) => {
        const index = states.length;
        states.push(value);
        return [value, (next) => { states[index] = next; }];
      },
      useEffect: (effect) => effects.push(effect),
    },
    "@/lib/video-ranges": loadModule("src/lib/video-ranges.ts"),
    "@/lib/video-progress-client": {
      saveVideoProgress: async (input) => { saved.push(JSON.parse(JSON.stringify(input))); return completed; },
      startVideoProgress: async (value) => { starts.push(value); return true; },
    },
  }, { window, document, Date: { now: () => now } });
  const result = hook.useYouTubeVideoTracking({
    assetId, videoId: id, durationSeconds: 60,
    onCompleted: () => { completedCalls++; }, ...options,
  });
  result.playerElementRef.current = container;
  const cleanups = effects.map((effect) => effect());
  await Promise.resolve();
  await Promise.resolve();
  const player = players[0];
  const settle = async () => { await Promise.resolve(); await Promise.resolve(); };
  return {
    player, container, states, saved, starts, document, window, timeouts,
    ready: () => player.config.events.onReady(),
    state: (value) => { player.state = value; player.config.events.onStateChange({ data: value }); },
    fail: (code) => player.config.events.onError({ data: code }),
    replay: result.replayVideo,
    tick: async (position, elapsed = 1000) => {
      now += elapsed;
      player.position = position;
      for (const timer of intervals.values()) if (timer.delay === 1000) timer.callback();
      await settle();
    },
    flush: async () => {
      for (const timer of intervals.values()) if (timer.delay === 15000) timer.callback();
      await settle();
    },
    visibility: (value) => { document.visibilityState = value; listeners.get("visibilitychange")(); },
    setCompleted: () => { completed = true; },
    completedCalls: () => completedCalls,
    cleanup: async () => { cleanups.forEach((cleanup) => cleanup?.()); await settle(); },
    settle,
  };
}

test("mounts YouTube inside a React-owned container and resumes saved position", async () => {
  const h = await trackingHarness({ initialPosition: 12 });
  assert.notEqual(h.player.target, h.container);
  assert.equal(h.container.children[0], h.player.target);
  h.ready();
  assert.equal(h.player.position, 12);
  assert.equal(h.states[0], true);
  assert.equal(h.player.config.host, "https://www.youtube-nocookie.com");
  assert.equal(h.player.config.playerVars.origin, "https://bears.example");
  assert.equal(h.player.iframe.attributes.referrerpolicy, "strict-origin-when-cross-origin");
  await h.cleanup();
  assert.equal(h.player.destroyed, true);
  assert.equal(h.container.children.length, 0);
});

test("records viewing, excludes a seek, and only reports server-confirmed completion once", async () => {
  const h = await trackingHarness();
  h.ready();
  h.state(1);
  await h.tick(1);
  await h.tick(2);
  await h.tick(40);
  await h.tick(41);
  await h.flush();
  assert.deepEqual(h.saved.at(-1).watchedRanges, [[0, 2], [40, 41]]);
  assert.equal(h.starts[0], assetId);
  assert.equal(h.completedCalls(), 0);
  h.setCompleted();
  await h.flush();
  await h.flush();
  assert.equal(h.completedCalls(), 1);
  await h.cleanup();
});

test("completed YouTube videos start at zero and can replay without clearing watched ranges", async () => {
  const h = await trackingHarness({ initiallyCompleted: true, initialPosition: 60, initialRanges: [[0, 60]] });
  h.ready();
  assert.equal(h.player.position, 0);
  h.player.position = 60;
  h.replay();
  assert.equal(h.player.position, 0);
  assert.equal(h.player.playRequested, true);
  h.state(1);
  await h.tick(1);
  await h.flush();
  assert.deepEqual(h.saved.at(-1).watchedRanges, [[0, 60]]);
  h.setCompleted();
  await h.flush();
  assert.equal(h.completedCalls(), 0);
  await h.cleanup();
});

test("resumes tracking when returning from a hidden tab without counting hidden playback", async () => {
  const h = await trackingHarness();
  h.ready();
  h.state(1);
  await h.tick(1);
  h.visibility("hidden");
  await h.tick(15, 14000);
  h.visibility("visible");
  await h.tick(16);
  await h.flush();
  assert.deepEqual(h.saved.at(-1).watchedRanges, [[0, 1], [15, 16]]);
  await h.cleanup();
});

test("ending after a seek does not fabricate watched ranges", async () => {
  const h = await trackingHarness();
  h.ready();
  h.state(1);
  await h.tick(1);
  await h.tick(60);
  h.state(0);
  await h.settle();
  assert.deepEqual(h.saved.at(-1).watchedRanges, [[0, 1]]);
  assert.equal(h.completedCalls(), 0);
  await h.cleanup();
});

test("reports private, deleted and embedding-disabled videos explicitly", async () => {
  for (const [code, message] of [[100, /privado/], [101, /Permitir inserción/], [150, /Permitir inserción/], [153, /No pudimos reproducir/]]) {
    const h = await trackingHarness();
    h.ready();
    h.fail(code);
    assert.match(h.states[1], message);
    await h.cleanup();
  }
});

test("slow loading reports a timeout and recovers on a late ready event", async () => {
  const h = await trackingHarness();
  for (const callback of h.timeouts.values()) callback();
  assert.match(h.states[1], /tardando/);
  h.ready();
  assert.equal(h.states[1], null);
  await h.cleanup();
});

test("does not call player methods before the iframe is ready", async () => {
  const h = await trackingHarness({ initialRanges: [[0, 10]], initialPosition: 10 });
  h.player.getCurrentTime = () => { throw new Error("Player is not ready"); };
  h.player.getPlayerState = () => { throw new Error("Player is not ready"); };
  await h.flush();
  h.visibility("hidden");
  h.visibility("visible");
  assert.equal(h.saved[0].lastPosition, 10);
  await h.cleanup();
});

test("ignores late player events after unmount", async () => {
  const h = await trackingHarness();
  await h.cleanup();
  h.ready();
  h.state(1);
  h.fail(100);
  assert.equal(h.states[0], false);
  assert.equal(h.states[1], null);
  assert.equal(h.starts.length, 0);
});

test("reports iframe API loading failure", async () => {
  const h = await trackingHarness({}, false);
  h.document.head.children[0].onerror();
  await h.settle();
  assert.match(h.states[1], /no pudo cargar/);
  await h.cleanup();
});
