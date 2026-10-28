"use client";

import { useEffect, useRef, useState } from "react";
import { request } from "@/components/core/useSession";
import { Alert, Field, formatDate, PageHeader } from "@/components/core/ui";
import { DayOfTheDeadLogo, downloadLogoPng } from "@/components/projection/DayOfTheDeadLogo";
import { parseLinks } from "@/lib/modules/projection/youtube";

type Projection = { links: string; shuffle: boolean; updatedBy: string | null; updatedAt: string };

const SHORTCUTS = [
  ["F", "Pantalla completa"],
  ["L", "Cambiar la lista desde la pantalla"],
  ["Espacio", "Pausa / reproducir"],
  ["N / P", "Siguiente / anterior"],
  ["M", "Activar sonido"],
] as const;

export default function ProjectionPage() {
  const [current, setCurrent] = useState<Projection | null>(null);
  const [links, setLinks] = useState("");
  const [shuffle, setShuffle] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "error"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const logo = useRef<HTMLDivElement>(null);

  useEffect(() => {
    request<{ projection: Projection | null }>("/api/projection").then(({ ok, data }) => {
      if (!ok || !data.projection) return;
      setCurrent(data.projection);
      setLinks(data.projection.links);
      setShuffle(data.projection.shuffle);
    });
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { ok, data } = await request<{ projection: Projection }>("/api/projection", { method: "PUT", json: { links, shuffle } });
    setSaving(false);
    if (!ok) return setMessage({ type: "error", text: data.error ?? "No se pudo guardar" });
    setCurrent(data.projection);
    setMessage({ type: "ok", text: "Guardado. La pantalla de proyección cambia de lista en menos de 20 segundos." });
  };

  const preview = parseLinks(links);

  return (
    <>
      <PageHeader
        eyebrow="Eventos"
        title="Proyección"
        text="Pantalla de Día de Muertos para el salón: reproduce en bucle una lista de YouTube dentro del marco de FUNCA."
        action={
          <a href="/proyeccion" target="_blank" rel="noopener" className="btn btn-secondary">
            Abrir pantalla de proyección ↗
          </a>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem] items-start">
        <form onSubmit={save} className="card p-5 sm:p-6 space-y-4">
          <Field label="Links de YouTube" help="Una lista (youtube.com o music.youtube.com, también los Mix) o varios videos, uno por línea.">
            <textarea
              value={links}
              onChange={(e) => {
                setLinks(e.target.value);
                setMessage(null);
              }}
              rows={5}
              placeholder={"https://www.youtube.com/playlist?list=...\nhttps://youtu.be/..."}
              className="field font-mono"
            />
          </Field>
          <p className="text-sm min-h-5">
            {preview ? (
              <span className="text-emerald-700">
                ✓ {preview.type === "playlist" ? "Lista de reproducción detectada" : `${preview.ids.length} video${preview.ids.length > 1 ? "s" : ""} en cola`}
              </span>
            ) : links.trim() ? (
              <span className="text-red-600">No encontré ningún link de YouTube válido.</span>
            ) : null}
          </p>
          <label className="flex items-center gap-3 text-sm text-slate-700 cursor-pointer">
            <input type="checkbox" checked={shuffle} onChange={(e) => setShuffle(e.target.checked)} className="size-4 accent-blue-700" />
            Orden aleatorio
          </label>
          {message && <Alert type={message.type}>{message.text}</Alert>}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500">{current ? `Última actualización: ${formatDate(current.updatedAt)}${current.updatedBy ? ` · ${current.updatedBy}` : ""}` : "Aún no hay lista guardada."}</p>
            <button type="submit" disabled={!preview || saving} className="btn-cta">
              {saving ? "Guardando..." : "Guardar lista"}
            </button>
          </div>
        </form>

        <div className="space-y-6">
          <div className="card p-5">
            <p className="eyebrow">Logo de Día de Muertos</p>
            <div ref={logo} className="mt-3 rounded-2xl bg-[#120b26] p-4">
              <DayOfTheDeadLogo className="w-full" />
            </div>
            <button type="button" onClick={() => logo.current && downloadLogoPng(logo.current)} className="btn btn-secondary mt-3 w-full">
              Descargar PNG
            </button>
          </div>

          <div className="card p-5 text-sm text-slate-600 space-y-3">
            <p className="eyebrow">En la pantalla</p>
            <ul className="space-y-1.5">
              {SHORTCUTS.map(([key, text]) => (
                <li key={key} className="flex justify-between gap-3">
                  <span>{text}</span>
                  <kbd className="font-heading text-xs font-semibold rounded-md border border-blue-200 bg-blue-50 px-1.5">{key}</kbd>
                </li>
              ))}
            </ul>
            <p className="text-xs text-slate-500">
              Chrome no deja sonar un video si nadie ha hecho clic en la página: arranca en silencio con un botón para activar el sonido. Para evitarlo,
              abre Chrome con <code className="text-[11px]">--autoplay-policy=no-user-gesture-required</code>.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
