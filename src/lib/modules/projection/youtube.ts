// Parses YouTube links. No server dependencies: used by both the endpoint and the screen.

/** Playback source: a playlist (including "RD..." Mixes) or a queue of individual videos. */
export type Source = { type: "playlist"; listId: string; fallbackId?: string } | { type: "videos"; ids: string[] };

const VIDEO_ID = /^[\w-]{11}$/;

function videoId(url: URL): string | null {
  const host = url.hostname.replace(/^www\.|^m\.|^music\./, "");
  if (host === "youtu.be") return url.pathname.slice(1, 12) || null;
  if (host !== "youtube.com" && host !== "youtube-nocookie.com") return null;
  const v = url.searchParams.get("v");
  if (v) return v;
  // /embed/ID, /shorts/ID, /live/ID, /v/ID
  const m = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]{11})/);
  return m ? m[1] : null;
}

/** One or more links (one per line). If any of them has `list=`, the playlist wins. */
export function parseLinks(text: string): Source | null {
  const lines = text
    .split(/[\s,]+/)
    .map((l) => l.trim())
    .filter(Boolean);

  const ids: string[] = [];
  for (const line of lines) {
    if (VIDEO_ID.test(line)) {
      ids.push(line);
      continue;
    }
    let url: URL;
    try {
      url = new URL(line.startsWith("http") ? line : `https://${line}`);
    } catch {
      continue;
    }
    // If YouTube doesn't serve the playlist (private, or a Mix it won't share), the link's video plays.
    const list = url.searchParams.get("list");
    if (list && /^[\w-]+$/.test(list)) {
      const fallback = videoId(url);
      return { type: "playlist", listId: list, fallbackId: fallback && VIDEO_ID.test(fallback) ? fallback : undefined };
    }
    const id = videoId(url);
    if (id && VIDEO_ID.test(id)) ids.push(id);
  }
  return ids.length ? { type: "videos", ids } : null;
}
