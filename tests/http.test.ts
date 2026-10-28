import { test } from "node:test";
import assert from "node:assert/strict";
import { queryLimit } from "../src/lib/core/http";

const url = (limit?: string) => new URL(`http://localhost/api/x${limit === undefined ? "" : `?limit=${limit}`}`);

test("queryLimit stays within [1, max] and falls back on invalid values", () => {
  assert.equal(queryLimit(url(), 200, 500), 200);
  assert.equal(queryLimit(url("50"), 200, 500), 50);
  assert.equal(queryLimit(url("100000"), 200, 500), 500);
  assert.equal(queryLimit(url("abc"), 200, 500), 200);
  assert.equal(queryLimit(url("-3"), 200, 500), 200);
  assert.equal(queryLimit(url("0"), 200, 500), 200);
  assert.equal(queryLimit(url(), 800, 500), 500);
});
