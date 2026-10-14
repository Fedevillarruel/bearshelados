import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const requireDependency = createRequire(import.meta.url);

function loadModule(relativePath, mocks = {}) {
  const { outputText } = ts.transpileModule(fs.readFileSync(path.join(root, relativePath), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  });
  const loaded = { exports: {} };
  vm.runInNewContext(outputText, {
    module: loaded, exports: loaded.exports,
    require: (name) => Object.hasOwn(mocks, name) ? mocks[name] : requireDependency(name),
    ...mocks.globals,
  });
  return loaded.exports;
}

function nativeHarness(options = {}, readyState = 0) {
  const effects = [];
  const events = new Map();
  const documentEvents = new Map();
  const saved = [];
  const starts = [];
  const intervals = [];
  const document = { visibilityState: "visible", addEventListener: (name, callback) => documentEvents.set(name, callback), removeEventListener: (name) => documentEvents.delete(name) };
  let completedCalls = 0;
  const video = {
    currentTime: 0, duration: 60, readyState, paused: false, ended: false,
    addEventListener: (name, callback) => events.set(name, callback),
    removeEventListener: (name) => events.delete(name),
  };
  const hook = loadModule("src/hooks/use-video-tracking.ts", {
    react: {
      useRef: (value) => ({ current: value }),
      useEffect: (effect) => effects.push(effect),
    },
    "@/lib/video-ranges": loadModule("src/lib/video-ranges.ts"),
    "@/lib/video-progress-client": {
      startVideoProgress: async (id) => { starts.push(id); return options.startRequest ? options.startRequest() : true; },
      saveVideoProgress: async (input) => { saved.push(JSON.parse(JSON.stringify(input))); return options.saveRequest ? options.saveRequest() : true; },
    },
    globals: {
      document,
      window: { setInterval: (callback) => { intervals.push(callback); return 1; }, clearInterval: () => {} },
    },
  });
  const result = hook.useVideoTracking({
    assetId: "video-1", durationSeconds: 60, onCompleted: () => { completedCalls++; }, ...options,
  });
  result.videoRef.current = video;
  const cleanups = effects.map((effect) => effect());
  return {
    video, saved, starts, events, result,
    event: (name) => events.get(name)(),
    heartbeat: () => intervals.forEach((callback) => callback()),
    visibility: (value) => { document.visibilityState = value; documentEvents.get("visibilitychange")(); },
    completedCalls: () => completedCalls,
    cleanup: () => cleanups.forEach((cleanup) => cleanup?.()),
  };
}

test("completed native videos open at zero rather than seeking to the saved end", () => {
  const h = nativeHarness({ initialPosition: 60, initiallyCompleted: true, initialRanges: [[0, 60]] });
  h.event("loadedmetadata");
  assert.equal(h.video.currentTime, 0);
  h.cleanup();
});

test("incomplete videos resume and a saved end position starts over", () => {
  const pending = nativeHarness({ initialPosition: 23 });
  pending.event("loadedmetadata");
  assert.equal(pending.video.currentTime, 23);
  pending.cleanup();
  const atEnd = nativeHarness({ initialPosition: 60 });
  atEnd.event("loadedmetadata");
  assert.equal(atEnd.video.currentTime, 0);
  atEnd.cleanup();
});

test("cached metadata also applies the initial playback position", () => {
  const h = nativeHarness({ initialPosition: 60, initiallyCompleted: true }, 1);
  assert.equal(h.video.currentTime, 0);
  h.cleanup();
});

test("replaying a completed native video retains watched ranges and completion", async () => {
  const h = nativeHarness({ initialPosition: 60, initiallyCompleted: true, initialRanges: [[0, 60]] });
  h.event("loadedmetadata");
  h.event("play");
  h.video.currentTime = 5;
  h.event("pause");
  await new Promise(setImmediate);
  assert.equal(h.starts[0], "video-1");
  assert.deepEqual(h.saved[0].watchedRanges, [[0, 60]]);
  assert.equal(h.saved[0].lastPosition, 5);
  assert.equal(h.completedCalls(), 0);
  assert.equal(h.result.getProgressPercent(), 100);
  h.cleanup();
  assert.equal(h.events.size, 0);
});

test("native sampling records 2x playback between heartbeats and restores visible playback", async () => {
  const h = nativeHarness();
  h.event("play");
  for (let position = 2; position <= 30; position += 2) {
    h.video.currentTime = position;
    h.event("timeupdate");
  }
  h.visibility("hidden");
  await new Promise(setImmediate);
  h.video.currentTime = 45;
  h.visibility("visible");
  h.video.currentTime = 47;
  h.event("timeupdate");
  h.event("pause");
  await new Promise(setImmediate);
  assert.deepEqual(h.saved.at(-1).watchedRanges, [[0, 30], [45, 47]]);
  h.cleanup();
});

test("native terminal flush waits for start and drains progress recorded during an in-flight save", async () => {
  let started;
  let saved;
  let saves = 0;
  const h = nativeHarness({
    startRequest: () => new Promise((resolve) => { started = resolve; }),
    saveRequest: () => ++saves === 1 ? new Promise((resolve) => { saved = resolve; }) : false,
  });
  h.event("play");
  h.video.currentTime = 10;
  h.event("timeupdate");
  h.heartbeat();
  assert.equal(h.saved.length, 0);
  started(true);
  await new Promise(setImmediate);
  h.video.currentTime = 15;
  h.event("pause");
  assert.equal(h.saved.length, 1);
  saved(false);
  await new Promise(setImmediate);
  assert.equal(h.saved.length, 2);
  assert.deepEqual(h.saved[1].watchedRanges, [[0, 15]]);
  h.cleanup();
});

test("native ending after seeking does not invent a final watched second", async () => {
  const h = nativeHarness();
  h.event("play");
  h.video.currentTime = 60;
  h.event("seeking");
  h.event("ended");
  await new Promise(setImmediate);
  assert.equal(h.saved.length, 0);
  h.cleanup();
});

test("readonly native playback resumes and replays without saving or reporting completion", async () => {
  const h = nativeHarness({ readOnly: true, initialPosition: 12, initialRanges: [[0, 12]] });
  h.event("loadedmetadata");
  assert.equal(h.video.currentTime, 12);
  h.event("play");
  h.video.currentTime = 20;
  h.event("timeupdate");
  h.heartbeat();
  h.event("pause");
  h.visibility("hidden");
  h.visibility("visible");
  h.event("ended");
  h.cleanup();
  await new Promise(setImmediate);
  assert.equal(h.starts.length, 0);
  assert.equal(h.saved.length, 0);
  assert.equal(h.completedCalls(), 0);
  assert.equal(h.result.getProgressPercent(), 20);
});

function componentHarness(playFails = false) {
  const video = {
    currentTime: 60,
    play: async () => { if (playFails) throw new Error("Playback unavailable"); video.played = true; },
    load: () => { video.reloaded = true; },
  };
  let error = null;
  let refreshed = false;
  const jsx = (type, props) => ({ type, props });
  const component = loadModule("src/components/learning/native-video.tsx", {
    react: { useState: () => [null, (value) => { error = value; }] },
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "next/navigation": { useRouter: () => ({ refresh: () => { refreshed = true; } }) },
    "lucide-react": { PlayCircle: "icon", RotateCcw: "icon" },
    "@/hooks/use-video-tracking": { useVideoTracking: () => ({ videoRef: { current: video } }) },
  });
  const render = () => component.NativeVideo({ asset: { id: "video-1", url: "https://example.com/video.mp4", title: "Video", duration_seconds: 60, isCompleted: true } });
  return { video, render, error: () => error, refreshed: () => refreshed };
}

function find(tree, predicate) {
  if (!tree || typeof tree !== "object") return null;
  if (predicate(tree)) return tree;
  const children = tree.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const found = find(child, predicate);
    if (found) return found;
  }
  return null;
}

test("native replay control seeks to zero and requests playback even when completed", async () => {
  const h = componentHarness();
  const tree = h.render();
  const button = find(tree, (node) => node.type === "button");
  const player = find(tree, (node) => node.type === "video");
  assert.equal(player.props.controls, true);
  assert.equal(player.props.src, "https://example.com/video.mp4");
  assert.equal(player.props.disabled, undefined);
  await button.props.onClick();
  assert.equal(h.video.currentTime, 0);
  assert.equal(h.video.played, true);
  assert.equal(h.error(), null);
});

test("failed playback and source loading produce explicit errors", async () => {
  const h = componentHarness(true);
  const tree = h.render();
  await find(tree, (node) => node.type === "button").props.onClick();
  assert.match(h.error(), /No pudimos iniciar/);
  find(tree, (node) => node.type === "video").props.onError();
  assert.match(h.error(), /enlace puede haber vencido/);
});
