"use client";

import { useEffect, useRef, useState } from "react";
import { parseLinks } from "@/lib/modules/projection/youtube";

type Props = {
  initialText: string;
  initialShuffle: boolean;
  onClose: () => void;
  /** Saves on the server; returns the error message or null. */
  onSave: (links: string, shuffle: boolean) => Promise<string | null>;
};

/** Quick panel on the projection screen (L key). Saves the same thing as /panel/proyeccion. */
export function LinkPanel({ initialText, initialShuffle, onClose, onSave }: Props) {
  const [text, setText] = useState(initialText);
  const [shuffle, setShuffle] = useState(initialShuffle);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    field.current?.focus();
    field.current?.select();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!parseLinks(text)) {
      setError("No encontré ningún link de YouTube válido.");
      return;
    }
    setSaving(true);
    setError(await onSave(text, shuffle));
    setSaving(false);
  };

  const preview = parseLinks(text);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-noche-950/80 p-6 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <form
        onSubmit={submit}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
        className="dotd-panel w-full max-w-2xl rounded-3xl p-8 text-white shadow-2xl"
      >
        <p className="font-heading text-xs font-bold uppercase tracking-[0.2em] text-gold-400">Lista de reproducción</p>
        <h2 className="mt-1 font-heading text-3xl font-extrabold">¿Qué suena esta noche?</h2>
        <p className="mt-2 text-sm text-white/70">
          Pega el link de una <strong>lista de YouTube</strong> o de uno o varios <strong>videos</strong> (uno por línea). Al terminar, la lista vuelve a
          empezar sola.
        </p>

        <textarea
          ref={field}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && (e.ctrlKey || e.metaKey) && submit(e)}
          rows={4}
          placeholder={"https://www.youtube.com/playlist?list=...\nhttps://youtu.be/..."}
          className="mt-5 w-full resize-none rounded-2xl border border-white/15 bg-noche-950/60 p-4 font-mono text-sm text-white placeholder:text-white/35 focus:border-gold-400 focus:outline-none"
        />

        <div className="mt-2 min-h-5 text-sm">
          {error ? (
            <span className="text-rosa-400">{error}</span>
          ) : preview ? (
            <span className="text-turquesa-400">
              {preview.type === "playlist" ? "✓ Lista de reproducción detectada" : `✓ ${preview.ids.length} video${preview.ids.length > 1 ? "s" : ""} en cola`}
            </span>
          ) : null}
        </div>

        <label className="mt-3 flex cursor-pointer items-center gap-3 text-sm text-white/85">
          <input type="checkbox" checked={shuffle} onChange={(e) => setShuffle(e.target.checked)} className="size-4 accent-gold-500" />
          Orden aleatorio
        </label>

        <div className="mt-7 flex items-center justify-between gap-4">
          <p className="text-xs leading-relaxed text-white/50">
            <kbd>L</kbd> abrir este panel · <kbd>F</kbd> pantalla completa · <kbd>Espacio</kbd> pausa · <kbd>N</kbd> / <kbd>P</kbd> siguiente / anterior
          </p>
          <div className="flex shrink-0 gap-3">
            <button type="button" onClick={onClose} className="rounded-full px-5 py-2.5 font-heading text-sm font-semibold text-white/80 hover:bg-white/10">
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-full bg-gold-500 px-6 py-2.5 font-heading text-sm font-bold text-blue-950 shadow-lg shadow-gold-500/25 hover:bg-gold-400 disabled:opacity-60"
            >
              {saving ? "Guardando…" : "Reproducir"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
