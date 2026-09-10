#!/data/data/com.termux/files/usr/bin/bash
set -u

SCRIPT_PATH="$0"
if [ "${SCRIPT_PATH#/}" = "$SCRIPT_PATH" ]; then SCRIPT_PATH="$PWD/$SCRIPT_PATH"; fi
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$SCRIPT_PATH")" && pwd)"
ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="${SEEK_PROBE_OUT:-$ROOT/chromium-sidecar-inspect-$STAMP.log}"
mkdir -p "$(dirname -- "$OUT")"
exec > >(tee "$OUT") 2>&1

echo "=== test-6: inspect raw Chromium Seek RPC result ==="
echo "timestamp: $(date -Is 2>/dev/null || date)"
echo "repo: $ROOT"
echo "output: $OUT"
echo

CHROMIUM="${SEEK_CHROMIUM_PATH:-}"
if [ -z "$CHROMIUM" ]; then
  for candidate in chromium chromium-browser google-chrome google-chrome-stable; do
    if command -v "$candidate" >/dev/null 2>&1; then CHROMIUM="$(command -v "$candidate")"; break; fi
  done
fi
if [ -z "$CHROMIUM" ]; then
  echo "No Chromium executable found."
  exit 2
fi
echo "chromium: $CHROMIUM"
"$CHROMIUM" --version

echo
echo "--- raw result inspection ---"
SEEK_CHROMIUM_PATH="$CHROMIUM" SEEK_MCP_DEVICE=webgpu node --experimental-strip-types --input-type=module -e '
const { ChromiumSidecar } = await import("./src/chromium-sidecar.ts");
const sidecar = new ChromiumSidecar();
try {
  const report = await sidecar.inspectEmbed("OnePlus 6T raw RPC inspection");
  console.log(report);
} catch (error) {
  console.log(JSON.stringify({ ok: false, error: String(error), stack: error instanceof Error ? error.stack : null }, null, 2));
  process.exitCode = 1;
} finally {
  await sidecar.close();
}
'

echo
echo "=== test-6 complete ==="
echo "Send this log file back: $OUT"