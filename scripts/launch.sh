#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."

TASK_NODE="$(command -v node || true)"
if [ -z "$TASK_NODE" ]; then
  for candidate in /opt/homebrew/bin/node /usr/local/bin/node "$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"; do
    if [ -x "$candidate" ]; then TASK_NODE="$candidate"; break; fi
  done
fi
if [ -z "$TASK_NODE" ]; then
  echo "Please install Node.js 24 LTS from https://nodejs.org/en/download and reopen this window."
  exit 1
fi
export PATH="$(dirname "$TASK_NODE"):$PATH"
"$TASK_NODE" -e 'const [major,minor]=process.versions.node.split(".").map(Number); if(major<22||(major===22&&minor<13)){console.error("Node.js 22.13 or newer is required.");process.exit(1)}'

if [ ! -d node_modules/hardhat ] || [ ! -d node_modules/vite ] || [ ! -d node_modules/@foundry-rs/anvil ]; then
  if command -v npm >/dev/null 2>&1; then
    npm install
  else
    TASK_PNPM="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/pnpm/bin/pnpm.cjs"
    if [ -f "$TASK_PNPM" ]; then
      "$TASK_NODE" "$TASK_PNPM" install --store-dir .pnpm-store
    else
      echo "Dependencies are missing. Install Node.js with npm, then run npm install."
      exit 1
    fi
  fi
fi

case "${1:-dev}" in
  dev) exec "$TASK_NODE" scripts/dev.mjs ;;
  test) exec "$TASK_NODE" scripts/test.mjs ;;
  build) "$TASK_NODE" scripts/build-guide.mjs; exec "$TASK_NODE" node_modules/vite/bin/vite.js build ;;
  fund) exec "$TASK_NODE" scripts/fund-wallet.mjs "${2:-}" ;;
  backup) exec "$TASK_NODE" scripts/manage-data.mjs backup ;;
  reset) exec "$TASK_NODE" scripts/manage-data.mjs reset ;;
  benchmark) exec "$TASK_NODE" scripts/benchmark.mjs ;;
  *) echo "Usage: bash scripts/launch.sh [dev|test|build|fund wallet-address]"; exit 1 ;;
esac
