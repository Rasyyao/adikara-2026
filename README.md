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
pnpm db:up            # PostgreSQL + pgAdmin
pnpm migrate          # first time: name the migration "accounts"
pnpm dev              # api :8080 and web :3000
```

Check: `curl localhost:8080/healthz` and `curl localhost:8080/readyz` (the latter needs the database).

## Database

- PostgreSQL 16 with the pgvector extension available, host port **5433** (inside Docker: `db:5432`).
- pgAdmin at <http://localhost:5051> (login from `PGADMIN_DEFAULT_EMAIL` / `PGADMIN_DEFAULT_PASSWORD`).
  Register a server with host `db`, port `5432`, and the `POSTGRES_*` values from `.env`.
- Stop with `pnpm db:down` (data stays in Docker volumes).

## Scripts (root)

`install:all`, `dev`, `db:up`, `db:down`, `migrate`.

## Notes

- `.env` is git-ignored; only `.env.example` is committed.
- The Prisma client is generated into `apps/api/src/generated` on install (`pnpm --dir apps/api generate`).
- Design and conventions: see `.claude/MONOREPO_DESIGN.md` and `.claude/CLAUDE_1.md`.
