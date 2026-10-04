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

function loadModule(relativePath, mocks = {}, globals = {}) {
  const { outputText } = ts.transpileModule(fs.readFileSync(path.join(root, relativePath), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  });
  const loaded = { exports: {} };
  vm.runInNewContext(outputText, {
    module: loaded, exports: loaded.exports, URL, Error,
    require: (name) => Object.hasOwn(mocks, name) ? mocks[name] : requireDependency(name),
    ...globals,
  });
  return loaded.exports;
}

const duration = loadModule("src/lib/duration.ts");
const youtube = loadModule("src/lib/youtube.ts");
const videoId = "M7lc1UVf-VE";

test("hours, minutes and seconds round-trip without changing the database unit", () => {
  for (const [parts, total] of [
    [{ hours: 0, minutes: 0, seconds: 0 }, 0],
    [{ hours: 0, minutes: 5, seconds: 0 }, 300],
    [{ hours: 1, minutes: 15, seconds: 30 }, 4530],
    [{ hours: 2, minutes: 0, seconds: 1 }, 7201],
    [{ hours: 596523, minutes: 14, seconds: 7 }, duration.maxDurationSeconds],
  ]) {
    assert.equal(duration.durationInSeconds(parts), total);
    assert.deepEqual(JSON.parse(JSON.stringify(duration.splitDuration(total))), parts);
  }
});

test("rejects negative, fractional, infinite and overflowing durations", () => {
  for (const invalid of [-1, 1.5, Infinity, NaN, duration.maxDurationSeconds + 1])
    assert.throws(() => duration.splitDuration(invalid), /duración/);
  for (const invalid of [-1, 1.5, Infinity, NaN, 596524])
    assert.throws(() => duration.durationInSeconds({ hours: invalid, minutes: 0, seconds: 0 }));
});

function componentHarness({ url = `https://youtu.be/${videoId}`, value = "0", seconds = 4530.2, apiFails = false } = {}) {
  const refs = [];
  const states = [];
  const effects = [];
  const intervals = new Map();
  const timeouts = new Map();
  const players = [];
  const changes = [];
  let refIndex = 0;
  let stateIndex = 0;
  let timerId = 0;
  let currentValue = value;
  let currentUrl = url;
  const container = { children: [], appendChild(child) { this.children.push(child); }, replaceChildren() { this.children = []; } };
  const window = {
    location: { origin: "https://bears.example" },
    setInterval: (callback) => { const id = ++timerId; intervals.set(id, callback); return id; },
    clearInterval: (id) => intervals.delete(id),
    setTimeout: (callback) => { const id = ++timerId; timeouts.set(id, callback); return id; },
    clearTimeout: (id) => timeouts.delete(id),
  };
  const document = { createElement: () => ({}) };
  class Player {
    constructor(target, config) {
      this.target = target;
      this.config = config;
      this.duration = seconds;
      players.push(this);
    }
    getDuration() { return this.duration; }
    getIframe() { return { setAttribute: () => {} }; }
    destroy() { this.destroyed = true; }
  }
  const jsx = (type, props) => ({ type, props });
  const component = loadModule("src/components/admin/video-duration-input.tsx", {
    react: {
      useRef: (initial) => {
        const index = refIndex++;
        refs[index] ??= { current: initial };
        return refs[index];
      },
      useState: (initial) => {
        const index = stateIndex++;
        if (!(index in states)) states[index] = initial;
        return [states[index], (value) => { states[index] = typeof value === "function" ? value(states[index]) : value; }];
      },
      useEffect: (effect) => effects.push(effect),
    },
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "@/lib/duration": duration,
    "@/lib/youtube": youtube,
    "@/lib/youtube-iframe-api": { loadYouTubeIframeApi: async () => {
      if (apiFails) throw new Error("API unavailable");
      return { Player };
    } },
  }, { window, document });
  const render = () => {
    refIndex = 0;
    stateIndex = 0;
    effects.length = 0;
    return component.VideoDurationInput({
      id: "duration", value: currentValue, youtubeUrl: currentUrl,
      onChange: (value) => { currentValue = value; changes.push(value); },
    });
  };
  let tree = render();
  refs[0].current = container;
  const mount = async () => {
    const cleanups = effects.map((effect) => effect());
    await Promise.resolve();
    await Promise.resolve();
    return () => cleanups.forEach((cleanup) => cleanup?.());
  };
  const rerender = () => { tree = render(); return tree; };
  return {
    mount, rerender, states, players, changes, intervals, timeouts, container,
    tree: () => tree,
    value: () => currentValue,
    setUrl: (value) => { currentUrl = value; },
    ready: () => players.at(-1).config.events.onReady(),
    fail: () => players.at(-1).config.events.onError({ data: 100 }),
    poll: () => [...intervals.values()].forEach((callback) => callback()),
    timeout: () => [...timeouts.values()].forEach((callback) => callback()),
  };
}

function find(tree, predicate) {
  if (!tree || typeof tree !== "object") return null;
  if (predicate(tree)) return tree;
  const children = tree.props?.children;
  for (const child of Array.isArray(children) ? children.flat() : [children]) {
    const found = find(child, predicate);
    if (found) return found;
  }
  return null;
}

function enter(h, part, value, valid = true) {
  find(h.tree(), (node) => node.props?.id === `duration-${part}`).props.onChange({
    target: { value, validity: { valid } },
  });
  h.rerender();
}

test("duration fields show existing seconds as hours/minutes/seconds and save edits as seconds", async () => {
  const h = componentHarness({ value: "4530", url: "" });
  const cleanup = await h.mount();
  assert.equal(find(h.tree(), (node) => node.props?.id === "duration-hours").props.value, 1);
  assert.equal(find(h.tree(), (node) => node.props?.id === "duration-minutes").props.value, 15);
  assert.equal(find(h.tree(), (node) => node.props?.id === "duration-seconds").props.value, 30);
  enter(h, "hours", "2");
  assert.equal(h.value(), "8130");
  enter(h, "minutes", "20");
  assert.equal(h.value(), "8430");
  enter(h, "seconds", "45");
  assert.equal(h.value(), "8445");
  assert.equal(h.players.length, 0);
  cleanup();
});

test("automatic YouTube duration is rounded up and shown in the same fields", async () => {
  const h = componentHarness();
  const cleanup = await h.mount();
  h.ready();
  h.rerender();
  assert.equal(h.value(), "4531");
  assert.match(h.states[0], /obtenida de YouTube/);
  assert.equal(h.players[0].config.playerVars.autoplay, undefined);
  assert.equal(h.players[0].config.playerVars.origin, "https://bears.example");
  assert.equal(h.intervals.size, 0);
  assert.equal(h.timeouts.size, 0);
  cleanup();
  assert.equal(h.players[0].destroyed, true);
});

test("delayed metadata is polled without playing the video", async () => {
  const h = componentHarness({ seconds: 0 });
  const cleanup = await h.mount();
  h.ready();
  assert.equal(h.changes.length, 0);
  h.players[0].duration = 300;
  h.poll();
  assert.equal(h.value(), "300");
  cleanup();
});

test("a manual edit during detection takes precedence over late metadata", async () => {
  const h = componentHarness({ seconds: 0 });
  const cleanup = await h.mount();
  h.ready();
  enter(h, "minutes", "5");
  h.players[0].duration = 900;
  h.poll();
  assert.equal(h.value(), "300");
  assert.match(h.states[0], /conservó/);
  cleanup();
});

test("invalid input and overflowing totals show an error without changing the value", async () => {
  const h = componentHarness({ url: "", value: "4530" });
  const cleanup = await h.mount();
  enter(h, "minutes", "60", false);
  assert.match(h.states[1], /entre 0 y 59/);
  assert.equal(h.value(), "4530");
  enter(h, "hours", "596523");
  assert.match(h.states[1], /duración/);
  assert.equal(h.value(), "4530");
  cleanup();
});

test("private videos, blocked API and metadata timeouts retain manual duration", async () => {
  for (const mode of ["video-error", "api-error", "timeout"]) {
    const h = componentHarness({ value: "300", seconds: 0, apiFails: mode === "api-error" });
    const cleanup = await h.mount();
    if (mode === "video-error") h.fail();
    if (mode === "timeout") { h.ready(); h.timeout(); }
    assert.match(h.states[0], /manual/i);
    assert.equal(h.value(), "300");
    cleanup();
  }
});

test("switching videos or unmounting discards stale metadata", async () => {
  const h = componentHarness({ seconds: 600 });
  const cleanup = await h.mount();
  const oldPlayer = h.players[0];
  cleanup();
  h.setUrl("https://youtu.be/dQw4w9WgXcQ");
  h.rerender();
  const cleanupNext = await h.mount();
  oldPlayer.config.events.onReady();
  assert.equal(h.changes.length, 0);
  h.ready();
  assert.equal(h.value(), "600");
  cleanupNext();
});

test("retrying YouTube can replace a manual duration when explicitly requested", async () => {
  const h = componentHarness({ value: "300", seconds: 0 });
  const cleanup = await h.mount();
  h.ready();
  h.timeout();
  h.rerender();
  find(h.tree(), (node) => node.type === "button").props.onClick();
  cleanup();
  h.rerender();
  const cleanupRetry = await h.mount();
  h.players.at(-1).duration = 450;
  h.ready();
  assert.equal(h.value(), "450");
  assert.match(h.states[0], /obtenida/);
  cleanupRetry();
});

test("non-YouTube video URLs preserve manual duration without calling the API", async () => {
  const h = componentHarness({ url: "https://example.com/video.mp4", value: "7200" });
  const cleanup = await h.mount();
  assert.equal(h.players.length, 0);
  assert.equal(h.value(), "7200");
  assert.equal(h.intervals.size, 0);
  assert.equal(h.timeouts.size, 0);
  cleanup();
});
