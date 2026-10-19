#!/usr/bin/env bash
# Run API test cases, all together or per feature.
#
#   ./scripts/test.sh                    run every feature
#   ./scripts/test.sh auth               run one feature (folder under tests/)
#   ./scripts/test.sh auth middleware    run several features
#   ./scripts/test.sh auth/login-student run files matching a path prefix
#   ./scripts/test.sh --coverage         add a coverage report
#   ./scripts/test.sh --watch auth       re-run on change
#   ./scripts/test.sh --list             list features
set -euo pipefail

cd "$(dirname "$0")/.."

FEATURES_DIR="tests"
features=()
mode="run"
extra=()

list_features() {
  find "$FEATURES_DIR" -mindepth 1 -maxdepth 1 -type d ! -name helpers -exec basename {} \; | sort
}

for arg in "$@"; do
  case "$arg" in
    --list)     list_features; exit 0 ;;
    --watch)    mode="watch" ;;
    --coverage) extra+=("--coverage") ;;
    -h|--help)  sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*)         echo "Unknown option: $arg" >&2; exit 2 ;;
    *)
      if [[ -d "$FEATURES_DIR/$arg" && "$arg" != "helpers" ]]; then
        features+=("$FEATURES_DIR/$arg")
      elif compgen -G "$FEATURES_DIR/$arg*.test.ts" > /dev/null; then
        features+=("$FEATURES_DIR/$arg")
      else
        echo "Unknown feature: $arg (available: $(list_features | tr '\n' ' '))" >&2
        exit 2
      fi
      ;;
  esac
done

if [[ ${#features[@]} -eq 0 ]]; then
  features=("$FEATURES_DIR")
fi

if [[ "$mode" == "watch" ]]; then
  exec pnpm exec vitest "${features[@]}" "${extra[@]+"${extra[@]}"}"
fi
exec pnpm exec vitest run "${features[@]}" "${extra[@]+"${extra[@]}"}"
