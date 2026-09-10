# Session Dossier: Chromium Sidecar to Browser-WASM Pivot

Date: 2026-09-10
Repository: `/workspaces/Obsidian-Seek-MCP`
Upstream checkout: `/workspaces/Obsidian-Seek`
Target device: OnePlus 6T / Android 11 / Termux / arm64

This dossier records the complete conversation arc, verified evidence, mistakes,
changes, and current direction. It is deliberately separate from `HANDOFF.md`.
It should be treated as a session record, not as a replacement for the standing
maintenance documents.

## Executive Summary

The original working assumption was that the MCP server needed a Chromium
sidecar capable of strict WebGPU query embedding because Termux Node does not
provide WebGPU and Android `onnxruntime-node` is unavailable.

That assumption led the investigation toward a strict Chromium WebGPU path. The
sidecar initially appeared to fail at the RPC/vector boundary. A diagnostic
probe eventually proved the first failure was simpler and entirely local: the
top-level sidecar page received its own outgoing `window.postMessage` RPC request
and interpreted that request as a failed child response.

After fixing that self-message bug, the device reached the real model runtime.
The next result was:

```text
GatherBlockQuantized
Failed to create a WebGPU compute pipeline:
A valid external Instance reference no longer exists.
```

At that point the working plugin's own diagnostic report arrived. It showed that
the plugin is not successfully using WebGPU on this phone. Its actual working
path is:

```text
Obsidian WebView
  -> Seek iframe
  -> Transformers.js 4.2.0
  -> ORT-Web
  -> plain ORT WASM glue
  -> proxy worker
  -> CPU
```

The plugin report says:

- `gpuAvailable: false`
- WebGPU adapter unavailable
- WebGPU fell back because `requestAdapter returned null`
- actual device: `wasm`
- dtype: `q4`
- glue: `plain`
- proxy worker: enabled

Therefore the major pivot is:

> The goal is not to make Android Chromium WebGPU work. The goal is to make
> the MCP browser sidecar host the same browser-WASM execution path that Seek
> already uses successfully on Android.

The MCP sidecar remains potentially useful. The backend policy and test target
must change from strict WebGPU to browser-hosted WASM for this device.

## User Objective

The user wants read-only semantic retrieval over an Obsidian vault by reusing
Seek's already-generated vectors and model compatibility. The MCP server must
not become a second note-authoring system, run Git, reindex Seek, or invent a
competing vector space.

The immediate technical objective during this session was to get a real
384-dimensional query embedding across the Chromium sidecar boundary on the
OnePlus 6T.

The user strongly preferred direct investigation of the actual middle boundary,
with detailed instrumentation, rather than shallow scripts that only report an
empty object or a final invalid-vector error.

## Standing Repository Instructions Read

The session began by reading `HANDOFF.md`, followed by the required documents:

1. `CONTEXT.md`
2. `README.md`
3. `TODO.md`
4. `MCP_BLUEPRINT.md`
5. `INVESTIGATION.md`
6. `UPSTREAM.md`
7. `NOTICE.md`
8. `src/SEEK-COMPATIBILITY.md`

Important standing constraints from those documents:

- Seek owns indexing and embedding semantics.
- Chromium owns the browser Transformers.js/ORT-Web execution when used.
- Node owns MCP transport, vault access, index loading, and ranking.
- MCP is read-only.
- Do not replace browser execution with a Node approximation.
- Do not claim hardware validation from container tests.
- Preserve copied Seek code as recognizable upstream islands.
- Keep observed facts separate from hypotheses.
- Run narrow validation after edits.
- Device tests must run on the actual phone.

The standing handoff initially named this as the next action:

```sh
./device-tests/oneplus-6t/test-6.sh
```

Then inspect the flat report before changing transport code, followed by
`test-5.sh` and the requirements:

- `ok: true`
- dimension `384`
- finite values
- finite non-zero norm

## Prior Dossier Read and Deleted

The user asked that `SESSION-DOSSIER-2026-09-10.md` be read carefully and then
deleted. That dossier was read in full and deleted.

Its key instruction was preserved in working context:

- The current model ID/revision had not been proven stale.
- The browser child was reaching its ready handshake.
- The actual child load error was being collapsed into generic `Seek browser RPC failed`.
- The smallest next diagnostic change was to preserve the child's raw `error`,
  `stack`, and message payload.
- No model replacement, runtime replacement, Node approximation, or fallback
  policy change was justified before raw evidence was visible.

The deleted dossier also recorded the user's request for more investigative
probes and the preference for making direct code changes when the existing code
was demonstrably wrong.

The deleted file is intentionally not restored under its original name. This
new dossier is the durable record of the larger session and later pivot.

## Baseline Architecture

The MCP repository contains:

- `src/server.ts`: hand-written MCP stdio JSON-RPC transport.
- `src/index.ts`: vault resolution, native sidecar loading, manifest joins,
  cosine ranking, and diagnostics.
- `src/query-embedder.ts`: natural-language query embedding.
- `src/seek-compatibility.ts`: pinned model/vector contract and backend policy.
- `src/chromium-sidecar.ts`: experimental Chromium/CDP embedding boundary.
- `vendor/seek/src/iframe-runner.ts`: copied Seek browser child runtime.
- `vendor/seek/runtime/transformers.web.js`: copied browser Transformers.js runtime.
- `device-tests/oneplus-6t/test-1.sh` through `test-7.sh`: device diagnostics.

Pinned compatibility model:

```text
repo: tooape/granite-embedding-97m-multilingual-r2-GBQ4-ONNX
revision: 54db88c5667bd79b4aea24ea6027a7ef45a7bbb5
dimension: 384
dtype: q4
pooling: CLS
normalize: true
max length: 128
Transformers.js: 4.2.0
```

The indexed vectors use Seek's format-3 quantized sidecar representation. The
MCP server dequantizes native records and does not re-embed stored chunks.

## Initial Runtime Findings

Before this session, phone-side tests had established:

- Android/Termux Node is arm64.
- Node has no `navigator.gpu`.
- Node has no global `GPU`.
- `SharedArrayBuffer` and `Atomics` are available.
- Published Node WebGPU/Dawn did not provide an Android arm64 binary.
- Official `onnxruntime-node` rejected Android at install time.
- The browser-oriented WASM path under Node reached a Node-incompatible
  `blob:` module URL.
- The pinned `onnxruntime-common` dependency was corrected and installed.
- A Chromium sidecar was chosen as the experimental browser boundary.

The sidecar launch path had already reached Chromium on the OnePlus 6T:

```text
Chromium 149.0.7827.155
executable: /data/data/com.termux/files/usr/bin/chromium-browser
```

## Conversation Phase 1: Handoff Confusion

The first assistant action after reading `HANDOFF.md` attempted to run
`test-6.sh` in the container. The user stopped that action and explicitly said
to read the rest of the documents first.

The full documentation pass then happened without running device commands.
The user later clarified that the tests were already present under the device
tests folder and did not want cleanup or replacement of the existing tests.

The standing tests were preserved. A new `test-7.sh` was later added only after
the user explicitly requested it as a clean-slate diagnostic.

## Conversation Phase 2: Existing Test Logs

The user pushed logs:

```text
chromium-sidecar-20260910-151242.log
chromium-sidecar-inspect-20260910-151252.log
```

The logs showed:

- Chromium launched.
- The browser child became ready.
- `__seekEmbed` existed as a function.
- The browser state was `ready: true`, `loaded: false`.
- The sidecar returned a generic `Seek browser RPC failed`.
- No valid vector crossed CDP.

The initial interpretation correctly identified that the logs lacked the actual
child-side load error. The next diagnostic action was therefore to capture
console and exception events rather than make a speculative model change.

## Conversation Phase 3: test-7 and CDP Instrumentation

A new `device-tests/oneplus-6t/test-7.sh` was created.

Its intended behavior:

- Start the same Chromium sidecar.
- Run `inspectEmbed` with a diagnostic text.
- Capture unsolicited CDP events.
- Filter and print `Runtime.consoleAPICalled` and
  `Runtime.exceptionThrown` events.
- Preserve the existing test-5 and test-6 scripts.

To support that test, `src/chromium-sidecar.ts` was changed in a diagnostic-only
way:

- `CdpConnection` gained an event buffer.
- CDP messages without a request `id` are retained rather than discarded.
- `drainEvents()` exposes the buffered events to the sidecar.
- `ChromiumSidecar.drainCdpEvents()` exposes them to the test.

Local validation passed:

```text
npm test
3 tests passed, 0 failed
bash -n device-tests/oneplus-6t/test-7.sh
 git diff --check
```

## Conversation Phase 4: First Concrete Root Cause

The first `test-7` report was:

```text
chromium-sidecar-diagnostics-20260910-152846.log
```

It showed five browser events, including:

- `__seekEmbed invoked`
- `loading model inside browser`
- `rpc request`
- `rpc rejected`
- `__seekEmbed threw`

The rejected event had:

```text
error: undefined
stack: undefined
```

This led to a diagnostic-only change that serialized the rejected message and
printed its keys:

```text
message keys: id,type,payload
raw: {"id":"...","type":"load","payload":{...}}
```

The next report was:

```text
chromium-sidecar-diagnostics-20260910-153218.log
```

This was the decisive transport discovery. The outer page was receiving its
own outgoing message:

```json
{
  "id": "mcp-d2070c5a-f108-4e6b-baa6-6001e325706e",
  "type": "load",
  "payload": {
    "modelId": "tooape/granite-embedding-97m-multilingual-r2-GBQ4-ONNX",
    "device": "webgpu",
    "dtype": "q4",
    "skipWarmup": false,
    "revision": "54db88c5667bd79b4aea24ea6027a7ef45a7bbb5"
  }
}
```

The page's top-level `message` handler looked up the pending ID, saw that
`data.ok` was undefined, and treated the request as a rejected RPC. The child
was never given the opportunity to return its real response.

The root fix was:

```ts
if (typeof data.ok !== 'boolean') {
  console.log('[seek-debug] ignoring non-reply message', {
    id: data.id,
    type: data.type,
    keys: Object.keys(data),
  });
  return;
}
```

This was committed and pushed:

```text
695d3d5 Fix sidecar self-message handling
```

The user then pulled and reran the device test.

## Conversation Phase 5: Transport Fixed, Runtime Reached

The next report was:

```text
chromium-sidecar-diagnostics-20260910-153700.log
```

This log was much larger: 7,624 lines. That increase was meaningful. The
sidecar had stopped failing at the fake rejected request and was now receiving
actual browser runtime activity.

The first report section contained the real failure:

```text
Error: failed to call OrtRun(). ERROR_CODE: 1,
ERROR_MESSAGE: Non-zero status code returned while running GatherBlockQuantized
node. Name:'/0/auto_model/embeddings/tok_embeddings/Gather_Q4'
Status Message: Failed to create a WebGPU compute pipeline:
A valid external Instance reference no longer exists.
```

The event sequence proved:

- The child became ready.
- The model load request was dispatched.
- The model pipeline was created.
- The model load returned a result with:
  - `device: webgpu`
  - `dtype: q4`
  - `coldStartMs: approximately 22954 ms`
  - `warmupMs: approximately 559 ms`
  - `warmupSkipped: false`
- The embed request was dispatched.
- The first real embed failed inside ORT-Web at the q4 embedding-table gather.

The `loaded` state became true before the failing embed because the copied Seek
runtime reports load success after model/session setup. Its warmup loop catches
individual inference errors and continues, so warmup timing is not proof that
the warmup computations succeeded.

This moved the investigation from CDP transport to Chromium/Dawn/ORT-Web
execution. At this stage, the following were no longer the primary suspects:

- stale model ID
- wrong model revision
- vector serialization
- 384-dimensional output handling
- CDP request/reply transport
- page readiness
- model download

The remaining error was consistent with a GPU process/device/instance
invalidation, but the log did not prove an out-of-memory event. No explicit
`webgpu-device-lost` or `webgpu-uncaptured-error` event was found in the
captured output.

## Conversation Phase 6: The Plugin Report and the Pivot

The user copied reports from the plugin into:

```text
device-tests/oneplus-6t/seek-report.md
device-tests/oneplus-6t/seek-report.json
```

The JSON was committed; the Markdown summary remained locally untracked at the
last recorded repository check.

The summary report said:

```text
Platform: mobile · GPU no
Last model load: wasm (dtype=q4) · glue plain · proxy worker
webgpu fell back: requestAdapter returned null
```

The raw JSON's platform entry said:

```json
{
  "isMobile": true,
  "gpuAvailable": false,
  "gpuAdapterDescription": null,
  "gpuAdapterLimits": null,
  "crossOriginIsolated": false
}
```

The plugin's successful load entry said:

```json
{
  "requestedDevice": "wasm",
  "actualDevice": "wasm",
  "dtype": "q4",
  "embeddingDim": 384,
  "webgpuAttempted": false,
  "webgpuFailed": false,
  "glue": "plain",
  "proxy": true,
  "proxyAttempted": true,
  "proxyError": null
}
```

The plugin cold start was about 32.5 seconds. The heap remained stable, and
storage grew by about 99.5 MB for model data. The report's checks included:

```text
ort glue: plain
wasm proxy worker (inference off main thread)
running on wasm (dtype=q4)
```

This resolves the apparent contradiction:

> The plugin does not prove that WebGPU works. On this device, the plugin
> reports that WebGPU is unavailable and works by falling back to WASM.

The earlier strict sidecar test explicitly sent:

```text
device: webgpu
```

So the sidecar was testing a backend that the real plugin had already rejected
on the same phone.

The plugin's reported browser user agent was an Android WebView with Chromium
151, while the sidecar used standalone headless Chromium 149. That remains an
environment difference, but the more decisive fact is the backend mismatch:

```text
Plugin: WASM / CPU / plain glue / proxy worker
Sidecar test: WebGPU / q4 / headless Chromium
```

## What Was Learned About WASM

WASM is not GPU execution here.

- WebGPU: neural network execution through the GPU process and graphics driver.
- ORT-Web WASM: neural network execution through WebAssembly on the CPU.
- The plugin's `plain` glue is the ORT WASM runtime variant needed for the q4
  `GatherBlockQuantized` CPU kernel.
- The plugin's proxy worker moves the WASM runtime and inference off the main
  UI thread; it does not make the computation GPU work.

The browser is still involved in the WASM path, but the computation is CPU-side.

## Current MCP Backend State

`src/query-embedder.ts` currently has three relevant paths:

- `wasm`: import the copied Transformers.js web runtime directly into Node and
  run an ORT-Web WASM pipeline.
- `auto`: try the imported Node-side web runtime's WebGPU path, then fall back
  to the imported Node-side WASM path.
- `webgpu`: use the Chromium sidecar.

The direct Node browser-runtime path previously failed on the phone because the
browser-oriented runtime produced a `blob:` module URL unsupported by Node's ESM
loader. The Chromium sidecar exists specifically to supply a browser host for
that browser-oriented runtime.

Important consequence:

> The existing Chromium sidecar can likely be repurposed to run the browser
> WASM path. It should not be treated as a WebGPU-only mechanism.

The intended topology now becomes:

```text
Node MCP
  -> Chromium sidecar
      -> browser Transformers.js 4.2.0
      -> ORT-Web WASM
      -> plain ORT glue
      -> optionally proxy worker
      -> 384-value vector
  -> Node ranking and MCP transport
```

## What Was Not Done

No WASM-sidecar implementation was completed during this session.

No model replacement was made.

No Node approximation was added.

No WebGPU workaround was invented from generic search results.

No generated Markdown report was committed after it appeared as untracked.

No plugin source was directly modified. The plugin was inspected as the
reference implementation.

The device test suite was not cleaned up or replaced. Existing tests 1 through
6 were preserved; test 7 was added only as a diagnostic expansion.

## Repository Commits From This Session

The relevant commits observed during the session were:

```text
2c3b75b Test for new agent
fbc7363 gonn pass another test.
0996547 a message
 a6dc103 arsetnoiaerst
 e369426 a message
232034c a message
695d3d5 Fix sidecar self-message handling
3f47d84 a message
```

The key authored fix was:

```text
695d3d5 Fix sidecar self-message handling
```

The repository was synchronized with `origin/main` at `3f47d84` during the
last status check. The only known local untracked file then was:

```text
device-tests/oneplus-6t/seek-report.md
```

Generated device logs and reports should remain outside normal source commits
unless deliberately preserved as evidence.

## Recovery Anchors

The next agent should not treat the latest debug-heavy tree as the only source
of truth. The useful history anchors are:

- `74f2853`: initial MCP Seek-compatible query-WASM port.
- `2978012`: clean compatibility/query milestone.
- `e1e8732`: exact parent of the first sidecar commit and the last mainline
  state before `src/chromium-sidecar.ts` entered the repository.
- `3e093b3`: first Chromium WebGPU sidecar probe; beginning of the GPU detour.
- `24eee41`: beginning of the heavy debug/instrumentation sequence.
- `9750e26`, `0b41d00`, `a6dc103`: subsequent diagnostic mutations, to be
  mined for evidence rather than reapplied as a block.
- `695d3d5`: isolated transport fix that prevents outgoing page RPCs from
  being mistaken for child replies; preserve this fix where applicable.

Recommended recovery is to start from `e1e8732`, compare the pre-sidecar
`query-embedder.ts` and compatibility files, then reintroduce only the smallest
browser-WASM boundary needed for the current goal. Do not merge the debug-heavy
strict-WebGPU sequence wholesale.

## Validation Performed

Local tests passed repeatedly:

```text
npm test
3 tests passed, 0 failed
```

Shell validation passed:

```text
bash -n device-tests/oneplus-6t/test-7.sh
git diff --check
```

The container cannot prove the phone's Chromium or GPU behavior.

Device evidence progressed as follows:

1. Chromium could launch.
2. Child ready handshake succeeded.
3. Initial sidecar request/reply path falsely rejected its own request.
4. The self-message guard fixed that.
5. The actual WebGPU q4 execution failure became visible.
6. The plugin report showed that the working plugin uses WASM instead.

## Current Technical Answer

The current situation is not “MCP cannot use the model.”

The evidence says:

- The model identity is coherent.
- The model downloads in a browser host.
- The sidecar transport can reach the browser child.
- The strict WebGPU backend is unavailable or unstable on this device.
- Seek's working device path is browser-hosted WASM with plain glue and a proxy
  worker.
- The direct Node browser runtime path is blocked by Node's `blob:` module
  loader behavior.

The next implementation should be a small, explicit backend change:

1. Make the Chromium child accept a requested device of `wasm`.
2. Apply the same `overrideGlueForWasm` replacement used by Seek:
   `ort-wasm-simd-threaded.asyncify.*` -> `ort-wasm-simd-threaded.*`.
3. Keep the model, revision, dtype, pooling, normalization, max length, and
   output dimension unchanged.
4. Do not request WebGPU in the browser WASM mode.
5. Return only the prepared 384-value vector across CDP.
6. Add a focused device test or mode to exercise browser WASM and report:
   - actual backend
   - glue variant
   - cold-start time
   - embedding latency
   - vector dimension
   - finite values
   - norm
7. Only investigate a worker transfer if the direct browser-page WASM path
   works first. The plugin's worker is an optimization and isolation feature,
   not a prerequisite to prove the basic vector boundary.

The strict WebGPU mode can remain available as an experimental opt-in, but it
should not be the default target for this phone and must continue to fail
loudly rather than silently fall back when explicitly requested.

## Open Questions

1. Can the sidecar's existing browser page load ORT-Web WASM successfully on
   Android Chromium 149?
2. Does the copied runtime's plain glue resolve correctly from the CDN in the
   sidecar page?
3. Does the sidecar need `crossOriginIsolated` for the proxy worker, or can the
   direct WASM page run without it?
4. Does Android Chromium permit the worker and WASM module under the current
   localhost page and launch flags?
5. Does the plugin's WebView Chromium 151 behavior differ materially from the
   standalone Chromium 149 behavior for WASM?
6. Does the direct WASM child need the same model-loading and tokenizer options
   as the plugin's `loadModel()` implementation?
7. Does the sidecar need to retain the browser page across multiple queries to
   avoid the approximately 32-second cold start?

## Recommended Next Session Start

Read this dossier, then inspect:

- `src/chromium-sidecar.ts`
- `src/query-embedder.ts`
- `/workspaces/Obsidian-Seek/src/iframe-runner.ts`
- `/workspaces/Obsidian-Seek/src/embedder.ts`
- `/workspaces/Obsidian-Seek/device-tests` or the copied report artifacts

Before editing, state one local hypothesis and one cheap discriminating check.
The best first hypothesis is:

> The current sidecar can run the same q4 model under browser WASM if it uses
> Seek's plain glue override and avoids requesting WebGPU.

The cheapest discriminating check is a browser-side WASM load followed by one
embedding, with the report requiring a real finite vector of length 384 and a
finite non-zero norm.

Do not begin by rewriting the stack. The plugin report has already supplied the
reference backend and runtime contract. The smallest credible next change is
to make the existing sidecar execute that backend.

## Emotional and Process Context

The user was frustrated by shallow diagnostics, repeated requests to rerun
scripts, and a prior session ending before the actual boundary was understood.
The user wanted direct investigation, explicit code changes, and honest evidence.

The session initially lost time because the assistant almost ran a phone test in
the container and because the conversation repeatedly revisited whether a test
was ready. The user clarified that existing tests 1 through 6 should not be
cleaned up. The added test 7 was accepted as a focused diagnostic.

The productive turning point came when the logs were treated as evidence rather
than as generic failure output. The self-message bug was found from the raw
message keys, fixed, pushed, and verified on the phone. The second turning point
came from reading the actual plugin report instead of assuming that “the plugin
works” meant “the plugin uses WebGPU.”

The durable lesson is:

> Always compare the actual successful backend and host conditions before
> reproducing only the model ID and nominal runtime API. A working plugin may be
> succeeding through a fallback path that the experimental consumer has not yet
> implemented.
