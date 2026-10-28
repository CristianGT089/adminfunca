@README.md

## Project rules

- **Language**: code in English (identifiers, files, folders, API routes, JSON keys, comments, logs,
  audit actions); **user interface in Spanish** (every text the user sees, validation messages,
  `BusinessError` messages, emails, page URLs such as `/panel/inventario` or `/solicitar-cita`).
- Core (`src/lib/core`) imports nothing from `src/lib/modules`. Module-specific code lives under
  `lib/modules/<slug>/`, `app/api/<slug>/` and `components/<slug>/` (pages under `app/panel/<spanish-url>/`).
- Every endpoint is exported with `withPermission("<permission>", handler)` and validates the body with
  `readBody(req, zodSchema)`. Never trust what the client hides.
- Personal data (document, phone): never in clear text in the database nor in the audit log `details`.
  Use `encrypt` / `searchHash` from `core/crypto.ts`.
- Sensitive actions → `audit("<module>.<action>", {...})` (English, camelCase verb).
- Database: Prisma models in PascalCase, fields in camelCase; tables (plural) and columns in snake_case via
  `@@map` / `@map`; enum values in English. Changes to `prisma/schema.prisma` → `pnpm prisma migrate dev --name <name>`.
- Tables: use `className="data-table"` and put `data-t="Etiqueta"` on every cell except the first (on phones
  rows stack as cards and that label is the header). Check every new screen at 390 px width.
- Business-rule errors: `throw new BusinessError(message, status)` in the service and `errorResponse(e)` in
  the endpoint (`core/http.ts`).
- Server dates: local time (the container runs with `TZ=America/Bogota`).
- Before calling something done: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.

## Pending (information missing from the user)

- **Payroll**: the actual variable-pay document for modules (rate per program and student range). Today each
  person has a base hourly rate and each entry can set its own (required for courses). Review requirements live
  in `lib/modules/payroll/schemas.ts` (`REQUIREMENTS`) and are adjusted with academic coordination.
- **Q10**: sample of the reports it exports and Uparsistem's answer about its API, to import modules per
  teacher and students per group. There is no public documentation.
- **Psychology**: legal review of the `/privacidad` text (draft; if it changes, bump `POLICY_VERSION`), the
  real institutional email domain (`MAIL_DOMAINS`) and the SMTP account. Feedback fields will be adjusted with
  the psychologists.
- Hours of an appointment the person did not attend count towards payroll: to be confirmed.

## Visual system

Same tokens and utilities as `practicas-funca` (`globals.css`: navy `blue-*`, action yellow `gold-500`,
`card`, `btn-cta`, `eyebrow`, `pill`…) plus `field`, `field-label`, `field-scanner` and `data-table`. Public
pages (`/solicitar-cita`, `/privacidad`) use `components/public/PublicPage.tsx`. What sets this platform apart:
a `blue-950` sidebar with a `gold-500` top stripe (`components/core/Shell.tsx`); the active menu item is gold.
A single main action (`btn-cta`) per screen.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
