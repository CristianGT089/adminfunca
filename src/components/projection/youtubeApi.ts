"use client";

let apiPromise: Promise<typeof YT> | null = null;

/** Loads the YouTube IFrame API only once. */
export function loadYouTubeApi(): Promise<typeof YT> {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve) => {
    if (window.YT?.Player) return resolve(window.YT);
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(window.YT);
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(script);
  });
  return apiPromise;
}

declare global {
  interface Window {
    onYouTubeIframeAPIReady?: () => void;
  }
}
