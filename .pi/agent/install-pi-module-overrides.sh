#!/usr/bin/env bash
set -euo pipefail
ROOT="${PI_PACKAGE_ROOT:-/home/apollo/.bun/install/global/node_modules/@earendil-works}"
BASE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/pi-module-overrides"
install -D "$BASE/pi-coding-agent/dist/core/agent-session-services.js" "$ROOT/pi-coding-agent/dist/core/agent-session-services.js"
install -D "$BASE/pi-coding-agent/dist/core/agent-session.js" "$ROOT/pi-coding-agent/dist/core/agent-session.js"
install -D "$BASE/pi-coding-agent/dist/modes/interactive/interactive-mode.js" "$ROOT/pi-coding-agent/dist/modes/interactive/interactive-mode.js"
install -D "$BASE/pi-coding-agent/dist/modes/interactive/components/footer.js" "$ROOT/pi-coding-agent/dist/modes/interactive/components/footer.js"
install -D "$BASE/pi-tui/dist/tui.js" "$ROOT/pi-tui/dist/tui.js"
install -D "$BASE/pi-tui/dist/components/editor.js" "$ROOT/pi-tui/dist/components/editor.js"
echo "Installed pi module overrides into $ROOT"
