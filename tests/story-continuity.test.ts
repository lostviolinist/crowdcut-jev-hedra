import assert from "node:assert/strict";
import { test } from "node:test";

import { buildStoryInput } from "../lib/hedra";
import { locateSceneAtMs, sceneDurationMs, sceneStartMs, storyDurationMs } from "../lib/story-timeline";

test("timeline cuts playback at the same frames used to begin the next scenes", () => {
  const scenes = [{ cut_ms: 7650 }, { cut_ms: 7200 }, { cut_ms: 8000 }];
  assert.equal(sceneDurationMs(scenes[0]), 7650);
  assert.equal(sceneStartMs(scenes, 1), 7650);
  assert.equal(storyDurationMs(scenes), 22850);
  assert.deepEqual(locateSceneAtMs(scenes, 7649), { index: 0, offsetMs: 7649 });
  assert.deepEqual(locateSceneAtMs(scenes, 7650), { index: 1, offsetMs: 0 });
  assert.deepEqual(locateSceneAtMs(scenes, 14850), { index: 2, offsetMs: 0 });
  assert.deepEqual(locateSceneAtMs(scenes, 99999), { index: 2, offsetMs: 7999 });
});

test("older or invalid cuts retain eight-second playback", () => {
  assert.equal(sceneDurationMs({ cut_ms: null }), 8000);
  assert.equal(sceneDurationMs({ cut_ms: 0 }), 8000);
  assert.deepEqual(locateSceneAtMs([], 1000), { index: 0, offsetMs: 0 });
});

test("later prompts carry ordered audience memory without resetting to the opening", () => {
  const prompt = buildStoryInput("Ask the castle for help", "fastest", "https://example.com/start.png", {
    sceneNumber: 4,
    previousActions: ["Follow his shadow", "Look under the stairs", "Examine the key"],
  }).prompt;
  assert.match(prompt, /This is scene 4/);
  assert.match(prompt, /1\. Follow his shadow; 2\. Look under the stairs; 3\. Examine the key/);
  assert.match(prompt, /The audience's new direction is: Ask the castle for help/);
  assert.match(prompt, /image is the visual truth/);
  assert.match(prompt, /movement, discovery, and visual consequences/);
  assert.match(prompt, /end on a clear, steady frame/);
  assert.doesNotMatch(prompt, /She opens its ornate door/);
});

test("the first scene still receives the opening story", () => {
  const prompt = buildStoryInput("Enter the castle", "fastest", "https://example.com/opening.png", {
    sceneNumber: 1,
    previousActions: [],
  }).prompt;
  assert.match(prompt, /She opens its ornate door/);
});
