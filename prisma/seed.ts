/**
 * Initial data: one user per role and a sample inventory. Idempotent: it can be run several
 * times. The demo passwords are ONLY for development; on the VPS create the admin with
 * SEED_ADMIN_PASSWORD and the rest from the platform.
 */
import { PrismaClient, type Role } from "@prisma/client";
import bcrypt from "bcryptjs";
import { encrypt, searchHash, normalizeCode } from "../src/lib/core/crypto";

const prisma = new PrismaClient();
const production = process.env.NODE_ENV === "production";

async function user(username: string, name: string, role: Role, password: string, personDocument?: string) {
  const personId = personDocument ? (await prisma.person.findUnique({ where: { documentHash: searchHash(personDocument) } }))?.id : undefined;
  return prisma.user.upsert({
    where: { username },
    update: {},
    create: { username, name, role, passwordHash: await bcrypt.hash(password, 12), mustChangePassword: production, personId },
  });
}

async function person(d: { type: "STUDENT" | "TEACHER" | "STAFF"; firstNames: string; lastNames: string; document: string; cardCode?: string; program?: string }) {
  const document = normalizeCode(d.document);
  await prisma.person.upsert({
    where: { documentHash: searchHash(document) },
    update: {},
    create: {
      type: d.type,
      firstNames: d.firstNames,
      lastNames: d.lastNames,
      documentHash: searchHash(document),
      documentEncrypted: encrypt(document),
      documentLast4: document.slice(-4),
      cardCode: d.cardCode ? normalizeCode(d.cardCode) : null,
      program: d.program,
    },
  });
}

async function item(d: { code: string; name: string; category: string; brand?: string; serial?: string; location?: string; campus?: string }) {
  await prisma.item.upsert({ where: { code: normalizeCode(d.code) }, update: {}, create: { ...d, code: normalizeCode(d.code) } });
}

async function main() {
  // In production there is no default: a known password would be an open door until changed.
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || (production ? undefined : "admin12345");
  if (!adminPassword || adminPassword.length < 10) throw new Error("Set SEED_ADMIN_PASSWORD (at least 10 characters) to seed in production");
  await user("admin", "Administrador", "ADMIN", adminPassword);

  if (!production) {
    await user("coord.admin", "Coordinación Administrativa", "ADMINISTRATIVE_COORDINATION", "coord12345");
    await user("coord.academica", "Coordinación Académica", "ACADEMIC_COORDINATION", "coord12345");
    await user("asistente", "Asistente Administrativo", "ADMINISTRATIVE_ASSISTANT", "asistente123");

    await person({ type: "STUDENT", firstNames: "Laura", lastNames: "Gómez Ríos", document: "1012345678", cardCode: "EST-2026-0001", program: "Técnico en Enfermería" });
    await person({ type: "STUDENT", firstNames: "Andrés", lastNames: "Mejía Toro", document: "1023456789", cardCode: "EST-2026-0002", program: "Técnico en Farmacia" });
    await person({ type: "TEACHER", firstNames: "Carolina", lastNames: "Restrepo", document: "43123456", program: "Odontología" });
    await person({ type: "STAFF", firstNames: "Julián", lastNames: "Ospina", document: "71234567", program: "Secretaría" });
    await person({ type: "STAFF", firstNames: "Marcela", lastNames: "Duque Arango", document: "52345678", program: "Bienestar" });
    await person({ type: "STAFF", firstNames: "Sergio", lastNames: "Valencia", document: "80456789", program: "Prácticas" });
    const psychologist = await user("psicologa", "Marcela Duque Arango", "PSYCHOLOGY", "psico12345", "52345678");
    await user("practicas", "Sergio Valencia", "INTERNSHIP_COORDINATION", "practicas123", "80456789");
    // Base hourly rates for the demo payroll.
    await prisma.person.updateMany({ where: { documentHash: { in: ["43123456", "52345678", "80456789"].map((d) => searchHash(d)) }, hourlyRate: null }, data: { hourlyRate: 28000 } });
    await prisma.event.updateMany({ where: { type: "COURSE", hourlyRate: null }, data: { hourlyRate: 45000 } });

    const modules = [
      ["Técnico en Enfermería", "Soporte vital básico", 32],
      ["Técnico en Enfermería", "Farmacología", 24],
      ["Técnico en Farmacia", "Dispensación", 36],
      ["Salud Oral", "Historia clínica y odontograma", 40],
      ["Salud Oral", "Bioseguridad", 16],
      ["Primera Infancia", "Desarrollo infantil", 20],
    ] as const;
    for (const [program, name, hours] of modules) {
      await prisma.academicModule.upsert({ where: { program_name: { program, name } }, update: {}, create: { program, name, hours } });
    }
    const teacher = await prisma.person.findUnique({ where: { documentHash: searchHash("43123456") } });
    const oralHealth = await prisma.academicModule.findMany({ where: { program: "Salud Oral" } });
    if (teacher) {
      for (const m of oralHealth) {
        await prisma.teacherModule.upsert({ where: { personId_moduleId: { personId: teacher.id, moduleId: m.id } }, update: {}, create: { personId: teacher.id, moduleId: m.id } });
      }
    }

    // Current month's schedule: weekly classes of the demo teacher and a consultation.
    if ((await prisma.event.count()) === 0 && teacher) {
      const today = new Date();
      const monday = new Date(today.getFullYear(), today.getMonth(), 1);
      while (monday.getDay() !== 1) monday.setDate(monday.getDate() + 1);
      const seriesId = "seed-serie-1";
      for (let week = 0; week < 4; week++) {
        for (const day of [0, 2]) {
          const startsAt = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + week * 7 + day, 8, 0);
          const endsAt = new Date(startsAt.getTime() + 4 * 3600000);
          if (startsAt.getMonth() !== today.getMonth()) continue;
          await prisma.event.create({
            data: { type: "MODULE_CLASS", title: oralHealth[0].name, startsAt, endsAt, hours: 4, studentCount: 18, campus: "Bogotá", location: "Clínica odontológica", teacherId: teacher.id, moduleId: oralHealth[0].id, seriesId },
          });
        }
      }
      const consultation = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 3, 14, 0);
      await prisma.event.create({ data: { type: "PSYCHOLOGY_SESSION", title: "Consultas individuales", startsAt: consultation, endsAt: new Date(consultation.getTime() + 3 * 3600000), hours: 3, campus: "Bogotá", teacherId: teacher.id } });
      // A day with many entries, to see how the calendar behaves when busy.
      const busy = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 8); // Tuesday of the 2nd week
      const ev = (type: "MODULE_CLASS" | "COURSE" | "DIPLOMA" | "FIELD_TRIP" | "PSYCHOLOGY_SESSION" | "OTHER", title: string, h1: number, h2: number, extra: object = {}) =>
        prisma.event.create({ data: { type, title, startsAt: new Date(busy.getFullYear(), busy.getMonth(), busy.getDate(), h1, 0), endsAt: new Date(busy.getFullYear(), busy.getMonth(), busy.getDate(), h2, 0), hours: h2 - h1, campus: "Bogotá", teacherId: teacher.id, ...extra } });
      await ev("COURSE", "Curso Primeros auxilios", 7, 11);
      await ev("DIPLOMA", "Diplomado Gestión en salud", 13, 17);
      await ev("PSYCHOLOGY_SESSION", "Taller grupal de bienestar", 11, 12);
      await ev("FIELD_TRIP", "Visita práctica · Hospital Simón Bolívar", 14, 16);
      await ev("OTHER", "Reunión de área", 17, 18, { payable: false });

      const fieldTrip = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 11, 9, 0);
      await prisma.event.create({ data: { type: "FIELD_TRIP", title: "Visita contrato de aprendizaje · Clínica San Rafael", startsAt: fieldTrip, endsAt: new Date(fieldTrip.getTime() + 2 * 3600000), hours: 2, campus: "Bogotá", teacherId: teacher.id } });
    }

    // Psychology requests in different statuses.
    if ((await prisma.consultationRequest.count()) === 0) {
      const marcela = await prisma.person.findUnique({ where: { documentHash: searchHash("52345678") } });
      const base = (firstNames: string, lastNames: string, document: string, extra: object = {}) => ({
        firstNames,
        lastNames,
        documentHash: searchHash(document),
        documentEncrypted: encrypt(document),
        documentLast4: document.slice(-4),
        phoneEncrypted: encrypt("3001234567"),
        email: `${firstNames.toLowerCase()}@funca.edu.co`,
        program: "Técnico en Enfermería",
        campus: "Bogotá",
        policyVersion: "2026-10-15",
        policyAcceptedAt: new Date(),
        ...extra,
      });
      await prisma.consultationRequest.create({ data: { ...base("Valentina", "Rojas", "1034567890"), origin: "PUBLIC", status: "PENDING", emailVerifiedAt: new Date(), availability: "Martes y jueves en la tarde", reasonEncrypted: encrypt("Me siento muy estresada con los parciales.") } });
      await prisma.consultationRequest.create({ data: { ...base("Camilo", "Herrera", "1045678901", { program: "Técnico en Farmacia" }), origin: "INTERNAL", status: "PENDING" } });
      await prisma.consultationRequest.create({ data: { ...base("Daniela", "Muñoz", "1056789012"), origin: "PUBLIC", status: "TAKEN", emailVerifiedAt: new Date(), assignedToId: psychologist.id, takenAt: new Date(), preferredModality: "VIRTUAL" } });
      if (marcela) {
        // One appointment from yesterday without feedback and another one for tomorrow.
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        yesterday.setHours(10, 0, 0, 0);
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(15, 0, 0, 0);
        for (const [firstName, doc, startsAt] of [["Santiago", "1067890123", yesterday], ["Paula", "1078901234", tomorrow]] as const) {
          const s = await prisma.consultationRequest.create({ data: { ...base(firstName, "Castro", doc), origin: "PUBLIC", status: "SCHEDULED", emailVerifiedAt: new Date(), assignedToId: psychologist.id, takenAt: new Date() } });
          const e = await prisma.event.create({ data: { type: "PSYCHOLOGY_SESSION", title: `Consulta psicológica #${s.number}`, startsAt, endsAt: new Date(startsAt.getTime() + 3600000), hours: 1, campus: "Bogotá", location: "Consultorio de bienestar", teacherId: marcela.id } });
          await prisma.consultationRequest.update({ where: { id: s.id }, data: { eventId: e.id } });
        }
      }
    }

    await item({ code: "INV-0001", name: "Portátil Lenovo ThinkPad", category: "Equipo de cómputo", brand: "Lenovo", serial: "PF3K9X2", location: "Sala de sistemas", campus: "Bogotá" });
    await item({ code: "INV-0002", name: "Video beam Epson", category: "Audiovisual", brand: "Epson", serial: "X7LK004321", location: "Oficina coordinación", campus: "Bogotá" });
    await item({ code: "INV-0003", name: "Simulador RCP adulto", category: "Simulación", brand: "Laerdal", location: "Laboratorio de enfermería", campus: "Bogotá" });
    await item({ code: "INV-0004", name: "Tensiómetro digital", category: "Equipo clínico", brand: "Omron", location: "Laboratorio de enfermería", campus: "Itagüí" });
    await item({ code: "INV-0005", name: "Control remoto aire acondicionado", category: "Mobiliario y varios", location: "Recepción", campus: "Itagüí" });
  }

  console.log(`Seed done. admin / ${production ? "(SEED_ADMIN_PASSWORD)" : adminPassword}`);
  if (!production) console.log("Demo: coord.admin / coord12345 · coord.academica / coord12345 · asistente / asistente123 · psicologa / psico12345 · practicas / practicas123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
