import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLinks } from "../src/lib/modules/projection/youtube";

test("a playlist wins over the videos and keeps the video as fallback", () => {
  assert.deepEqual(parseLinks("https://www.youtube.com/watch?v=h5z99EYHY4I&list=RDh5z99EYHY4I&start_radio=1"), {
    type: "playlist",
    listId: "RDh5z99EYHY4I",
    fallbackId: "h5z99EYHY4I",
  });
  assert.deepEqual(parseLinks("https://music.youtube.com/playlist?list=PLXFdlAjZei1o"), { type: "playlist", listId: "PLXFdlAjZei1o", fallbackId: undefined });
});

test("several videos, one per line, in any link format", () => {
  const text = "https://youtu.be/dQw4w9WgXcQ\nhttps://www.youtube.com/watch?v=h5z99EYHY4I\nyoutube.com/shorts/abcdefghijk";
  assert.deepEqual(parseLinks(text), { type: "videos", ids: ["dQw4w9WgXcQ", "h5z99EYHY4I", "abcdefghijk"] });
});

test("without YouTube links there is no source", () => {
  assert.equal(parseLinks(""), null);
  assert.equal(parseLinks("https://vimeo.com/123 hola"), null);
});
