import assert from "node:assert/strict";
import test from "node:test";

import { getSecureCookieOptions } from "./cookies";

test("keeps strict cookies by default and allows the OAuth return to use lax", () => {
  assert.equal(getSecureCookieOptions(60).sameSite, "strict");
  assert.equal(getSecureCookieOptions(60, "lax").sameSite, "lax");
});
