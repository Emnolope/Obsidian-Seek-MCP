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

## Current state

This repository is intentionally restored to the working pre-sidecar WASM base.
The Chromium sidecar, the debug-heavy probe commits, and the later GPU detour are
all historical detours, not the active design. Treat the sidecar branch as
burned: it may be studied for lessons, but it is not a supported runtime path.

The active baseline is the earlier MCP core that uses the Seek-compatible WASM
query path and the read-only vault/index loader. The repository is now presenting
that working state again, not the experimental browser GPU path.

## Postmortem correction

The original MCP core was working before the Chromium sidecar experiment. The
speed gap was observed against a different host and runtime setup, not an
apples-to-apples GPU-versus-CPU benchmark. The later device evidence shows the
actual phone path is q4 WASM with plain ORT glue and a proxy worker, and the
browser WebGPU adapter is unavailable.

The sidecar experiment was a valid compatibility probe because Node could not
authoritatively run the browser runtime's `blob:` module URL, but it was not a
actionable production path for this phone. The mistake was elevating it into a
strict WebGPU solution before validating the equivalent browser-WASM path. The
repo should preserve the working core and keep any browser sidecar as a
separate prototype, not as the default backend or a supported branch state.

## Recovery map

The branch history should be treated as warning markers, not working guidance:

- `74f2853` (`Port Seek query embedding to WASM runtime`) is the original
  working MCP query-WASM port.
- `2978012` (`Align Seek compatibility guide and vector contract`) is the
  earlier compatibility milestone.
- `e1e8732` (`Document phone runtime findings and add device tests`) is the
  last pre-sidecar mainline state.
- `3e093b3` (`feat: add Chromium WebGPU sidecar probe`) is the branch split
  that introduced the wrong detour.
- `24eee41` and the later debug commits are not a usable product baseline.
- `695d3d5` is the only isolated transport fix worth keeping if a sidecar is
  ever recreated, but it is not part of the active default path.

The old sidecar branch and the debug-heavy mutation sequence are effectively
burned. They stay in history only as a cautionary trail, not as active design.

## Active engineering rules

- Default runtime: direct Seek-compatible WASM, not Chromium WebGPU.
- Browser sidecar: optional prototype only; never the default.
- Node owns MCP transport, vault access, index loading, and ranking.
- Chromium/browser runtime owns optional browser execution only when explicitly
  prototyped and separately validated.
- The server is read-only; it does not edit notes, run Git, reindex Seek, or
  create a competing vector pipeline.
- The separate plugin checkout owns exporter behavior; do not silently repair it
  here.

## Next-session checklist

Before editing, inspect the exact query/WASM compatibility path and the relevant
Seek compatibility files, especially `src/query-embedder.ts`,
`src/seek-compatibility.ts`, and the copied browser runtime under
`vendor/seek/src/`.

The active hypothesis is:

> The working Wasm path is already correct and should be restored and validated
> before any browser sidecar work is considered again.

If browser-side experimentation resumes, do it in a separate prototype branch or
local scratch state. Do not merge a new sidecar into the active default repo
without re-validating the plain WASM baseline first.

## Compatibility maintenance

Keep copied Seek blocks visibly separate, preserve their upstream layout,
ordering, comments, and control flow, and mark any MCP-specific adaptation at
narrow boundaries. Do not refactor copied Seek code into local style or rebuild
its algorithm from memory. Update `src/SEEK-COMPATIBILITY.md`, `UPSTREAM.md`,
`NOTICE.md`, fixtures, and format gates when the compatibility contract changes.

## Handoff hygiene

Record observed facts separately from hypotheses. Mark hardware results with the
device and command that produced them. Treat old branch names as historical after
an intentional revert. Generated logs belong outside the commit. Keep durable
user-facing behavior in `README.md`, ordered work in `TODO.md`, measured
investigation in `INVESTIGATION.md`, and project purpose or safety rationale in
`CONTEXT.md`.
