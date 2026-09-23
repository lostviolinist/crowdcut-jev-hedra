import assert from "node:assert/strict";
import { test } from "node:test";

import { formatAudienceActionLabel, normalizeAudienceAction } from "../lib/story-ideas";

test("audience ideas appear as concise actions, not verbatim chat", () => {
  const samples = [
    ["she could ask the door maybe", "Ask the door"],
    ["chat, hear me out: search the tower for a signal", "Search the tower for a signal"],
    ["what if she tries to pull the brass lever beneath the floor?", "Pull the brass lever beneath the floor"],
    ["does anyone else want her to follow the staircase down instead?", "Follow the staircase down instead"],
    ["my vote is to open the music box with the missing tune", "Open the music box with the missing tune"],
    ["plot twist: she should enter the room where yesterday is still happening", "Enter the room where yesterday is still happening"],
    ["i think she needs to climb the staircase hidden behind the fireplace", "Climb the staircase hidden behind the fireplace"],
    ["no wait, follow the paper bird into the rafters", "Follow the paper bird into the rafters"],
  ];
  for (const [comment, expected] of samples) {
    assert.equal(normalizeAudienceAction(comment, true), expected, comment);
    assert.equal(formatAudienceActionLabel(comment), expected, comment);
  }
});

test("existing stored chat-like labels are cleaned without collapsing specific ideas", () => {
  assert.equal(formatAudienceActionLabel("Chat, hear me out: ask the door which way is safe"), "Ask the door which way is safe");
  assert.equal(formatAudienceActionLabel("She could ask the castle for a map maybe"), "Ask the castle for a map");
  assert.notEqual(normalizeAudienceAction("ask the door which way is safe", true), normalizeAudienceAction("ask the castle for a map", true));
  assert.equal(normalizeAudienceAction("please follow my account"), null);
});
