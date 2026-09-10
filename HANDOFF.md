# Chromium Sidecar Handoff

Last updated: 2026-09-10

## Current branch

The experimental implementation is on `chromium-sidecar`. The published
baseline remains `Obsidian-Vault-MCP-v4`; this branch must not be described as a
validated release yet.

## Verified

- Chromium `149.0.7827.155` exists on the OnePlus 6T at
  `/data/data/com.termux/files/usr/bin/chromium-browser`.
- The sidecar launches Chromium, attaches through DevTools Protocol, serves the
  copied Seek browser child, and reaches the embedding path on the phone.
- Node owns MCP transport, vault loading, and ranking. Chromium owns the
  browser Transformers.js/ORT-Web embedding path when
  `SEEK_MCP_DEVICE=webgpu` is selected.
- The model contract remains Seek's pinned Granite model, revision, q4 dtype,
  CLS pooling, normalization, and 384-dimensional output.

## Not verified

The final browser-to-Node value is not proven. Earlier probes produced an
invalid JSON result or `{}` after CDP structured-value transport. The current
diagnostic serializes a flat report inside Chromium before returning it, but the
target-device output was not available in this handoff session. Do not claim
that WebGPU embedding or a valid 384-value vector works until that report is
inspected.

## Next action

Run this on the OnePlus 6T from the repository root:

```sh
./device-tests/oneplus-6t/test-6.sh
```

Inspect the generated report for the result type, vector constructor, vector
length, finite sample values, and latency. Use those observations to choose the
smallest CDP transport change. Then run `test-5.sh` and require:

- `ok: true`
- `dimension: 384`
- all values finite
- a finite, non-zero norm

Do not replace the browser runtime with a Node approximation, silently fall
back from strict WebGPU, or make further speculative serialization changes
before the raw report is available.

## Known documentation caveats

- Historical loader counts of 6,729 loaded, 6 skipped, and 7 orphan vectors
  need to be rerun before being treated as current.
- Device scripts currently write logs to the repository root by default; use
  `SEEK_PROBE_OUT` to choose a path and do not commit generated logs.
- The separate Seek plugin exporter still writes `MCP Export/` under the hidden
  sidecar location, so visible-mode export coupling remains unfinished.