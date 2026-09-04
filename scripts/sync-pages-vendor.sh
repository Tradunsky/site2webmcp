#!/usr/bin/env bash
# Sync extension MAIN/shared libraries into the GitHub Pages vendor folder.
# Used by GitHub Actions before Pages deploy (source of truth for the live site).
# Safe to run locally for preview; pages/vendor/*.js are gitignored.
# Do not fork logic — always copy from extension/.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/pages/vendor"
mkdir -p "$DEST"
cp -f "$ROOT/extension/discover.js" "$DEST/discover.js"
cp -f "$ROOT/extension/page-bridge.js" "$DEST/page-bridge.js"
echo "Synced discover.js + page-bridge.js → pages/vendor/"
