# API tests

One folder per feature. Run them with `apps/api/scripts/test.sh` (see `--help`).

| Folder | What it covers |
|---|---|
| `config/` | environment parsing and fail-fast rules |
| `health/` | `/healthz`, `/readyz`, 404 shape |
| `auth/` | password hashing, tokens, validators, service, and each auth endpoint |
| `middleware/` | `authenticate`, `requireRole`, access guards, error handler |
| `routes/` | route table: access type per route and table integrity (docs present, no duplicates) |
| `docs/` | generated OpenAPI document (valid, complete, security per access type) and `/docs` endpoints |
| `cli/` | route list formatting (`pnpm routes`) |
| `security/` | headers, CORS, rate limiting |
| `helpers/` | fakes and builders shared by tests (not run on their own) |

## Conventions

- File names: `<subject>.test.ts` for units, `<endpoint>.route.test.ts` for HTTP endpoints.
- Every file groups cases as **success** first, then **failure** (named after the failure: `401`, `400`, ...).
- Test names say what happens: "rejects a wrong password", not "test 3".
- Route tests run the real Express app with an in-memory repository (`helpers/fake-repository.ts`); no database needed.
- Callers are `ADMIN`, `TEACHER`, `STUDENT` from `helpers/identities.ts`.
- `middleware/access-guards.test.ts` holds the access table (who may call which access type). Change it when access rules change.
