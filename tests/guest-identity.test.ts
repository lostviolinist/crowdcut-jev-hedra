import assert from "node:assert/strict";
import { test } from "node:test";
import { guestIdentity } from "../lib/guest-identity";

test("anonymous visitors keep a signed nickname and cannot forge a session", async () => {
  const previous = process.env.CROWDCUT_GUEST_SECRET;
  process.env.CROWDCUT_GUEST_SECRET = "test-secret-with-at-least-thirty-two-characters";
  try {
    const base = { "cf-connecting-ip": "203.0.113.8" };
    const created = await guestIdentity(new Request("https://example.test/api/live", { headers: base }), true);
    assert.ok(created?.setCookie);
    assert.match(created.name, /^[a-z]+_[a-z]+[0-9a-f]{4}$/);
    assert.ok(created.ipPrefix);
    const cookie = created.setCookie.split(";")[0];
    const returned = await guestIdentity(new Request("https://example.test/api/live/comments", { headers: { ...base, cookie } }), false);
    assert.equal(returned?.name, created.name);
    assert.equal(returned?.userId, created.userId);
    assert.equal(returned?.setCookie, undefined);
    const forged = `${cookie.slice(0, -1)}${cookie.endsWith("0") ? "1" : "0"}`;
    assert.equal(await guestIdentity(new Request("https://example.test/api/live/comments", { headers: { ...base, cookie: forged } }), false), null);
    assert.equal(await guestIdentity(new Request("https://example.test/api/live/comments", { headers: base }), false), null);
  } finally {
    if (previous === undefined) delete process.env.CROWDCUT_GUEST_SECRET;
    else process.env.CROWDCUT_GUEST_SECRET = previous;
  }
});
