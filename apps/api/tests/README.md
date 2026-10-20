# API tests

One folder per role (and per concern), mirroring `src/`. Run them with `apps/api/scripts/test.sh` (see `--help`).

| Folder | What it covers |
|---|---|
| `config/` | environment parsing and fail-fast rules |
| `health/` | `/healthz`, `/readyz`, 404 shape |
| `admin/` | admin role: teachers, students and classes endpoints, validators, the class-assignment flow |
| `teacher/` | teacher role: login, classes, session endpoints, validators, services |
| `student/` | student role: login, joining a session, validators, services |
| `shared/` | several roles: `/auth/me`, profile, password, token, SSE stream, session core, event hub, PIN |
| `middleware/` | `authenticate`, `requireRole`, access guards, error handler |
| `routes/` | `access-table` (role and access of every route), `role-isolation` (every route as admin, teacher, student, anonymous), route-table integrity |
| `docs/` | generated OpenAPI document (valid, complete, a Swagger tag per role) and `/docs` endpoints |
| `cli/` | route list formatting (`pnpm routes`) |
| `security/` | headers, CORS, rate limiting |
| `seed/` | the seeder |
| `integration/` | seed, sessions and admin repositories on a real PostgreSQL |
| `helpers/` | fakes and builders shared by tests (not run on their own) |

## Conventions

- File names: `<subject>.test.ts` for units, `<endpoint>.route.test.ts` for HTTP endpoints.
- Every file groups cases as **success** first, then **failure** (named after the failure: `401`, `400`, ...).
- Test names say what happens: "rejects a wrong password", not "test 3".
- Route tests run the real Express app with an in-memory repository (`helpers/fake-database.ts`); no database needed.
- Callers are `ADMIN`, `TEACHER`, `STUDENT` from `helpers/identities.ts`.
- `middleware/access-guards.test.ts` holds the access table (who may call which access type). Change it when access rules change.
