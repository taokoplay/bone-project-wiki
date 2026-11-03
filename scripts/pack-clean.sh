#!/usr/bin/env bash
# Stage runtime files only; tests and development fixtures never ship.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
stage="$(mktemp -d "${PI_SCRATCH_DIR:-${TMPDIR:-/tmp}}/bone-project-wiki-pack.XXXXXX")"
trap 'rm -rf "$stage"' EXIT
cp "$root/manifest.json" "$root/main.cjs" "$root/core.cjs" "$root/service.cjs" "$root/extension.mjs" "$root/README.md" "$root/CHANGELOG.md" "$stage/"
mkdir -p "$stage/renderer"
cp "$root/renderer/index.html" "$root/renderer/styles.css" "$root/renderer/host-tokens.css" "$root/renderer/app.mjs" "$root/renderer/content.mjs" "$root/renderer/controls.mjs" "$root/renderer/i18n.mjs" "$stage/renderer/"
cp -R "$root/skills" "$stage/skills"
cli="${PI_PLUGIN_CLI:-}"
if [ -z "$cli" ]; then
  if command -v pi-plugin >/dev/null 2>&1; then
    cli="$(command -v pi-plugin)"
  elif [ -f /Users/xutaoyu/CodeSource/GPL/PI-Desktop/packages/plugin-devkit/dist/cli.js ]; then
    cli=/Users/xutaoyu/CodeSource/GPL/PI-Desktop/packages/plugin-devkit/dist/cli.js
  fi
fi
if [ -z "$cli" ]; then
  echo 'Set PI_PLUGIN_CLI to the plugin-devkit CLI.' >&2
  exit 1
fi
case "$cli" in
  *.js) node "$cli" pack "$stage" --out "$root/dist" ;;
  *) "$cli" pack "$stage" --out "$root/dist" ;;
esac
