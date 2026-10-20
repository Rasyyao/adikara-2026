# Adikara

Developer docs (structure, adding features, tests, auth, database): see [`docs/`](docs/README.md).

Monorepo with two independent apps. Each app has its own `node_modules` and lockfile; the root holds only scripts and shared config.

| Path | What | Port |
|---|---|---|
| `apps/web` | Next.js (App Router, TypeScript, Tailwind) | 3000 |
| `apps/api` | Express 5, TypeScript, Prisma | 8080 |

Versions: Node 24 (`.nvmrc`), pnpm 10.12.1, Next.js 16.4.2, Express 5, Prisma 7.10.1, PostgreSQL 16 (`pgvector/pgvector:pg16`).

## Run

```bash
cp .env.example .env
echo "NEXT_PUBLIC_API_BASE_URL=http://localhost:8080" > apps/web/.env.local
pnpm install:all      # install both apps
pnpm db:up            # PostgreSQL
pnpm migrate          # apply migrations
pnpm seed             # admin, teacher, class and students (see Seed below)
pnpm dev              # api :8080 and web :3000
```

Check: `curl localhost:8080/healthz` and `curl localhost:8080/readyz` (the latter needs the database).

## Database

- PostgreSQL 16 with the pgvector extension available, host port **5433** (inside Docker: `db:5432`).
- Browse data with Prisma Studio: `pnpm --dir apps/api exec prisma studio`.
- Stop with `pnpm db:down` (data stays in Docker volumes).

## Scripts (root)

`install:all`, `dev`, `db:up`, `db:down`, `migrate`, `seed`, `test`, `routes`, `openapi`.

## API source layout (`apps/api/src`)

Three layers, and inside each layer a folder per **role** (`admin`, `teacher`, `student`, `shared`), so a failing URL leads straight to its files:

| Folder | Role |
|---|---|
| `routes/<role>/` | route tables (path, method, access type, handler); `routes/index.ts` mounts them |
| `services/<role>/` | business rules; no Express, no Prisma |
| `repositories/<role>/` | the only code that touches Prisma |
| `types/<role>/`, `http/validators/<role>/` | repository interfaces; input checks |
| `http/`, `lib/` | middleware and error type; password hashing, JWT, PIN, event hub |
| `config/`, `db/` | env parsing, Prisma client |

Flow: `routes -> services -> repositories`. For example "admin moves a student" is `routes/admin/students.routes.ts` → `services/admin/student.service.ts` → `repositories/admin/student.repository.ts`. See [docs/architecture.md](docs/architecture.md).

## Roles

| Role | What it does | Where |
|---|---|---|
| **Admin** | creates and manages teachers, students and classes; assigns a class to a teacher and students to a class | [docs/admin.md](docs/admin.md) |
| **Teacher** | sees their own classes, runs live sessions with a PIN, reads attendance | [docs/sessions.md](docs/sessions.md) |
| **Student** | logs in, joins the live session of their own class | [docs/sessions.md](docs/sessions.md) |

## Auth

Roles: `ADMIN` and `TEACHER` (teachers table), `USER` (students table).

| Endpoint | Who | Body |
|---|---|---|
| `POST /api/v1/auth/login` | admin, teacher | `{ "email", "password" }` |
| `POST /api/v1/auth/student/login` | student | `{ "username", "password" }` |
| `GET /api/v1/auth/me` | any logged-in role | header `Authorization: Bearer <token>` |

Routes are declared as a table per role and feature in `apps/api/src/routes/<role>/<name>.routes.ts` and mounted from `apps/api/src/routes/index.ts`. Each route names an access type instead of wiring middleware:

| Access | Who may call |
|---|---|
| `public` | anyone |
| `authenticated` | any logged-in account |
| `student` | students (`USER`) |
| `staff` | teachers and admins |
| `admin` | admins |

```ts
{ method: "get", path: "/classes", access: "staff", handler }
```

Middleware lives in `apps/api/src/http/middleware/` (`authenticate`, `requireRole`, `access`, `rate-limit`, `error-handler`).
Passwords use bcrypt, tokens are HS256 JWT, login is rate limited, and the API refuses to start without a `JWT_SECRET` of 32+ characters.

## Seed

One file: `apps/api/prisma/seed.ts`. Run it with `pnpm seed`; no `.env` values are needed in development.

| Role | Login | Endpoint |
|---|---|---|
| ADMIN | `admin@adikara.com` | `/auth/login` |
| TEACHER | `guru@example.com` | `/auth/login` |
| USER (student) | `siswa.satu`, `siswa.dua` | `/auth/student/login` |

Password of every development account: `ChangeMe-123` (the same values as the examples in Swagger). Class code: `KELAS7A`.

- Safe to run again; in development it resets these passwords on each run.
- `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` optionally replace the admin.
- With `NODE_ENV=production` it creates only the admin, requires both variables, and never changes an existing admin.
- To change the data, edit `DEV_ACCOUNTS` / `DEV_PASSWORD` in `prisma/seed.ts` and keep the Swagger examples (`src/routes/teacher/auth.routes.ts`, `src/routes/student/auth.routes.ts`, description in `src/docs/openapi.ts`) in step. `tests/seed/seed.test.ts` fails if they drift apart.

## Route list and API docs

```bash
pnpm routes                          # all routes grouped by role and feature, with access and middleware
pnpm routes --role admin             # one role (admin | teacher | student | shared)
pnpm routes --feature auth           # one feature
pnpm routes --access admin           # one access type
pnpm routes --json                   # machine readable
pnpm openapi                         # writes apps/api/docs/openapi.json (import into Postman or Insomnia)
```

Live class sessions (PIN, lobby, attendance) are described in [docs/sessions.md](docs/sessions.md).

Swagger UI: <http://localhost:8080/docs> (spec: `/docs/openapi.json`). Endpoints are grouped by role: **Admin**, **Teacher**, **Student**, **Shared**. To try a protected endpoint, call a login endpoint, press **Authorize**, and paste the `access_token`. The UI is on by default and off when `NODE_ENV=production` unless `DOCS_ENABLED=true`.

The docs are generated from the route tables, so they cannot drift from the real routes. When you add a route, fill in its `doc` block (summary, request body, success response); `400/401/403/429/500` are added from the access type and middleware. Then run `pnpm openapi` to refresh the exported file.

## Tests

Test cases live in `apps/api/tests/<folder>/`, with the same role folders as the code (success and failure cases for each feature).

```bash
pnpm test                                    # everything
apps/api/scripts/test.sh                     # same, via the script
apps/api/scripts/test.sh admin teacher       # selected folders
apps/api/scripts/test.sh student/session-join # files by path prefix
apps/api/scripts/test.sh --list              # list folders
apps/api/scripts/test.sh --coverage          # with coverage
```

## Notes

- `.env` is git-ignored; only `.env.example` is committed.
- The Prisma client is generated into `apps/api/src/generated` on install (`pnpm --dir apps/api generate`).
- Design and conventions: see `.claude/MONOREPO_DESIGN.md` and `.claude/CLAUDE_1.md`.
