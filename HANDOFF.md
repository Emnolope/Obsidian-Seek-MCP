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
