"use client";

import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import type { Source } from "@/lib/modules/projection/youtube";
import { loadYouTubeApi } from "./youtubeApi";

export type PlaybackInfo = { title: string; index: number; total: number; playing: boolean };

export type PlayerControl = {
  next(): void;
  previous(): void;
  togglePause(): void;
  unmute(): void;
};

type Props = {
  source: Source;
  shuffle: boolean;
  onInfo: (info: PlaybackInfo) => void;
  onNotice: (message: string | null) => void;
  onMuted: (muted: boolean) => void;
  ref?: Ref<PlayerControl>;
};

type PlayerWithData = YT.Player & { getVideoData(): { title: string } };

export function Player({ source, shuffle, onInfo, onNotice, onMuted, ref }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const player = useRef<PlayerWithData | null>(null);

  // The callbacks live in a ref so the player isn't recreated when the parent re-renders.
  const cb = useRef({ onInfo, onNotice, onMuted });
  useEffect(() => {
    cb.current = { onInfo, onNotice, onMuted };
  });

  // Set by the effect: when the playlist ends it requests it again from YouTube (so new songs come in).
  const restart = useRef<() => void>(() => player.current?.playVideoAt(0));

  const advance = () => {
    const p = player.current;
    if (!p) return;
    const total = p.getPlaylist()?.length ?? 1;
    const i = p.getPlaylistIndex();
    if (total <= 1 && source.type === "videos") {
      p.seekTo(0, true);
      p.playVideo();
    } else if (i >= total - 1) {
      restart.current();
    } else {
      p.nextVideo();
    }
  };

  useImperativeHandle(ref, () => ({
    next: advance,
    previous: () => player.current?.previousVideo(),
    togglePause: () => {
      const p = player.current;
      if (!p) return;
      if (p.getPlayerState() === YT.PlayerState.PLAYING) p.pauseVideo();
      else p.playVideo();
    },
    unmute: () => {
      const p = player.current;
      if (!p) return;
      p.unMute();
      p.setVolume(100);
      p.playVideo();
      cb.current.onMuted(false);
    },
  }));

  useEffect(() => {
    let cancelled = false;
    let shuffled = false;
    let consecutiveErrors = 0;
    const timers: number[] = [];

    loadYouTubeApi().then((YT) => {
      if (cancelled || !container.current) return;
      const target = document.createElement("div");
      container.current.replaceChildren(target);

      const p = new YT.Player(target, {
        width: "100%",
        height: "100%",
        playerVars: {
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          playsinline: 1,
          rel: 0,
        },
        events: {
          onReady: () => {
            // No setLoop: the end of the playlist is handled by restart so it can be reloaded.
            restart.current = () => {
              shuffled = false;
              if (source.type === "playlist") p.loadPlaylist({ list: source.listId, listType: "playlist", index: 0 });
              else p.loadPlaylist(source.ids, 0);
            };
            restart.current();

            // Watchdog: if for any reason it got stuck at the end, start again.
            const watchdog = window.setInterval(() => {
              if (p.getPlayerState() === YT.PlayerState.ENDED) advance();
            }, 5000);
            timers.push(watchdog);

            // If the playlist doesn't load (private, or a Mix YouTube won't serve), at least the link's video plays.
            if (source.type === "playlist" && source.fallbackId) {
              const fallback = source.fallbackId;
              timers.push(
                window.setTimeout(() => {
                  if (!p.getPlaylist()?.length) {
                    restart.current = () => p.loadPlaylist([fallback], 0);
                    restart.current();
                  }
                }, 5000)
              );
            }

            // If the browser blocks autoplay with sound, start muted and notify.
            timers.push(
              window.setTimeout(() => {
                const state = p.getPlayerState();
                if (state !== YT.PlayerState.PLAYING && state !== YT.PlayerState.BUFFERING) {
                  p.mute();
                  p.playVideo();
                  cb.current.onMuted(true);
                }
              }, 3000)
            );
          },
          onStateChange: (e) => {
            if (e.data === YT.PlayerState.PLAYING) {
              consecutiveErrors = 0;
              cb.current.onNotice(null);
              if (shuffle && !shuffled) {
                shuffled = true;
                p.setShuffle(true);
                p.playVideoAt(0);
                return;
              }
              cb.current.onInfo({
                title: (p as PlayerWithData).getVideoData()?.title ?? "",
                index: p.getPlaylistIndex() + 1,
                total: p.getPlaylist()?.length ?? 1,
                playing: true,
              });
            } else if (e.data === YT.PlayerState.PAUSED) {
              cb.current.onInfo({
                title: (p as PlayerWithData).getVideoData()?.title ?? "",
                index: p.getPlaylistIndex() + 1,
                total: p.getPlaylist()?.length ?? 1,
                playing: false,
              });
            } else if (e.data === YT.PlayerState.ENDED) {
              // YouTube advances on its own between songs; we only step in at the end of the playlist.
              const total = p.getPlaylist()?.length ?? 1;
              if (p.getPlaylistIndex() >= total - 1) advance();
            }
          },
          onError: () => {
            consecutiveErrors++;
            const total = p.getPlaylist()?.length ?? 1;
            if (consecutiveErrors >= total) {
              cb.current.onNotice("Ningún video de la lista permite reproducirse fuera de YouTube. Prueba con otra lista.");
              return;
            }
            cb.current.onNotice("Este video no permite reproducirse aquí. Saltando al siguiente…");
            const failedIndex = p.getPlaylistIndex();
            // Only skip if YouTube didn't advance on its own in the meantime.
            timers.push(window.setTimeout(() => p.getPlaylistIndex() === failedIndex && advance(), 2000));
          },
        },
      }) as PlayerWithData;
      player.current = p;
    });

    return () => {
      cancelled = true;
      timers.forEach((t) => {
        clearTimeout(t);
        clearInterval(t);
      });
      player.current?.destroy();
      player.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, shuffle]);

  return <div ref={container} className="player absolute inset-0" />;
}
