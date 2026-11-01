#!/usr/bin/env bash
# Creates (if needed) and migrates the database the integration and end-to-end tests use: TEST_DATABASE_URL from the
# root .env. Its name must end in _test, so this never touches the development database.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -f ../../.env ]]; then set -a; source ../../.env; set +a; fi
url="${TEST_DATABASE_URL:-}"
if [[ -z "$url" ]]; then
  echo "TEST_DATABASE_URL is not set (see .env.example)." >&2
  exit 1
fi
name="${url##*/}"
name="${name%%\?*}"
if [[ "$name" != *_test ]]; then
  echo "Refusing: the test database name must end in _test (got \"$name\")." >&2
  exit 1
fi

DATABASE_URL="$url" pnpm exec prisma migrate deploy
if [[ "${1:-}" == "--seed" ]]; then
  DATABASE_URL="$url" pnpm exec prisma db seed
fi
