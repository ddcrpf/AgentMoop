#!/usr/bin/env bash
# Builds the Claude Code plugin for one public host: dist/claude-plugin/marketplace.json + agentmoop-<version>.zip.
set -euo pipefail
BASE_URL="${1:?Usage: build-plugin.sh https://host}"
BASE_URL="${BASE_URL%/}"
[[ "$BASE_URL" =~ ^https?://[A-Za-z0-9.:-]+$ ]] || { echo "Invalid base URL" >&2; exit 1; }
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(node -p "require(process.argv[1]).version" "$ROOT/plugin/.claude-plugin/plugin.json")"
DESCRIPTION="$(node -p "JSON.stringify(require(process.argv[1]).description)" "$ROOT/plugin/.claude-plugin/plugin.json")"
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
OUT="$ROOT/dist/claude-plugin"
mkdir -p "$WORK/agentmoop"
(cd "$ROOT/plugin" && tar cf - --exclude '*.test.ts' --exclude '*.test.tsx' --exclude '.mcp.json.template' --exclude '.DS_Store' --exclude '.claude' --exclude 'tsconfig.json' .) | tar xf - -C "$WORK/agentmoop"
sed "s#__PUBLIC_BASE_URL__#${BASE_URL}#" "$ROOT/plugin/.mcp.json.template" > "$WORK/agentmoop/.mcp.json"
rm -rf "$OUT" && mkdir -p "$OUT"
ZIP="agentmoop-${VERSION}.zip"
(cd "$WORK/agentmoop" && zip -qr -X "$OUT/$ZIP" .)
SHA="$(node -e "const c=require('crypto'),f=require('fs');process.stdout.write(c.createHash('sha256').update(f.readFileSync(process.argv[1])).digest('hex'))" "$OUT/$ZIP")"
cat > "$OUT/marketplace.json" <<JSON
{ "name": "agentmoop", "owner": { "name": "AgentMoop" }, "description": "AgentMoop for Claude Code",
  "plugins": [{ "name": "agentmoop", "description": ${DESCRIPTION},
    "source": { "source": "archive", "url": "${BASE_URL}/claude-plugin/${ZIP}", "sha256": "${SHA}" } }] }
JSON
