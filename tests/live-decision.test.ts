import assert from "node:assert/strict";
import { test } from "node:test";

import { readyToChooseScene } from "../lib/live-decision";

test("Jev waits for at least 12 classified comments", () => {
  assert.equal(readyToChooseScene(11, { votes: 10, audienceVotes: 3 }), false);
  assert.equal(readyToChooseScene(12, { votes: 4, audienceVotes: 0 }, { votes: 2, audienceVotes: 0 }), true);
});

test("a clear viewer preference can choose early", () => {
  assert.equal(readyToChooseScene(12, { votes: 2, audienceVotes: 2 }, { votes: 8, audienceVotes: 1 }), true);
  assert.equal(readyToChooseScene(12, { votes: 1, audienceVotes: 1 }, { votes: 4, audienceVotes: 0 }), false);
});

test("a scattered chat gets up to 24 classifications", () => {
  assert.equal(readyToChooseScene(23, { votes: 2, audienceVotes: 0 }, { votes: 2, audienceVotes: 0 }), false);
  assert.equal(readyToChooseScene(24, { votes: 2, audienceVotes: 0 }, { votes: 2, audienceVotes: 0 }), true);
  assert.equal(readyToChooseScene(24), false);
});
