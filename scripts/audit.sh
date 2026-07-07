#!/bin/bash
set -e

echo "=== Backend audit ==="
cd backend
npm audit --omit=dev --audit-level=high || true

echo ""
echo "=== Frontend audit ==="
cd ../frontend
npm audit --omit=dev --audit-level=high || true

echo ""
echo "=== Backend depcheck ==="
cd ../backend
npx depcheck --ignore-patterns="tests/**" --ignores="@types/*,esbuild,express-async-errors" || true

echo ""
echo "=== Frontend depcheck ==="
cd ../frontend
npx depcheck --ignores="@types/*,@tailwindcss/vite" || true

echo ""
echo "Audit complete."
