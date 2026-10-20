#!/usr/bin/env bash
# Creates the separate database used by tests/integration and applies the migrations to it.
# Needs the dev database running (pnpm db:up) and TEST_DATABASE_URL in the root .env.
set -euo pipefail

cd "$(dirname "$0")/.."

ENV_FILE="../../.env"
[[ -f "$ENV_FILE" ]] || { echo "Missing $ENV_FILE (copy .env.example)" >&2; exit 1; }
set -a; source "$ENV_FILE"; set +a

: "${TEST_DATABASE_URL:?TEST_DATABASE_URL is not set in .env}"
db_name="${TEST_DATABASE_URL##*/}"; db_name="${db_name%%\?*}"
[[ "$db_name" == *_test ]] || { echo "Refusing: database name must end in _test (got $db_name)" >&2; exit 1; }

exists=$(docker compose -f ../../docker-compose.yml exec -T db \
  psql -U "$POSTGRES_USER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$db_name'")
if [[ "$exists" != "1" ]]; then
  docker compose -f ../../docker-compose.yml exec -T db createdb -U "$POSTGRES_USER" "$db_name"
  echo "created database $db_name"
fi

DATABASE_URL="$TEST_DATABASE_URL" pnpm exec prisma migrate deploy
echo "test database ready: $db_name"
