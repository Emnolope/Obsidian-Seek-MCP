# Agent Handoff

This document is for the next human or AI agent maintaining the repository. It
is about intent, boundaries, unfinished work, and maintenance method. It is not
the user-facing setup guide and it is not a substitute for the technical
evidence in `INVESTIGATION.md`.

## Read first

Read these documents in order when taking over substantial work:

1. `CONTEXT.md` for why the project exists, its safety boundary, and its
   architecture.
2. `README.md` for how a human runs the MCP server, CLI, and device tests.
3. `TODO.md` for the ordered work list and acceptance criteria.
4. `MCP_BLUEPRINT.md` for the intended contracts and boundaries.
5. `INVESTIGATION.md` for measured evidence and known historical data.
6. `UPSTREAM.md`, `NOTICE.md`, and `src/SEEK-COMPATIBILITY.md` before changing
   compatibility code.

Read only the nearby source needed to establish a falsifiable local hypothesis
before editing. Prefer a cheap, behavior-scoped check over broad exploration.
After an edit, run the narrowest executable validation available before making
another change. Do not declare a hardware path working from container tests.

## Current handoff

The Chromium sidecar is experimental and has been merged into `main`. It is not
a validated release. Chromium `149.0.7827.155` launched on the OnePlus 6T, the
copied Seek browser path became ready, and the CDP self-message bug was fixed in
commit `695d3d5`.

The device evidence now separates two facts. The sidecar reaches the real
Transformers.js/ORT-Web runtime, but strict WebGPU fails during q4 execution
with `GatherBlockQuantized` and `A valid external Instance reference no longer
exists`. The working Seek plugin report shows that this phone has no usable
WebGPU adapter and succeeds through q4 WASM with plain ORT glue and a proxy
worker. The next discriminating implementation is therefore a browser-hosted
WASM sidecar path, not another strict-WebGPU transport probe.

Keep strict `SEEK_MCP_DEVICE=webgpu` available as an explicit experimental mode
that fails loudly. Do not replace the browser runtime with a Node approximation
or silently turn a strict WebGPU request into WASM. For the phone path, preserve
Seek's model contract and test a browser WASM embedding requiring dimension 384,
finite values, and a finite non-zero norm.

## Postmortem correction

The MCP core was working before the sidecar work. It was slower than the Seek
plugin, but that observation did not prove a GPU-versus-CPU difference. The
plugin report shows that Seek was also using CPU WASM on this phone: q4, plain
ORT glue, and a proxy worker. The comparison was between different hosts and
runtime arrangements, not between the same workload on GPU and CPU.

The sidecar was a reasonable compatibility experiment because Node could not
load the browser runtime's `blob:` module URL. The mistake was promoting it into
a strict-WebGPU solution before measuring equivalent browser-WASM execution.
The sidecar then introduced a transport bug and an unsupported/unstable backend
into the normal mental model, making the previously working core appear broken.
Preserve the core, keep the sidecar optional, and benchmark equivalent WASM
paths before making performance claims.

## Recovery map

Do not reset the repository blindly. The history has three useful anchors:

- `74f2853` (`Port Seek query embedding to WASM runtime`) is the initial MCP
  query-WASM port.
- `2978012` (`Align Seek compatibility guide and vector contract`) is the
  earlier clean compatibility/query milestone.
- `e1e8732` (`Document phone runtime findings and add device tests`) is the
  exact parent of the first sidecar commit and the last mainline state before
  `src/chromium-sidecar.ts` entered the branch.

The GPU detour begins at `3e093b3` (`feat: add Chromium WebGPU sidecar probe`).
The debug-heavy mutation begins at `24eee41`, followed by `9750e26`, `0b41d00`,
`a6dc103`, and later probe commits. Mine those commits selectively, not
wholesale. The isolated transport correction is `695d3d5`; keep it if retaining
the sidecar, but do not carry the diagnostic churn forward as production design.

## Next-session checklist

Before editing, inspect `src/chromium-sidecar.ts`, `src/query-embedder.ts`, the
copied `vendor/seek/src/iframe-runner.ts`, and the corresponding files in
`/workspaces/Obsidian-Seek`. The local hypothesis to test is:

> The existing browser child can produce the same q4 vector under WASM if it
> uses Seek's plain glue override and does not request WebGPU.

The cheapest discriminating check is one direct browser-page WASM load followed
by one embedding. Require dimension 384, finite values, and a finite non-zero
norm. Do not add worker transfer, model changes, Node approximations, or a new
GPU theory until that direct check succeeds.

The prior device evidence to retain while debugging is:

- `chromium-sidecar-diagnostics-20260910-153700.log`: strict WebGPU reached
  ORT, then failed at q4 `GatherBlockQuantized` after roughly 23 seconds of
  cold start and 559 ms of warmup.
- `device-tests/oneplus-6t/seek-report.json`: the plugin has no usable WebGPU
  adapter and works with q4 WASM, plain glue, and a proxy worker.

## Ownership boundaries

- Seek owns the indexing and embedding semantics.
- Chromium owns the optional browser Transformers.js/ORT-Web execution path;
  the validated phone reference is browser WASM, while strict WebGPU remains
  experimental.
- Node owns MCP transport, vault access, index loading, and ranking.
- The MCP server is read-only and must not edit notes, run Git, reindex Seek, or
  create a competing vector-generation pipeline.
- The separate plugin checkout owns exporter behavior; do not silently repair
  it from this repository.

## Compatibility maintenance

Seek-derived code and MCP code have different ownership even though they are
fully integrated at runtime. Keep copied Seek blocks and snapshots visibly
separate, preserve their upstream layout, naming, ordering, comments, and
control flow, and mark necessary adaptations at narrow boundaries. The goal is
the smallest edit distance from Seek, not the fewest copied lines.

When Seek changes, locate the corresponding upstream block, compare it with the
new version, and copy the largest relevant file or block before trimming. Keep
MCP-specific behavior in adjacent adapters or clearly marked edge sections.
Do not refactor copied code into local style or rebuild its algorithm from
memory. Update `src/SEEK-COMPATIBILITY.md`, `UPSTREAM.md`, `NOTICE.md`, fixtures,
and format gates when the compatibility contract changes.

## Handoff hygiene

Record observed facts separately from hypotheses. Mark hardware results with
the device and command that produced them. Treat old counts and old branch
names as historical after a merge. Generated logs belong outside the commit;
the device scripts accept `SEEK_PROBE_OUT` when a preserved log is needed.

Keep durable user-facing behavior in `README.md`, ordered work in `TODO.md`,
measured investigation in `INVESTIGATION.md`, and project purpose or safety
rationale in `CONTEXT.md`. If this document starts accumulating detailed
measurements, move them to the investigation record instead of making the
handoff a second changelog.
