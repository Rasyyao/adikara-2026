# Adikara

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
pnpm seed             # create the first admin from SEED_ADMIN_* in .env
pnpm dev              # api :8080 and web :3000
```

Check: `curl localhost:8080/healthz` and `curl localhost:8080/readyz` (the latter needs the database).

## Database

- PostgreSQL 16 with the pgvector extension available, host port **5433** (inside Docker: `db:5432`).
- Browse data with Prisma Studio: `pnpm --dir apps/api exec prisma studio`.
- Stop with `pnpm db:down` (data stays in Docker volumes).

## Scripts (root)

`install:all`, `dev`, `db:up`, `db:down`, `migrate`, `seed`, `test`.

## API source layout (`apps/api/src`)

Grouped by layer, one file per feature in each layer (`auth.*`):

| Folder | Role |
|---|---|
| `routes/` | route tables (path, method, access type, handler) and `index.ts` that mounts them |
| `services/` | business rules; no Express, no Prisma |
| `repositories/` | the only code that touches Prisma |
| `types/` | shared types |
| `http/` | middleware, validators, error type |
| `lib/` | password hashing, JWT |
| `config/`, `db/` | env parsing, Prisma client |

Flow: `routes -> services -> repositories`. A service may call another service, never another feature's repository.

## Auth

Roles: `ADMIN` and `TEACHER` (teachers table), `USER` (students table).

| Endpoint | Who | Body |
|---|---|---|
| `POST /api/v1/auth/login` | admin, teacher | `{ "email", "password" }` |
| `POST /api/v1/auth/student/login` | student | `{ "username", "password" }` |
| `GET /api/v1/auth/me` | any logged-in role | header `Authorization: Bearer <token>` |

Routes are declared as a table per feature in `apps/api/src/routes/<name>.routes.ts` and mounted from `apps/api/src/routes/index.ts`. Each route names an access type instead of wiring middleware:

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

## Tests

Test cases live in `apps/api/tests/<feature>/` (success and failure cases per feature).

```bash
pnpm test                                    # everything
apps/api/scripts/test.sh                     # same, via the script
apps/api/scripts/test.sh auth middleware     # selected features
apps/api/scripts/test.sh auth/login-student     # files by path prefix
apps/api/scripts/test.sh --list              # list features
apps/api/scripts/test.sh --coverage          # with coverage
```

## Notes

- `.env` is git-ignored; only `.env.example` is committed.
- The Prisma client is generated into `apps/api/src/generated` on install (`pnpm --dir apps/api generate`).
- Design and conventions: see `.claude/MONOREPO_DESIGN.md` and `.claude/CLAUDE_1.md`.
