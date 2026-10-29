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

`.env.example` points `DATABASE_URL` at the `admin_funca` database of the compose Postgres (the
same one the `app` container uses). To keep development data apart, you can point it at another
database in the same server (for example `.../admin_funca_dev`): create it once with
`docker compose exec db createdb -U admin_funca admin_funca_dev` and `prisma migrate deploy`
fills it.

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
mobile app), the routes in `src/app/api` are already a JSON API with cookie-based sessions. The
deployment already runs database migrations in their own image (`migrator`, see deployment),
separate from the web app image: the first step towards a separate back end and front end.

Code is in English; the user interface and page URLs (`/panel/...`, `/solicitar-cita`,
`/privacidad`, `/proyeccion`) are in Spanish.

```
src/
├── lib/
│   ├── core/                   Independent of any module
│   │   ├── auth.ts             Server-side sessions (`sessions` table) referenced by a signed cookie; requireUser / requirePermission; clientIp
│   │   ├── permissions.ts      PERMISSION MATRIX per role, read/write per module (single source of truth)
│   │   ├── crypto.ts           HMAC for searching + AES-256-GCM for personal data
│   │   ├── audit.ts            Action log
│   │   ├── passwords.ts        bcrypt, password generator and rules
│   │   ├── http.ts             withPermission(), readBody() with Zod, error responses
│   │   ├── mail.ts             Outgoing email (SMTP via nodemailer)
│   │   ├── rateLimit.ts        In-memory rate limit (login, public appointment link)
│   │   ├── personLink.ts       Links a user account to a person by document
│   │   ├── zodConfig.ts        Zod in jitless mode (no eval, see CSP)
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
│   │   └── cuenta/             Mi cuenta: password change and open sessions
│   ├── solicitar-cita/         Public appointment request form (+ confirmar/)
│   ├── privacidad/             Data policy
│   ├── proyeccion/             Full-screen projection, outside the panel
│   └── api/                    JSON endpoints; each one requires a permission (except auth/, health/, public/)
├── proxy.ts                    Per-request CSP with a nonce for every page
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
(`PERMISSION_GROUPS` and `PERMISSIONS_BY_ROLE`) and can be seen in the platform under
*Usuarios y roles → Ver permisos por rol*, as a module × role grid marked *Lectura* (read) or
*Escritura* (write).

Every permission belongs to one module and is either **read** (see data) or **write** (change
data). A write permission always brings the read permission of its module (for example
`inventory.loan` → `inventory.view`, `schedule.own` → `schedule.ownView`), so a role never
changes what it cannot see. Every `GET` endpoint requires a read permission and every
`POST`/`PUT`/`PATCH`/`DELETE` a write one; `tests/permissions.test.ts` checks every route in
`src/app/api` (except `auth/`, `health/` and `public/`). Screens show a «no access» notice
(`NoAccess`) without the read permission and hide the write controls without the write one.

| Permission (level)                                                  | `ADMIN` (Administrador del sistema) | `ADMINISTRATIVE_COORDINATION` (Coordinación administrativa) | `ACADEMIC_COORDINATION` (Coordinación académica) | `ADMINISTRATIVE_ASSISTANT` (Asistente administrativo) | `PSYCHOLOGY` (Psicología) | `INTERNSHIP_COORDINATION` (Coordinación de prácticas) |
| ------------------------------------------------------------------- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Usuarios y roles**                                                |       |       |       |       |       |       |
| `users.view` (read) — view accounts                                 |   ✓   |   ✓   |       |       |       |       |
| `users.manage` (write) — create, edit and deactivate accounts       |   ✓   |       |       |       |       |       |
| **Auditoría**                                                       |       |       |       |       |       |       |
| `audit.view` (read) — audit log                                     |   ✓   |   ✓   |       |       |       |       |
| **Inventario**                                                      |       |       |       |       |       |       |
| `inventory.view` (read) — items and history                         |   ✓   |   ✓   |   ✓   |   ✓   |       |       |
| `inventory.people.view` (read) — view people                        |   ✓   |   ✓   |   ✓   |   ✓   |       |       |
| `inventory.people.viewDocument` (read) — full document              |   ✓   |   ✓   |       |       |       |       |
| `inventory.reports` (read) — export reports (CSV)                   |   ✓   |   ✓   |   ✓   |       |       |       |
| `inventory.loan` (write) — hand out / receive items                 |   ✓   |   ✓   |       |   ✓   |       |       |
| `inventory.items.manage` (write) — create and edit items            |   ✓   |   ✓   |       |   ✓   |       |       |
| `inventory.people.manage` (write) — create / edit people            |   ✓   |   ✓   |       |   ✓   |       |       |
| **Docentes**                                                        |       |       |       |       |       |       |
| `teachers.view` (read) — view teachers                              |   ✓   |   ✓   |   ✓   |       |       |   ✓   |
| `teachers.manage` (write) — create / edit teachers                  |   ✓   |       |   ✓   |       |       |       |
| **Módulos académicos**                                              |       |       |       |       |       |       |
| `modules.view` (read) — view academic modules                       |   ✓   |   ✓   |   ✓   |       |       |   ✓   |
| `modules.manage` (write) — create / edit academic modules           |   ✓   |       |   ✓   |       |       |       |
| **Agenda**                                                          |       |       |       |       |       |       |
| `schedule.view` (read) — general academic schedule                  |   ✓   |   ✓   |   ✓   |   ✓   |       |   ✓   |
| `schedule.ownView` (read) — *Mi agenda* (own entries)               |   ✓   |       |       |       |   ✓   |   ✓   |
| `schedule.manage` (write) — any schedule entry                      |   ✓   |       |   ✓   |       |       |       |
| `schedule.fieldTrips` (write) — field trips / internships           |   ✓   |       |       |       |       |   ✓   |
| `schedule.own` (write) — record and close in *Mi agenda*            |   ✓   |       |       |       |   ✓   |   ✓   |
| **Psicología**                                                      |       |       |       |       |       |       |
| `psychology.view` (read) — request status (no clinical data)        |   ✓   |   ✓   |   ✓   |   ✓   |   ✓   |       |
| `psychology.request` (write) — register a request                   |   ✓   |   ✓   |   ✓   |   ✓   |   ✓   |       |
| `psychology.attend` (write) — attend cases (clinical data)          |       |       |       |       |   ✓   |       |
| **Horas y nómina**                                                  |       |       |       |       |       |       |
| `payroll.view` (read) — hours and month status                      |   ✓   |   ✓   |   ✓   |       |       |       |
| `payroll.manage` (write) — review, rates, approve month             |   ✓   |       |   ✓   |       |       |       |
| `payroll.pay` (write) — record payments                             |   ✓   |   ✓   |       |       |       |       |
| **Proyección**                                                      |       |       |       |       |       |       |
| `projection.view` (read) — open the projection screen               |   ✓   |       |       |       |       |       |
| `projection.manage` (write) — change the playlist                   |   ✓   |       |       |       |       |       |

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
that email is confirmed) or registered by staff from `/panel/psicologia`. Limit: 3 appointments
per document per month, counting only appointments that **took place** (attended or referred)
in the current calendar month, by the appointment's date; pending, scheduled, no-show and
cancelled requests do not count, and a person may have more than one open request. When the
limit is reached, staff get an error, but the public form answers **exactly the same as when a
request is created**: telling the visitor would reveal that someone is seeing Psychology, which
is health data. The public link is also rate-limited by IP and by document. Psychologists see a
notice on a request when other open requests carry the same document (compared by its hash), to
avoid duplicates. All psychologists see the inbox; one takes the case, agrees on a time with the person and schedules it (it goes
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

Reading payroll never writes (`src/lib/modules/payroll/service.ts`): the month is calculated in
memory from the schedule on top of what is stored. Rows are only written by the actions
(review steps, verify, approve, pay), each in one transaction that locks the month: verifying a
person freezes their calculation, approving requires everyone verified, and from then on only
the stored amounts count. A person's line is `GET /api/payroll/people/[id]?year=&month=` (the id
is the person's) and their actions are `POST` to the same route.

**Email.** `SMTP_URL`, `MAIL_FROM`, `MAIL_DOMAINS` and `APP_URL` in `.env` (see
`.env.example`). Without `SMTP_URL`, in development emails are printed to the server console;
in production the public link answers that it could not send the email.

**Projection** (`/panel/proyeccion`). Day of the Dead screen for the hall: in the panel you
paste a YouTube playlist (also `music.youtube.com` and Mixes) or several videos, one per line,
and it is saved in the `projections` table (a single row). «Abrir pantalla de proyección» (open
projection screen) opens `/proyeccion` full screen, outside the panel: it plays the list in a
loop, skips videos that YouTube does not allow to be embedded and every 20 s asks whether the
list changed, so it can be changed from another computer. At the end of each loop it asks
YouTube for the list again (newly added songs come in). It is the only page whose CSP allows
YouTube frames and thumbnails (`src/proxy.ts`). Opening the screen requires `projection.view`;
changing the list, `projection.manage`. If the session expires during the event, the music keeps playing; it
just stops picking up changes. The panel also downloads the themed logo as a PNG.

**Responsive.** Tables (`@utility data-table`) stack on phones: each row is a card and cells
with `data-t="Etiqueta"` show their header. When adding a new column, give the cell a `data-t`.

Rules: an item has at most one open loan; when handed out it becomes *Prestado* (`LOANED`) and
when received *Disponible* (`AVAILABLE`), or *Mantenimiento* (`MAINTENANCE`) if returned
damaged. Everything happens in a transaction. Besides the check in the service, the database
enforces the single open loan with a partial unique index (`loans_one_open_per_item`, in the
init migration, since Prisma cannot express it in the schema).

**Transactions.** In every module, writes that take several steps (check, then write) run in a
single transaction, and status changes that depend on the current status answer 409 when
someone else changed it first.

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
- **Sessions** are stored server-side in the `sessions` table; the cookie (`httpOnly`,
  `sameSite=strict`, `secure` in production, named `__Host-admin_funca_session` in production)
  only carries a signed reference to the row. A session ends after 8 h (absolute) or 2 h
  without activity. Logging out revokes it in the database, not just in the browser, and the
  other open tabs of the panel go back to the login too (`BroadcastChannel` in
  `src/components/core/useSession.ts`). Changing the password revokes the user's other
  sessions; a password reset, a role change or deactivating the account revokes all of them.
  In *Mi cuenta* (`/panel/cuenta`) each user sees their open sessions (device, IP, last
  activity) and can close one or all the others (`/api/auth/sessions`).
- **Server-side permissions**: every endpoint goes through `withPermission(...)` (read
  permission for `GET`, write permission for changes). What the client hides is only a
  convenience.
- **Validation** of every input with Zod (in jitless mode, `src/lib/core/zodConfig.ts`, so it
  never needs `eval`).
- **Audit** of logins (failed ones too), people lookups, hand-outs, returns and account
  changes, with IP. Write-only; it is not edited or deleted. The IP comes from the `X-Real-IP`
  header set by nginx (see deployment).
- **Content Security Policy** with a new nonce on every request (`src/proxy.ts`): only scripts
  carrying the nonce run (`'strict-dynamic'`, no `'unsafe-inline'` for scripts, no `eval` in
  production), and nothing can be framed or embedded except YouTube on `/proyeccion`. Because the
  nonce is per request, pages are rendered on demand (`connection()` in `src/app/layout.tsx`),
  not prerendered. API routes get `default-src 'none'` and `Cache-Control: no-store`
  (`next.config.ts`), so responses with personal data are not cached.
- Other security **headers** (`X-Frame-Options: DENY`, `nosniff`, HSTS in production, etc.) in
  `next.config.ts`; `robots: noindex`.
- `.env` is never committed to the repository. **If `DATA_KEY` is lost, the encrypted data
  cannot be recovered**: keep it in a secrets manager and back up the database (see backups).

Pending for production (see below): mandatory HTTPS on the VPS nginx, encrypting the backups
(today the dumps are plain files with the already-encrypted columns) and an audit log retention
policy.

## Deployment on the VPS (Docker + nginx)

Same setup as the other projects: the app runs in a container that only listens on
`127.0.0.1:3020` (`APP_PORT`) and the VPS nginx publishes the domain over HTTPS.

```bash
cp .env.example .env && nano .env     # POSTGRES_PASSWORD, AUTH_SECRET, DATA_KEY (required), APP_URL, SMTP_URL…
docker compose up -d --build          # db → migrate (applies migrations and exits) → app; plus backup
docker compose run --rm -e SEED_ADMIN_PASSWORD='a-strong-password' migrate node_modules/.bin/tsx prisma/seed.ts   # first time only
```

The `Dockerfile` builds two images (targets):

- **`runner`**: the web app, Next.js standalone output (`output: "standalone"`): only the files
  the server uses, no build tools and no Prisma CLI. It runs `node server.js` and has a
  `HEALTHCHECK` on `/api/health` (checks the database, returns no data).
- **`migrator`**: Prisma CLI and the seed. By default it runs `prisma migrate deploy`; the seed
  is run on demand with `node_modules/.bin/tsx prisma/seed.ts` (command above).

`docker-compose.yml` has four services: `db` (Postgres 16, only on `127.0.0.1:5434`),
`migrate` (one-off job from the `migrator` image; `app` waits until it finishes successfully),
`app` (the `runner` image) and `backup` (see below). Keeping migrations out of the app image
also prepares the future split into a separate back end and front end.

`docker compose` refuses to start if `POSTGRES_PASSWORD`, `AUTH_SECRET` or `DATA_KEY` are
missing, and the app refuses to run in production with an `AUTH_SECRET` or `DATA_KEY` shorter
than 32 characters. In production the seed only creates `admin`, refuses to run without a
`SEED_ADMIN_PASSWORD` of at least 10 characters, and forces a password change on first login;
the other users are created from *Usuarios y roles*.

The `app` container runs as a non-root user (`nextjs`) with a read-only filesystem (only
`/tmp` and `.next/cache` are writable tmpfs), `cap_drop: ALL` and `no-new-privileges`, and with
`TZ=America/Bogota`; `migrate` also runs as a non-root user with a read-only filesystem. It must sit behind nginx, and nginx must set `X-Real-IP` (for example
`proxy_set_header X-Real-IP $remote_addr;`): the app trusts that header for the IPs in the
audit log and for rate limits.

Update: `git pull && docker compose up -d --build` (new migrations are applied by `migrate`
before the new `app` starts). Logs: `docker compose logs -f app` (`migrate` for migrations).

## Backups

- **Automatic**: the `backup` service runs `scripts/backup-loop.sh`: one `pg_dump -Fc`
  (compressed custom format) when it starts and then every day at `BACKUP_HOUR` (default `02`,
  Bogotá time) into `./backups/admin_funca-YYYYMMDD-HHMMSS.dump`, deleting dumps older than
  `BACKUP_KEEP_DAYS` (default 30). Both are set in `.env`.
- **Manual**: `./scripts/backup.sh` (from the project root on the server) writes a dump in the
  same folder right away.
- **Restore**: `docker compose stop app`, then `./scripts/restore.sh backups/<file>.dump`. It
  asks you to type `restore` to confirm and **replaces** the data of the current database with
  the dump. Then `docker compose start app`.

`backups/` is git-ignored (the dumps contain personal data). Copy `./backups` off the server
regularly: a backup on the same disk does not survive losing the disk. Documents and phones in
a dump can only be read with `DATA_KEY`, so keep the key safe too, but not next to the dumps.

## Suggested next steps

- Printing barcode labels (Code 128) for items and ID cards from the platform.
- More modules per role: academic coordination (timetables, teachers), administrative
  coordination (cash desk, suppliers).
- Encrypted, off-server copies of the backups and `DATA_KEY` rotation (re-encryption).
- Notifications for overdue loans.
