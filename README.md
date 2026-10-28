# FUNCA — Administrative platform

Internal tool for FUNCA's administrative staff (Fundación Escuela de Capacitación Colombia).
Each **role** sees and does only what it is responsible for. The first module is
**Inventory**: recording which item is handed to which person, with a barcode reader for the
ID card and the item's label.

Sibling of `funca-page` (public site, white header) and `practicas-funca` (internships, blue
header on top). This one is told apart by its **dark navy sidebar with a gold stripe** and the
«Admin» tag next to the logo.

Next.js 16 (App Router) + React 19 + Tailwind CSS v4 + Prisma 6 + PostgreSQL.

## Quick start

```bash
cp .env.example .env            # and change POSTGRES_PASSWORD, AUTH_SECRET and DATA_KEY (openssl rand -base64 48)
docker compose up -d db         # local Postgres on 127.0.0.1:5434
pnpm install
pnpm prisma migrate deploy
pnpm seed                       # admin / admin12345 + demo users and data
pnpm dev                        # http://localhost:3020
```

`docker compose` refuses to start without `POSTGRES_PASSWORD`, `AUTH_SECRET` and `DATA_KEY` in
`.env` (the values in `.env.example` are enough for local development). If you change
`POSTGRES_PASSWORD`, change it in `DATABASE_URL` too.

Demo users created by the seed (only outside production):

| Username          | Password       | Role (identifier)             | Display name                 |
| ----------------- | -------------- | ----------------------------- | ---------------------------- |
| `admin`           | `admin12345`   | `ADMIN`                       | Administrador del sistema    |
| `coord.admin`     | `coord12345`   | `ADMINISTRATIVE_COORDINATION` | Coordinación administrativa  |
| `coord.academica` | `coord12345`   | `ACADEMIC_COORDINATION`       | Coordinación académica       |
| `asistente`       | `asistente123` | `ADMINISTRATIVE_ASSISTANT`    | Asistente administrativo     |
| `psicologa`       | `psico12345`   | `PSYCHOLOGY`                  | Psicología                   |
| `practicas`       | `practicas123` | `INTERNSHIP_COORDINATION`     | Coordinación de prácticas    |

Other commands: `pnpm typecheck`, `pnpm lint`, `pnpm test` (encryption, permission matrix,
HTTP helpers, schedule permissions, shifts, payroll, psychology and projection), `pnpm build`.

## Architecture: monolith with separate layers

It is a single deployment (simpler to run on the VPS), but the code is split so that the
*backend* (`src/lib` + `src/app/api`) does not depend on the *frontend* (`src/app/panel` +
`src/components`). If a separate service is ever needed (for example, for the reader in a
mobile app), the routes in `src/app/api` are already a JSON API with cookie-based sessions.

Code is in English; the user interface and page URLs (`/panel/...`, `/solicitar-cita`,
`/privacidad`, `/proyeccion`) are in Spanish.

```
src/
├── lib/
│   ├── core/                   Independent of any module
│   │   ├── auth.ts             JWT session in an httpOnly cookie (8 h); requireUser / requirePermission; clientIp
│   │   ├── permissions.ts      PERMISSION MATRIX per role (single source of truth)
│   │   ├── crypto.ts           HMAC for searching + AES-256-GCM for personal data
│   │   ├── audit.ts            Action log
│   │   ├── passwords.ts        bcrypt, password generator and rules
│   │   ├── http.ts             withPermission(), readBody() with Zod, error responses
│   │   ├── mail.ts             Outgoing email (SMTP via nodemailer)
│   │   ├── rateLimit.ts        In-memory rate limit (login, public appointment link)
│   │   ├── personLink.ts       Links a user account to a person by document
│   │   └── prisma.ts
│   └── modules/
│       ├── inventory/          schemas.ts (Zod: people, items, loans) · service.ts (lookup by code, loan, return)
│       ├── academic/           Teachers and academic modules
│       ├── schedule/           Academic schedule; shifts.ts (class shifts), permissions.ts (entry types per role)
│       ├── psychology/         Appointment requests and feedback
│       ├── payroll/            Monthly hours, requirements and payments (calculation.ts)
│       └── projection/         Event projection screen (YouTube links)
├── app/
│   ├── page.tsx                Login
│   ├── panel/                  Screens (client); the menu is built from permissions (layout.tsx)
│   │   ├── inventario/         Hand out/receive · elementos (items) · personas (people) · historial (history)
│   │   ├── agenda/  mi-agenda/ docentes/  modulos/  psicologia/  nomina/  proyeccion/
│   │   ├── usuarios/           Accounts and permission matrix
│   │   ├── auditoria/          Audit log
│   │   └── cuenta/             Password change
│   ├── solicitar-cita/         Public appointment request form (+ confirmar/)
│   ├── privacidad/             Data policy
│   ├── proyeccion/             Full-screen projection, outside the panel
│   └── api/                    JSON endpoints; each one requires a permission
└── components/
    ├── core/                   Shell (sidebar), ui (cards, modal, table…), Selector, useSession
    ├── inventory/  schedule/  psychology/  payroll/  projection/
    └── public/                 PublicPage (layout of the public pages)
```

**Rule:** the core knows nothing about inventory. A new module (for example, *Caja* (cash
desk) or *Matrículas* (enrollment)) is a folder in `lib/modules/<slug>`, its routes in
`app/api/<slug>` and `app/panel/<spanish-url>`, its components in `components/<slug>`, plus its
permissions in `permissions.ts` and its menu entries in `app/panel/layout.tsx`.

## Roles and permissions

Roles are the Prisma `Role` enum; what each one can do is in `src/lib/core/permissions.ts`
and can be seen in the platform under *Usuarios y roles → Ver permisos por rol*. Summary:

| Permission                                        | `ADMIN` (Administrador del sistema) | `ADMINISTRATIVE_COORDINATION` (Coordinación administrativa) | `ACADEMIC_COORDINATION` (Coordinación académica) | `ADMINISTRATIVE_ASSISTANT` (Asistente administrativo) | `PSYCHOLOGY` (Psicología) | `INTERNSHIP_COORDINATION` (Coordinación de prácticas) |
| ------------------------------------------------- | :---: | :---: | :---: | :---: | :---: | :---: |
| `inventory.view` — inventory and history          |   ✓   |   ✓   |   ✓   |   ✓   |       |       |
| `inventory.loan` — hand out / receive items       |   ✓   |   ✓   |       |   ✓   |       |       |
| `inventory.items.manage` — create and edit items  |   ✓   |   ✓   |       |   ✓   |       |       |
| `inventory.people.view` — view people             |   ✓   |   ✓   |   ✓   |   ✓   |       |       |
| `inventory.people.manage` — create / edit people  |   ✓   |   ✓   |       |   ✓   |       |       |
| `inventory.people.viewDocument` — full document   |   ✓   |   ✓   |       |       |       |       |
| `inventory.reports` — export reports (CSV)        |   ✓   |   ✓   |   ✓   |       |       |       |
| `teachers.view` — teachers                        |   ✓   |   ✓   |   ✓   |       |       |   ✓   |
| `teachers.manage` — create / edit teachers        |   ✓   |       |   ✓   |       |       |       |
| `modules.manage` — academic modules               |   ✓   |       |   ✓   |       |       |       |
| `schedule.view` — academic schedule               |   ✓   |   ✓   |   ✓   |   ✓   |       |   ✓   |
| `schedule.manage` — any schedule entry            |   ✓   |       |   ✓   |       |       |       |
| `schedule.fieldTrips` — field trips / internships |   ✓   |       |       |       |       |   ✓   |
| `schedule.own` — *Mi agenda* (linked account)     |   ✓   |       |       |       |   ✓   |   ✓   |
| `psychology.view` — request status (no clinical data) | ✓ |   ✓   |   ✓   |   ✓   |   ✓   |       |
| `psychology.request` — register a request         |   ✓   |   ✓   |   ✓   |   ✓   |   ✓   |       |
| `psychology.attend` — attend appointments (clinical data) | |     |       |       |   ✓   |       |
| `payroll.view` — hours and payroll                |   ✓   |   ✓   |   ✓   |       |       |       |
| `payroll.manage` — review, rates, approve month   |   ✓   |       |   ✓   |       |       |       |
| `payroll.pay` — record payments                   |   ✓   |   ✓   |       |       |       |       |
| `audit.view` — audit log                          |   ✓   |   ✓   |       |       |       |       |
| `users.view` — view users                         |   ✓   |   ✓   |       |       |       |       |
| `users.manage` — manage users                     |   ✓   |       |       |       |       |       |
| `projection.manage` — event projection            |   ✓   |       |       |       |       |       |

Psychology clinical data (reason, full contact details, feedback) is not visible even to the
system administrator (`ADMIN` has every permission except `psychology.attend`). **Psicología**
and **Coordinación de prácticas** accounts are linked to a person by their document (when they
are created or from *Usuarios y roles*): their appointments and internships are recorded under
that person and count towards their payroll.

Changing the matrix means editing that file and deploying: the menu, the screens and the
endpoints all read it.

## Inventory and barcode reader

The **Entregar / recibir** (hand out / receive) screen (`/panel/inventario`) has a single field
that takes whatever the scanner reads, in any order:

1. The **ID card** is scanned → the person is identified (by the card code or, if the card
   prints the document number, by the document).
2. The **item label** is scanned → the item is shown.
3. With both on screen, focus moves to *Confirmar entrega* (confirm hand-out): the reader's
   Enter confirms.

If an item that is already on loan is scanned, the **return** opens directly. Without a reader,
you can type the document or the code and press Enter, or search by name.

Common USB readers work as a keyboard (HID mode): they type the code and send Enter. Nothing
needs to be configured; the field just needs focus (the screen takes it back by itself after
each action). The endpoint is `POST /api/inventory/search` with `{ code }` and it answers
`{ type: "person", person }`, `{ type: "item", item }` or 404. It requires `inventory.loan`, and
finding a person is audited.

**Hand-out date.** Step 3 already brings the current date and time; it is only changed when
recording a hand-out that happened earlier.

**Issues.** From «Sin devolver» (not returned) or the history you record what the person
reports after receiving the item (defect, missing part, damage in use). The number of minutes
since the hand-out is stored: if it is very short (≤ 30 min, highlighted in red), the damage was
already there. Issues show up in the history and in the CSV.

**Teachers and academic modules.** Academic coordination records the modules of each program
(`/panel/modulos`) and each teacher's profile with the modules they teach (`/panel/docentes`).
A teacher is a person of type `TEACHER`, so they can also receive inventory items. From the
teacher form, «Agregar módulo nuevo» (add new module) takes you to the modules page and, on
saving, comes back with the module already selected.

**Academic schedule.** `/panel/agenda` records everything a teacher does that gets paid:
module classes, courses, diploma programs, field trips or visits, psychology sessions and
others. Each entry has a teacher, a module (if it is a class), start and end, hours to credit
(calculated, editable), students in charge, campus, location and whether it counts towards
payroll. It can repeat weekly (pick days and an end date) and you can edit or delete one session
or the whole series.

Module classes are scheduled by **shift** (*jornada*): Diurno (daytime: Tuesday, Wednesday and
Thursday, 7:00 to 12:00, 5 h per session), Nocturno (evening: Monday to Friday, 18:00 to 21:00,
3 h) and Sábados (Saturdays: 7:00 to 16:00, 9 h). With shift, start date and end date the
system marks the days on the calendar, calculates sessions and total hours and compares them
with the module's hours; if the module has hours, it suggests the end date automatically. The
shifts are in `src/lib/modules/schedule/shifts.ts` (tested in `tests/shifts.test.ts`). On the
calendar, «+N más» or a day's dots on a phone open that day's week. Month, week and list views
(on phones the list is the default), filters by teacher and type, and the period's hour totals
per type. Payroll reads the schedule directly (`lib/modules/payroll`).

Every schedule entry is **in person or virtual** (when virtual, the location is the meeting
link) and can carry its own **hourly rate**; for **courses it is required**, because each
teacher is paid according to their profile. Field trips / internships and consultations need a
**closing** (completed, not completed, cancelled) after their start time; cancelled ones do not
count towards payroll, not-completed ones do.

**Psychology.** An appointment can be requested in two ways: through the public link
`/solicitar-cita` (students, teachers and permanent staff; it requires an institutional email
and accepting the [data policy](/privacidad); the request only arrives once the link sent to
that email is confirmed) or registered by staff from `/panel/psicologia`. At most 3 requests per
document per month and, through the public link, one open request at a time. The public form
answers **exactly the same whether or not a request was created** (monthly limit reached or a
request already open): telling the visitor would reveal that someone is seeing Psychology, which
is health data. The public link is also rate-limited by IP and by document. All psychologists
see the inbox; one takes the case, agrees on a time with the person and schedules it (it goes
into her schedule and the person is notified by email). After the appointment she records the
feedback: attendance, reason, referral (EPS, crisis line…), follow-up and an encrypted
observation that only she can see. Statuses: email not confirmed → unassigned → taken →
scheduled → attended / referred / no-show / cancelled. The assistant and the coordinations see
the status without clinical data.

**Internship coordination.** Schedules field trips / internships in the schedule (for
themselves or for a teacher), sees them in *Mi agenda* and records their closing.

**Hours and payroll** (`/panel/nomina`). Hours of the month per person and type (modules,
courses, diploma programs, internships, psychology…) with their amount: the entry's rate or,
if it has none, the person's base hourly rate. The month goes through *activity recording → in
review → approved for payment → paid*. Academic coordination reviews each person against the
requirements (automatic: rates and closings complete; manual: hours reviewed, person's
confirmation, invoice (*cuenta de cobro*), social security), verifies them and approves the
month; from then on that month's schedule can no longer be changed. Administrative coordination
records the payments. «Descargar reporte» (download report) gives the month's CSV with hours,
amount, status and payment for each person.

**Email.** `SMTP_URL`, `MAIL_FROM`, `MAIL_DOMAINS` and `APP_URL` in `.env` (see
`.env.example`). Without `SMTP_URL`, in development emails are printed to the server console;
in production the public link answers that it could not send the email.

**Projection** (`/panel/proyeccion`). Day of the Dead screen for the hall: in the panel you
paste a YouTube playlist (also `music.youtube.com` and Mixes) or several videos, one per line,
and it is saved in the `projections` table (a single row). «Abrir pantalla de proyección» (open
projection screen) opens `/proyeccion` full screen, outside the panel: it plays the list in a
loop, skips videos that YouTube does not allow to be embedded and every 20 s asks whether the
list changed, so it can be changed from another computer. At the end of each loop it asks
YouTube for the list again (newly added songs come in). It is the only route whose CSP allows
YouTube (`next.config.ts`). If the session expires during the event, the music keeps playing; it
just stops picking up changes. The panel also downloads the themed logo as a PNG.

**Responsive.** Tables (`@utility data-table`) stack on phones: each row is a card and cells
with `data-t="Etiqueta"` show their header. When adding a new column, give the cell a `data-t`.

Rules: an item has at most one open loan; when handed out it becomes *Prestado* (`LOANED`) and
when received *Disponible* (`AVAILABLE`), or *Mantenimiento* (`MAINTENANCE`) if returned
damaged. Everything happens in a transaction.

## Information security

Personal data is stored, so:

- **Document and phone encrypted** in the database (AES-256-GCM) with `DATA_KEY`, a key
  separate from the session one. To search by document or card, an HMAC is used
  (`documentHash`), which cannot be reversed. Lists show `••••1234`; the full number is only
  visible to roles with `inventory.people.viewDocument`.
- **Passwords** with bcrypt (cost 12), at least 10 characters. New accounts get a temporary
  password that is shown only once and must be changed on first login. 15-minute lockout after
  5 failed attempts, plus a per-IP limit on login attempts. Login answers **identically** for an
  unknown, inactive or locked account and for a wrong password (bcrypt runs even for unknown
  users), so it does not reveal which usernames exist.
- **Session**: signed JWT in an `httpOnly`, `sameSite=strict` cookie, `secure` in production,
  lasting 8 h. Changing the password invalidates the other sessions; a password reset, a role
  change or deactivating the account invalidates all of them (`User.sessionVersion`).
- **Server-side permissions**: every endpoint goes through `withPermission(...)`. What the
  client hides is only a convenience.
- **Validation** of every input with Zod.
- **Audit** of logins (failed ones too), people lookups, hand-outs, returns and account
  changes, with IP. Write-only; it is not edited or deleted. The IP comes from the `X-Real-IP`
  header set by nginx (see deployment).
- Security **headers** (CSP, `X-Frame-Options: DENY`, etc.) in `next.config.ts`;
  `robots: noindex`.
- `.env` is never committed to the repository. **If `DATA_KEY` is lost, the encrypted data
  cannot be recovered**: keep it in a secrets manager and back up the database.

Pending for production (see below): mandatory HTTPS on the VPS nginx, encrypted Postgres
backups and an audit log retention policy.

## Deployment on the VPS (Docker + nginx)

Same setup as the other projects: the app runs in a container that only listens on
`127.0.0.1:3020` (`APP_PORT`) and the VPS nginx publishes the domain over HTTPS.

```bash
cp .env.example .env && nano .env     # POSTGRES_PASSWORD, AUTH_SECRET, DATA_KEY (required), APP_URL, SMTP_URL…
docker compose up -d --build          # migrations are applied on container start (docker-entrypoint.sh)
docker compose run --rm -e SEED_ADMIN_PASSWORD='a-strong-password' app node_modules/.bin/tsx prisma/seed.ts   # first time only
```

`docker compose` refuses to start if `POSTGRES_PASSWORD`, `AUTH_SECRET` or `DATA_KEY` are
missing, and the app refuses to run in production with an `AUTH_SECRET` or `DATA_KEY` shorter
than 32 characters. In production the seed only creates `admin`, refuses to run without a
`SEED_ADMIN_PASSWORD` of at least 10 characters, and forces a password change on first login;
the other users are created from *Usuarios y roles*.

The `app` container runs as a non-root user (`nextjs`) with a read-only filesystem (only
`/tmp` and `.next/cache` are writable tmpfs), `cap_drop: ALL` and `no-new-privileges`, and with
`TZ=America/Bogota`. It must sit behind nginx, and nginx must set `X-Real-IP` (for example
`proxy_set_header X-Real-IP $remote_addr;`): the app trusts that header for the IPs in the
audit log and for rate limits.

Update: `git pull && docker compose up -d --build`. Logs: `docker compose logs -f app`.

## Suggested next steps

- Printing barcode labels (Code 128) for items and ID cards from the platform.
- More modules per role: academic coordination (timetables, teachers), administrative
  coordination (cash desk, suppliers).
- Automatic Postgres backups and `DATA_KEY` rotation (re-encryption).
- Notifications for overdue loans.
