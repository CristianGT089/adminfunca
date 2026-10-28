import { test } from "node:test";
import assert from "node:assert/strict";

process.env.DATA_KEY = "clave-de-prueba-suficientemente-larga-0123456789";

// The key is read on every call, so it is enough to set it before using the functions.
import { encrypt, decrypt, searchHash, normalizeCode, mask } from "../src/lib/core/crypto";

test("normalizes documents and codes (spaces, dots, dashes, upper case)", () => {
  assert.equal(normalizeCode(" 1.012.345-678 "), "1012345678");
  assert.equal(normalizeCode("est-2026-0001"), "EST20260001");
});

test("the search hash is deterministic and independent of the format", () => {
  assert.equal(searchHash("1012345678"), searchHash("1.012.345.678"));
  assert.notEqual(searchHash("1012345678"), searchHash("1012345679"));
  assert.doesNotMatch(searchHash("1012345678"), /1012345678/);
});

test("encrypt and decrypt return the original text and the ciphertext does not contain it", () => {
  const c = encrypt("3001234567");
  assert.notEqual(c, "3001234567");
  assert.doesNotMatch(c, /3001234567/);
  assert.equal(decrypt(c), "3001234567");
  // Two encryptions of the same text are different (random IV).
  assert.notEqual(encrypt("x"), encrypt("x"));
});

test("decrypt returns null if the data is corrupt or the key changed", () => {
  assert.equal(decrypt("no.es.valido"), null);
  assert.equal(decrypt(null), null);
});

test("mask only keeps the last digits", () => {
  assert.equal(mask("5678"), "••••5678");
});
