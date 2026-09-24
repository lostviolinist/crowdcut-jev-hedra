import assert from "node:assert/strict";
import { test } from "node:test";

import { makeLiveComment, makeLiveName } from "../lib/demo-comments";
import { formatAudienceActionLabel } from "../lib/story-ideas";

test("each scene gets 75 distinct generated comments and handles", () => {
  for (let round = 1; round <= 100; round++) {
    const comments = Array.from({ length: 75 }, (_, offset) => makeLiveComment(offset, round));
    const names = Array.from({ length: 75 }, (_, offset) => makeLiveName((round - 1) * 75 + offset, round));
    assert.equal(new Set(comments.map((comment) => comment.trim().toLowerCase())).size, 75, `round ${round} comments`);
    assert.equal(new Set(names).size, 75, `round ${round} handles`);
    assert.ok(names.every((name) => name.length <= 24));
  }
});

test("long renders keep receiving distinct comments beyond the first 75", () => {
  for (let round = 1; round <= 20; round++) {
    const comments = Array.from({ length: 500 }, (_, index) => makeLiveComment(index, round));
    assert.equal(new Set(comments.map((comment) => comment.trim().toLowerCase())).size, 500, `round ${round}`);
  }
});

test("early scenes do not reuse a generated comment", () => {
  const comments = Array.from({ length: 400 }, (_, index) => makeLiveComment(index));
  assert.equal(new Set(comments.map((comment) => comment.trim().toLowerCase())).size, comments.length);
});

test("live rounds introduce new visual directions instead of the same dialogue", () => {
  const firstRound = Array.from({ length: 75 }, (_, index) => makeLiveComment(index, 1)).join(" ");
  const secondRound = Array.from({ length: 75 }, (_, index) => makeLiveComment(index, 2)).join(" ");
  assert.match(firstRound, /paper bird/);
  assert.match(secondRound, /moving floor tiles/);
  assert.doesNotMatch(firstRound + secondRound, /ask the castle (?:where|to find) her friend/i);
});

test("live chat mixes distinct ideas and speech patterns without drowning out Jev's voting clusters", () => {
  for (let round = 1; round <= 12; round++) {
    const comments = Array.from({ length: 75 }, (_, offset) => makeLiveComment(offset, round));
    const labels = comments.map(formatAudienceActionLabel);
    const repeated = new Map<string, number>();
    for (const label of labels) repeated.set(label, (repeated.get(label) || 0) + 1);
    const openings = new Set(comments.map((comment) => comment.toLowerCase().split(/\s+/).slice(0, 3).join(" ")));
    assert.ok(repeated.size >= 50, `round ${round}: distinct ideas`);
    assert.ok(Math.max(...repeated.values()) <= 5, `round ${round}: no idea monopolizes chat`);
    assert.ok(openings.size >= 40, `round ${round}: varied phrasing`);
  }
});
