"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { parseLinks, type Source } from "@/lib/modules/projection/youtube";
import { DayOfTheDeadLogo } from "./DayOfTheDeadLogo";
import { LinkPanel } from "./LinkPanel";
import { Marigold } from "./Marigold";
import { PapelPicado } from "./PapelPicado";
import { Petals } from "./Petals";
import { Player, type PlaybackInfo, type PlayerControl } from "./Player";
import { Candle } from "./Candle";
import { NoAccess } from "@/components/core/ui";
import type { Permission } from "@/lib/core/permissions";
import "./projection.css";

type Settings = { links: string; shuffle: boolean; updatedAt: string };

// How often the screen checks whether the playlist changed (from the panel or another computer).
const POLL_MS = 20_000;

const PHRASES = [
  "Recordar es volver a vivir",
  "FUNCA · Noche de Muertos 2026",
  "Salón administrativo",
  "Que el recuerdo nunca muera",
  "Fundación Escuela de Capacitación Colombia",
];

export function Stage() {
  const [config, setConfig] = useState<Settings | null>(null);
  const [source, setSource] = useState<Source | null>(null);
  const [loading, setLoading] = useState(true);
  const [noPermission, setNoPermission] = useState(false);
  // Only projection.manage changes the playlist; projection.view just plays it.
  const [canEdit, setCanEdit] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [info, setInfo] = useState<PlaybackInfo | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [active, setActive] = useState(true);
  const control = useRef<PlayerControl>(null);
  const version = useRef<string | null>(null);

  const apply = useCallback((c: Settings) => {
    version.current = c.updatedAt;
    setConfig(c);
    setSource(parseLinks(c.links));
    setInfo(null);
    setNotice(null);
  }, []);

  // The user's permissions, read once (not with useSession: a session that expires or logs out
  // elsewhere must not interrupt the music during the event).
  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { user: { permissions: Permission[] } | null }) => setCanEdit(!!d.user?.permissions.includes("projection.manage")))
      .catch(() => {});
  }, []);

  // Initial load and periodic polling. If the session expires during the event, the music keeps playing.
  useEffect(() => {
    let alive = true;
    const poll = async (initial: boolean) => {
      const r = await fetch("/api/projection", { cache: "no-store" }).catch(() => null);
      if (!alive || !r) return;
      if (r.status === 401) {
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        if (initial) window.location.href = "/";
        return;
      }
      if (r.status === 403) {
        setNoPermission(true);
        setLoading(false);
        return;
      }
      if (!r.ok) return;
      const { projection } = (await r.json()) as { projection: Settings | null };
      if (initial) {
        setLoading(false);
        if (!projection) setPanelOpen(true); // only shown to whoever can edit (see below)
      }
      if (projection && projection.updatedAt !== version.current) apply(projection);
    };
    poll(true);
    const t = window.setInterval(() => poll(false), POLL_MS);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [apply]);

  const save = async (links: string, shuffle: boolean): Promise<string | null> => {
    const r = await fetch("/api/projection", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ links, shuffle }),
    }).catch(() => null);
    if (!r) return "No hay conexión con el servidor.";
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return data.error ?? "No se pudo guardar.";
    apply(data.projection);
    setMuted(false);
    setPanelOpen(false);
    return null;
  };

  const fullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  }, []);

  // Keyboard shortcuts (the panel handles its own while it's open).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (panelOpen || e.ctrlKey || e.metaKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === "l") {
        if (!canEdit) return;
        e.preventDefault();
        setPanelOpen(true);
      } else if (key === "f") fullscreen();
      else if (key === " ") {
        e.preventDefault();
        control.current?.togglePause();
      } else if (key === "n") control.current?.next();
      else if (key === "p") control.current?.previous();
      else if (key === "m") control.current?.unmute();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [panelOpen, fullscreen, canEdit]);

  // Hides the cursor and controls after a few seconds without moving the mouse.
  useEffect(() => {
    let t = window.setTimeout(() => setActive(false), 3000);
    const wake = () => {
      setActive(true);
      clearTimeout(t);
      t = window.setTimeout(() => setActive(false), 3000);
    };
    window.addEventListener("mousemove", wake);
    window.addEventListener("mousedown", wake);
    return () => {
      clearTimeout(t);
      window.removeEventListener("mousemove", wake);
      window.removeEventListener("mousedown", wake);
    };
  }, []);

  // Opened by URL without projection.view: the shared message instead of the stage.
  if (noPermission)
    return (
      <main className="min-h-dvh grid place-items-center bg-slate-50 p-4">
        <NoAccess text="Su rol no tiene permiso para abrir la pantalla de proyección. Si lo necesita, pídalo al administrador del sistema." />
      </main>
    );

  const width = "min(62vw, 64vh * 16 / 9)";
  const shuffle = config?.shuffle ?? false;

  return (
    <main className={`dotd-stage ${active || panelOpen ? "" : "idle"}`}>
      <div className="stars" />
      <Petals />
      <PapelPicado />

      <div className="absolute inset-x-0 top-[15vh] bottom-[13vh] z-20 grid grid-cols-[1fr_auto_1fr] items-center gap-[1.8vw] px-[2vw]">
        {/* Left: logo and title */}
        <aside className="flex flex-col items-center text-center">
          <DayOfTheDeadLogo className="floating w-[15.5vw] max-w-[34vh]" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/funca-logo-blanco.png"
            alt="FUNCA · Fundación Escuela de Capacitación Colombia"
            className="mt-[1vh] w-[15vw] drop-shadow-[0_0.4vh_1vh_rgb(0_0_0/0.6)]"
          />
          <div className="my-[1.8vh] h-px w-2/3 bg-gradient-to-r from-transparent via-cempasuchil-500 to-transparent" />
          <p className="font-heading text-[0.85vw] font-bold uppercase tracking-[0.35em] text-white/80">Noche de</p>
          <p className="fire-text font-heading text-[3.1vw] leading-[1.05] font-extrabold">Muertos</p>
        </aside>

        {/* Center: the video */}
        <section className="video-frame" style={{ width }}>
          <Marigold className="corner-flower -top-[2.2vw] -left-[2.2vw]" />
          <Marigold className="corner-flower -top-[2.2vw] -right-[2.2vw] [animation-direction:reverse]" />
          <Marigold className="corner-flower -bottom-[2.2vw] -left-[2.2vw] [animation-direction:reverse]" />
          <Marigold className="corner-flower -right-[2.2vw] -bottom-[2.2vw]" />

          <div className="video-frame-inner">
            {source ? (
              <Player ref={control} source={source} shuffle={shuffle} onInfo={setInfo} onNotice={setNotice} onMuted={setMuted} />
            ) : (
              <div className="absolute inset-0 grid place-items-center bg-gradient-to-b from-noche-800 to-noche-950">
                <div className="flex flex-col items-center gap-[2vh] text-center">
                  <DayOfTheDeadLogo className="w-[12vw] opacity-80" />
                  {loading ? (
                    <p className="font-heading text-[1.5vw] font-bold">Cargando…</p>
                  ) : (
                    <>
                      <p className="font-heading text-[1.5vw] font-bold">Aún no hay música</p>
                      <p className="text-[0.95vw] text-white/60">
                        {canEdit ? (
                          <>
                            Presiona <kbd>L</kbd> para pegar el link de tu lista de YouTube
                          </>
                        ) : (
                          "Quien administra la proyección debe cargar la lista de YouTube"
                        )}
                      </p>
                    </>
                  )}
                </div>
              </div>
            )}

            {notice && (
              <div className="dotd-fade-in absolute inset-x-0 top-[2vh] z-10 mx-auto w-fit max-w-[90%] rounded-full bg-noche-950/85 px-[1.4vw] py-[0.8vh] text-center font-heading text-[0.9vw] font-semibold text-gold-400 ring-1 ring-gold-500/40">
                {notice}
              </div>
            )}

            {muted && (
              <button
                onClick={() => control.current?.unmute()}
                className="dotd-fade-in absolute inset-x-0 bottom-[3vh] z-10 mx-auto flex w-fit items-center gap-[0.6vw] rounded-full bg-gold-500 px-[1.6vw] py-[1.1vh] font-heading text-[1vw] font-bold text-blue-950 shadow-2xl hover:bg-gold-400"
              >
                🔊 Haz clic para activar el sonido
              </button>
            )}
          </div>
        </section>

        {/* Right: what's playing */}
        <aside className="flex flex-col items-center gap-[3vh]">
          <div className="w-full max-w-[17vw] rounded-[1.4vw] border border-white/10 bg-noche-950/55 p-[1.4vw] shadow-2xl backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <p className="font-heading text-[0.75vw] font-bold uppercase tracking-[0.22em] text-cempasuchil-400">
                {info?.playing === false ? "En pausa" : "Ahora suena"}
              </p>
              <div className={`equalizer flex h-[2.4vh] items-end gap-[0.2vw] ${info?.playing ? "" : "paused"}`}>
                {[0, 0.25, 0.1, 0.4, 0.18].map((d, i) => (
                  <span key={i} style={{ animationDelay: `-${d}s`, animationDuration: `${0.6 + i * 0.13}s` }} />
                ))}
              </div>
            </div>
            <p key={info?.title} className="dotd-fade-in mt-[1.2vh] line-clamp-4 font-heading text-[1.35vw] leading-snug font-bold text-white">
              {info?.title || (source ? "Cargando…" : "—")}
            </p>
            {info && info.total > 1 && (
              <p className="mt-[1.2vh] text-[0.8vw] text-white/55">
                Canción {info.index} de {info.total}
                {shuffle ? " · aleatorio" : ""}
              </p>
            )}
          </div>

          <div className="flex items-end justify-center gap-[0.8vw]">
            <Candle height={0.9} delay={-0.05} />
            <Candle height={1.3} delay={-0.11} />
            <Candle height={1} delay={-0.02} />
          </div>

          <p className="max-w-[16vw] text-center font-heading text-[1.05vw] leading-snug font-semibold text-white/75 italic">
            “Mientras alguien nos recuerde, seguimos aquí.”
          </p>
        </aside>
      </div>

      {/* Bottom: altar with flowers, candles and the phrase marquee */}
      <footer className="absolute inset-x-0 bottom-0 z-20 h-[13vh]">
        <div className="absolute inset-x-0 bottom-0 h-[5vh] bg-gradient-to-t from-black/60 to-transparent" />
        <div className="absolute bottom-[1.4vh] left-[1.5vw] flex items-end gap-[0.4vw]">
          <Marigold className="w-[4.2vw]" />
          <Candle height={1.1} delay={-0.07} />
          <Candle height={0.75} delay={-0.13} />
          <Marigold className="w-[3vw]" />
        </div>
        <div className="absolute bottom-[1.4vh] right-[1.5vw] flex items-end gap-[0.4vw]">
          <Marigold className="w-[3vw]" />
          <Candle height={0.75} delay={-0.03} />
          <Candle height={1.1} delay={-0.09} />
          <Marigold className="w-[4.2vw]" />
        </div>
        <div className="marquee absolute inset-x-[16vw] bottom-[3.2vh] overflow-hidden">
          <div className="marquee-track">
            {[0, 1].map((copy) => (
              <div key={copy} className="flex shrink-0 items-center" aria-hidden={copy === 1}>
                {PHRASES.map((f) => (
                  <span key={f} className="flex items-center gap-[1.5vw] pr-[1.5vw] font-heading text-[1.15vw] font-semibold whitespace-nowrap text-white/80">
                    {f}
                    <Marigold className="w-[1.4vw]" />
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </footer>

      {/* Discreet controls: they only show up when the mouse moves */}
      <div
        className={`fixed top-[16vh] right-[1.2vw] z-40 flex gap-2 transition-opacity duration-500 ${
          active && !panelOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        {canEdit && (
          <button
            onClick={() => setPanelOpen(true)}
            className="rounded-full bg-noche-950/80 px-4 py-2 font-heading text-sm font-semibold ring-1 ring-white/15 hover:bg-noche-700"
          >
            🎵 Cambiar lista <kbd>L</kbd>
          </button>
        )}
        <button
          onClick={fullscreen}
          className="rounded-full bg-noche-950/80 px-4 py-2 font-heading text-sm font-semibold ring-1 ring-white/15 hover:bg-noche-700"
        >
          ⛶ <kbd>F</kbd>
        </button>
      </div>

      {panelOpen && canEdit && (
        <LinkPanel initialText={config?.links ?? ""} initialShuffle={shuffle} onClose={() => setPanelOpen(false)} onSave={save} />
      )}
    </main>
  );
}
