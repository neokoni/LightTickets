#!/bin/bash
set -u -o pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BLOCKING_FAILURES=()
WARNINGS=()

run_check() {
  local label="$1"
  local severity="$2"
  local workdir="$3"
  shift 3

  echo "=== ${label} ==="
  if (
    cd "${ROOT_DIR}/${workdir}" &&
    "$@"
  ); then
    echo "[pass] ${label}"
  else
    local status=$?
    if [[ "${severity}" == "blocking" ]]; then
      BLOCKING_FAILURES+=("${label} (exit ${status})")
      echo "[blocking failure] ${label} (exit ${status})"
    else
      WARNINGS+=("${label} (exit ${status})")
      echo "[warning] ${label} (exit ${status})"
    fi
  fi
  echo ""
}

run_check "Backend audit" blocking backend \
  npm audit --omit=dev --audit-level=high
run_check "Frontend audit" blocking frontend \
  npm audit --omit=dev --audit-level=high
run_check "Backend depcheck" warning backend \
  npx depcheck --ignore-patterns="tests/**" --ignores="@types/*,esbuild,express-async-errors"
run_check "Frontend depcheck" warning frontend \
  npx depcheck --ignores="@types/*,@tailwindcss/vite"

echo "=== Audit summary ==="
if ((${#WARNINGS[@]} > 0)); then
  printf 'Warnings:\n'
  printf '  - %s\n' "${WARNINGS[@]}"
else
  echo "Warnings: none"
fi

if ((${#BLOCKING_FAILURES[@]} > 0)); then
  printf 'Blocking failures:\n'
  printf '  - %s\n' "${BLOCKING_FAILURES[@]}"
  exit 1
fi

echo "Blocking failures: none"
echo "Audit complete."
