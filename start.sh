#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required but was not found. Install it from https://nodejs.org" >&2
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "First run - installing dependencies..."
  npm install --no-audit --no-fund
fi

exec node server/index.js
