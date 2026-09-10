#!/data/data/com.termux/files/usr/bin/bash
set -u

SCRIPT_PATH="$0"
if [ "${SCRIPT_PATH#/}" = "$SCRIPT_PATH" ]; then
  SCRIPT_PATH="$PWD/$SCRIPT_PATH"
fi
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$SCRIPT_PATH")" && pwd)"
ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="${SEEK_PROBE_OUT:-$ROOT/chromium-sidecar-$STAMP.log}"

mkdir -p "$(dirname -- "$OUT")"
exec > >(tee "$OUT") 2>&1

echo "=== test-5: Chromium Seek WebGPU sidecar ==="
echo "timestamp: $(date -Is 2>/dev/null || date)"
echo "repo: $ROOT"
echo "output: $OUT"
echo

run() {
  echo
  echo "+ $*"
  "$@"
  echo "exit: $?"
}

if [ ! -f "$ROOT/package.json" ] || [ ! -d "$ROOT/src" ]; then
  echo "Run this script from the Obsidian-Seek-MCP checkout."
  echo "Expected: $ROOT/package.json and $ROOT/src"
  exit 1
fi

cd "$ROOT" || exit 1

echo "--- phone and runtime ---"
run uname -a
run getprop ro.product.cpu.abi 2>/dev/null || true
run getprop ro.hardware 2>/dev/null || true
run getprop ro.soc.model 2>/dev/null || true
run node --version
run npm --version
run nproc
run node --experimental-strip-types --input-type=module -e '
console.log(JSON.stringify({
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  navigatorGpu: typeof navigator?.gpu,
  gpuGlobal: typeof GPU,
  sharedArrayBuffer: typeof SharedArrayBuffer,
  atomics: typeof Atomics,
}, null, 2));
'

echo
echo "--- Chromium executable discovery ---"
CHROMIUM="${SEEK_CHROMIUM_PATH:-}"
if [ -z "$CHROMIUM" ]; then
  for candidate in chromium chromium-browser google-chrome google-chrome-stable; do
    if command -v "$candidate" >/dev/null 2>&1; then
      CHROMIUM="$(command -v "$candidate")"
      break
    fi
  done
fi
if [ -z "$CHROMIUM" ]; then
  echo "No Chromium executable found on PATH."
  echo "Install a Termux Chromium package or rerun with:"
  echo "SEEK_CHROMIUM_PATH=/absolute/path/to/chromium $SCRIPT_PATH"
  exit 2
fi
echo "chromium: $CHROMIUM"
run "$CHROMIUM" --version

echo
echo "--- strict Chromium WebGPU embedding ---"
echo "Chromium owns the Seek browser runtime and WebGPU; Node receives only the vector."
SEEK_CHROMIUM_PATH="$CHROMIUM" SEEK_MCP_DEVICE=webgpu node --experimental-strip-types --input-type=module -e '
const { ChromiumSidecar } = await import("./src/chromium-sidecar.ts");
const sidecar = new ChromiumSidecar();
const started = Date.now();
try {
  const vector = await sidecar.embed("OnePlus 6T Chromium WebGPU sidecar probe");
  const values = Array.from(vector);
  console.log(JSON.stringify({
    ok: true,
    dimension: vector.length,
    finite: values.every(Number.isFinite),
    norm: Math.sqrt(values.reduce((sum, value) => sum + value * value, 0)),
    firstValues: values.slice(0, 8),
    elapsedMs: Date.now() - started,
  }, null, 2));
} catch (error) {
  console.log(JSON.stringify({
    ok: false,
    elapsedMs: Date.now() - started,
    error: String(error),
    stack: error instanceof Error ? error.stack : null,
  }, null, 2));
  process.exitCode = 1;
} finally {
  await sidecar.close();
}
'

echo
echo "=== test-5 complete ==="
echo "Send this log file back: $OUT"