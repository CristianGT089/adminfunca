import type { Metadata } from "next";
import Link from "next/link";
import PublicPage from "@/components/public/PublicPage";
import { POLICY_VERSION } from "@/lib/modules/psychology/schemas";

export const metadata: Metadata = { title: "Política de tratamiento de datos · FUNCA" };

/*
 * DRAFT for FUNCA legal review. If the text changes, change POLICY_VERSION in
 * src/lib/modules/psychology/schemas.ts: each request stores the version that was accepted.
 */
const SECTIONS: { title: string; paragraphs: string[] }[] = [
  {
    title: "1. Responsable del tratamiento",
    paragraphs: ["La Fundación Escuela de Capacitación Colombia (FUNCA) es responsable de los datos personales que usted entrega al solicitar una cita con el área de Psicología, en cumplimiento de la Ley 1581 de 2012, el Decreto 1377 de 2013 (compilado en el Decreto 1074 de 2015) y las demás normas que los modifiquen."],
  },
  {
    title: "2. Datos que recogemos",
    paragraphs: [
      "Nombres y apellidos, tipo y número de documento, teléfono, correo electrónico, programa o área, sede, preferencias de modalidad y horario y, si usted decide contarlo, el motivo de la consulta.",
      "Después de la cita, la psicóloga registra la asistencia, una clasificación general del motivo, si hubo remisión a otra entidad (por ejemplo, su EPS) y observaciones profesionales.",
    ],
  },
  {
    title: "3. Datos sensibles",
    paragraphs: [
      "La información relacionada con su salud mental es un dato sensible (artículo 5 de la Ley 1581 de 2012). Usted no está obligado a entregarla: el motivo de consulta es opcional y puede contarlo directamente a la psicóloga.",
      "Estos datos se guardan cifrados y solo los consultan las psicólogas de FUNCA. El personal administrativo y las coordinaciones solo ven su nombre, el estado de la solicitud y la fecha de la cita, para poder orientarle.",
    ],
  },
  {
    title: "4. Para qué usamos sus datos",
    paragraphs: [
      "Para comunicarnos con usted, programar y prestar la atención psicológica, hacer seguimiento, remitirle a otra entidad cuando sea necesario y llevar las estadísticas generales del servicio (sin datos que le identifiquen).",
      "También para controlar el número de solicitudes por persona y verificar, mediante el correo institucional, que quien solicita hace parte de la comunidad FUNCA.",
    ],
  },
  {
    title: "5. Sus derechos",
    paragraphs: [
      "Usted puede conocer, actualizar y rectificar sus datos; pedir prueba de esta autorización; ser informado sobre el uso que se les ha dado; revocar la autorización o pedir que se supriman cuando no exista un deber legal de conservarlos; y presentar quejas ante la Superintendencia de Industria y Comercio.",
      "Para ejercerlos, acuda a la oficina de bienestar de su sede o a los canales de atención publicados por FUNCA. Responderemos en los plazos de ley (diez días hábiles para consultas y quince para reclamos).",
    ],
  },
  {
    title: "6. Seguridad y conservación",
    paragraphs: [
      "Los datos se guardan en la plataforma administrativa de FUNCA con acceso por usuario y rol, registro de cada consulta y cifrado del documento, el teléfono, el motivo y las observaciones.",
      "La historia y los registros de atención se conservan durante el tiempo que exijan las normas aplicables al ejercicio de la psicología y, después, se eliminan o anonimizan.",
    ],
  },
];

export default function PrivacyPage() {
  return (
    <PublicPage eyebrow="Protección de datos personales" title="Política de tratamiento de datos" text={`Atención psicológica · versión ${POLICY_VERSION}`}>
      <article className="card p-6 sm:p-8 flex flex-col gap-6 text-slate-700">
        {SECTIONS.map((s) => (
          <section key={s.title}>
            <h2 className="font-heading text-lg font-bold text-blue-900">{s.title}</h2>
            {s.paragraphs.map((p, i) => (
              <p key={i} className="mt-2 text-sm leading-relaxed">
                {p}
              </p>
            ))}
          </section>
        ))}
        <p className="text-sm">
          Al marcar la casilla de autorización en el formulario usted declara que leyó esta política y autoriza el tratamiento descrito, incluido el de sus datos sensibles.{" "}
          <Link href="/solicitar-cita" className="font-semibold text-blue-800 underline">
            Volver a la solicitud
          </Link>
        </p>
      </article>
    </PublicPage>
  );
}
