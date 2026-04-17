# EcoClaw

EcoClaw is a layered runtime optimization system for OpenClaw-style agents.

The project is organized around five layers plus a thin plugin bridge. The core design principle is:

- `context` owns editable session/context state
- `history` owns optimization-oriented history representation
- `decision` owns structured policy decisions
- `execution` owns concrete optimization actions
- `orchestration` owns provider/session topology effects
- `openclaw-plugin` is the current runtime bridge that intercepts OpenClaw traffic and wires the layers into the live system

This separation matters because reduction, compaction, and eviction are not the same kind of work:

- `reduction` is mostly local content rewriting
- `compaction` is history representation change
- `eviction` is lifecycle downgrade of already-compacted history

They share some infrastructure, but they should not collapse into one layer.

## Current Layer Model

### 1. `context`
Path:
- `packages/layers/context`

Responsibilities:
- Build the current editable session view from storage/canonical state
- Expose message/branch-oriented context state for UI, decision, and orchestration
- Support draft-style context transforms
- Treat summary/checkpoint/handoff as context artifacts rather than magical side memory

Non-responsibilities:
- No upstream API calls
- No provider-specific fork/replay mechanics
- No optimization policy decisions
- No direct compaction/eviction execution

### 2. `history`
Path:
- `packages/layers/history`

Responsibilities:
- Derive optimization-oriented `HistoryBlock[]` from `RuntimeTurnContext.segments`
- Provide shared history chunking for reduction-adjacent history transforms, compaction, and eviction
- Provide shared rule signals and lightweight scoring
- Provide lifecycle-oriented history representation without owning policy or execution
- Own the shared lifecycle/state-machine representation for history blocks

Non-responsibilities:
- No upstream I/O
- No provider/session topology actions
- No direct archive writes
- No final decision making by itself

Why this layer exists:
- `HistoryBlock` is not a pure context model
- `HistoryBlock` is not an orchestration object
- `HistoryBlock` is a shared intermediate representation used by both decision and execution

Lifecycle ownership:
- `history` owns the shared lifecycle model itself:
  - block states
  - lifecycle labels
  - transition eligibility
- `history` does not own the actions triggered by those transitions
- transition-triggered actions still belong to `execution`

Current intended lifecycle scope:
- first version: block-oriented lifecycle (`ACTIVE -> COMPACTABLE -> COMPACTED -> EVICTABLE -> EVICTED_*`)
- future versions may add richer task/phase abstractions, but they should still remain part of shared history IR rather than execution code

### 3. `decision`
Path:
- `packages/layers/decision`

Responsibilities:
- Convert context/history signals into structured policy outputs
- Own model-based strategic judgment when semantic boundary detection requires an LLM call
- Produce:
  - `policy.decisions.reduction`
  - `policy.decisions.compaction`
  - `policy.decisions.eviction`
- Keep policy outputs explicit, inspectable, and replayable
- Estimate savings / ROI / rationale / confidence where applicable

Non-responsibilities:
- No direct mutation of context/session state
- No archive writes
- No provider fork/branch application

Signal ownership:
- rule-visible signals belong to `history`
  - chunking
  - structural/rule detection
  - repeated-read / consumed-by-write / large-block / recency signals
- model-visible signals belong to `decision`
  - semantic phase boundary
  - plan revision
  - retrieved-content-consumed style judgments

Rationale:
- model invocation is policy work, not representation derivation
- therefore the future small-model detector should live in `decision`, not in `history`

### 4. `execution`
Path:
- `packages/layers/execution`

Responsibilities:
- Apply concrete transformation actions based on policy decisions
- Own local transform implementations:
  - reduction passes
  - compaction actions
  - eviction actions
- Own shared execution-side primitives such as:
  - `atomic/archive-recovery`

Non-responsibilities:
- No final policy choice
- No provider topology changes
- No direct ownership of canonical session truth

### 5. `orchestration`
Path:
- `packages/layers/orchestration`

Responsibilities:
- Apply decisions that have session-topology consequences
- Own provider/OpenClaw-specific branch, fork, replay, rebind, and materialization behavior
- Connect execution artifacts back into the OpenClaw workflow when physical session effects are needed

Non-responsibilities:
- No low-level optimization transforms
- No ownership of intermediate history representation
- No direct scoring/policy analysis

Current priority note:
- `orchestration` is architecturally valid, but it is not the current implementation focus
- for the near-term compaction/eviction work, the main path is:
  - `history -> decision -> execution`
- `orchestration` should be treated as a reserved extension point for future topology-affecting workflows
  - multi-agent transfer
  - branch/fork materialization
  - replay rebinding

For the current plugin-centered runtime:
- OpenClaw itself still owns most session-topology behavior
- EcoClaw should avoid over-designing orchestration before the history/decision/execution path is stable

## Supporting Pieces

### `kernel`
Path:
- `packages/kernel`

Responsibilities:
- Shared runtime types and pipeline interfaces
- Common `RuntimeTurnContext`, `ContextSegment`, `RuntimeTurnResult`, tracing, and event helpers

### `openclaw-plugin`
Path:
- `packages/openclaw-plugin`

Responsibilities:
- Runtime bridge into the live OpenClaw process
- Intercept request/response traffic through the embedded proxy
- Build the current `RuntimeTurnContext`
- Call reduction bridges today
- Persist traces and reports for benchmark/debugging

Important nuance:
- The plugin is currently both a transport bridge and a temporary layer-integration bridge
- Some decisions are still assembled inside the plugin rather than coming from the full online policy module

That is acceptable for the current reduction stage, but should not be the long-term pattern for compaction/eviction

## Data Flow

### Current live reduction path
1. OpenClaw assembles a request
2. `openclaw-plugin` intercepts it via embedded proxy
3. plugin constructs a `RuntimeTurnContext`-like view from request input
4. plugin currently builds reduction-flavored policy metadata in-place
5. `execution/reduction` reads `turnCtx.metadata.policy.decisions.reduction.instructions`
6. execution applies passes
7. plugin forwards rewritten request upstream
8. after-call reduction may run on the response
9. plugin logs pass-level traces and benchmark reports

This means:
- reduction already uses the `policy` data shape
- but reduction is not yet fully driven by the online `decision` runtime module
- the plugin currently acts as a bridge that assembles compatible reduction decisions

### Target compaction / eviction path
1. OpenClaw/plugin builds `RuntimeTurnContext`
2. `history` derives `HistoryBlock[]` from segments
3. `history` derives rule-visible signals and lifecycle state from `HistoryBlock[]`
4. `decision` analyzes `HistoryBlock[]` plus history signals and emits:
   - `policy.decisions.compaction`
   - `policy.decisions.eviction`
5. `decision` may additionally invoke model-based detectors when semantic judgment is actually needed
6. `execution` reads those decisions and performs concrete actions
7. `execution` uses `atomic/archive-recovery` to materialize stubs / pointers / recovery handles
8. `orchestration` applies topology-level effects only if/when such effects are actually needed

This is the intended clean direction:
- decision decides
- execution acts
- orchestration applies topology effects

## Current Reality: What Is Fully Wired vs Bridged

### Reduction
Status:
- Stage-complete enough for current experiments
- Fully observable
- Configurable via plugin config
- Execution side is real
- Policy shape is real
- Online policy source is still partially bridged by plugin logic

In other words:
- reduction is not fake
- but it is not yet the purest possible `decision -> execution` path

This is acceptable because the reduction goal was to first achieve:
- stable online behavior
- benchmark validation
- pass-level observability
- configuration control

### Compaction
Status:
- History-backed on the decision side
- Live plugin path already runs:
  - `policy.beforeBuild`
  - `compaction.beforeCall`
- Execution already performs real archive + stub replacement for turn-local compaction
- This is no longer a placeholder-only path
- Future work is about richer strategies, not first-time wiring

### Eviction
Status:
- History-backed on the decision side
- Live plugin path already runs:
  - `policy.beforeBuild`
  - `eviction.beforeCall`
- Execution now performs a conservative real apply:
  - archive original segment
  - replace with a recoverable cached-pointer stub
- Current eviction is still v1:
  - cached-pointer eviction is implemented
  - hard-drop eviction is intentionally deferred
- Eviction should still evolve together with compaction because both depend on the same history representation and lifecycle semantics

## Why `history` Was Added

Before adding `history`, the architecture had an ambiguity:
- `context` was too session-oriented to serve as the optimization IR
- `execution` was too action-oriented to own the shared history representation
- `orchestration` was too topology-oriented to own block semantics

`history` resolves that ambiguity.

It is the shared intermediate representation layer between:
- `context`
- `decision`
- `execution`

Conceptually:
- `context` answers: what is the current editable session view?
- `history` answers: how should that history be chunked/scored for optimization?
- `decision` answers: what should be done?
- `execution` answers: how is it done?
- `orchestration` answers: how are external/session consequences applied?

## Current `history` Scope

The first version of `history` is intentionally lightweight.

Current exports:
- `HistoryBlock`
- `HistorySignal`
- `buildHistoryBlocks(...)`
- `collectRuleSignals(...)`
- `scoreHistoryBlocks(...)`

This first version is enough to:
- avoid mixing optimization IR into `context` or `execution`
- give compaction/eviction a shared starting point
- prepare decision analyzers to consume block-oriented inputs later

It is not yet the full final lifecycle engine, but lifecycle ownership belongs here.

## Compaction / Eviction Direction

### Shared front-end
Compaction and eviction should share:
- `HistoryBlock[]`
- rule signals
- lightweight scoring
- lifecycle labels

### Separate decisions
They should still produce separate decisions:
- `CompactionDecision`
- `EvictionDecision`

### Separate actions
They should still execute separately:
- compaction changes representation
- eviction downgrades already-compacted history into cached or dropped forms

### Shared execution primitive
Both should reuse:
- `execution/atomic/archive-recovery`

This prevents duplication of:
- archive writes
- pointer/placeholder generation
- deferred recovery wiring

## Current Architectural Gaps

These are the main known gaps that still need cleanup:

1. Reduction still relies on plugin-side bridge logic to assemble policy-compatible metadata
- acceptable for now
- should not be copied into compaction/eviction

2. Eviction currently implements only the recoverable cached-pointer path, not stronger dropped semantics

3. Full online policy module is not yet the sole source of all live optimization decisions

## Immediate Implementation Direction

The next clean steps are:
1. Keep `history` as the shared lifecycle-aware IR for compaction and eviction
2. Add decision-owned model detectors only where semantic judgment is actually needed
3. Evolve eviction beyond cached-pointer apply only after the v1 path is stable
4. Keep reduction stable; do not do a risky reduction re-architecture before compaction/eviction experience is complete

## Summary

The intended long-term dependency direction is:

- `context` -> `history` -> `decision` -> `execution` -> `orchestration`

with:
- `kernel` as shared runtime types
- `openclaw-plugin` as the current live integration bridge

This is the architecture we should preserve while finishing compaction and eviction.
