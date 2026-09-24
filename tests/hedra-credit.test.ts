import assert from "node:assert/strict";
import test from "node:test";
import { isHedraCreditError } from "../lib/hedra";

test("recognizes a Hedra payment rejection as safe to retry after a top-up", () => {
  assert.equal(isHedraCreditError("Hedra request failed with status 402."), true);
  assert.equal(isHedraCreditError("Insufficient credits"), true);
  assert.equal(isHedraCreditError("insufficient balance"), true);
});

test("does not retry uncertain transport or model failures", () => {
  assert.equal(isHedraCreditError("The request timed out."), false);
  assert.equal(isHedraCreditError("Hedra request failed with status 500."), false);
});
