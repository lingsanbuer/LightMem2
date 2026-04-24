# Architecture - 2026-04-22

## 3-Layer Architecture

```
transcript (raw event source, bottom layer)
    ↓
raw semantic turn (按 user-message boundary切成 turn)
    ↓
canonical (transcript-derived durable rewritten history)
```

- **Transcript**: Raw event source, bottom layer - OpenClaw session `.jsonl` files
- **Raw semantic turn**: A group of messages bounded by user-message boundaries (turn ≠ transcript message)
- **Canonical**: Durable rewritten history derived from transcript

## Key Distinctions

- `turn` ≠ `transcript message` (turn is a group, transcript is message-level)
- `seenMessageIds`: transcript ingestion ledger - records which transcript messages have been absorbed into canonical, **never deleted on eviction**
- `canonical.messages`: current durable history view - can be modified by eviction
- `transcriptMessageStableId()` uses transcript top-level `id` or fallback hash (role, toolCallId, toolName, timestamp, normalizedContent)

## memory_fault_recover vs eviction/reduction

Two different mechanisms:
- **Reduction chain**: Targets large tool results in active task, does trim/stub/recovery handle. Recovery content should NOT enter reduction again.
- **Canonical eviction chain**: Task-state driven whole task paging. Targets completed/evictable old tasks. Recovery content still part of task history and can be evicted with whole task.

## Eviction Semantics

- eviction modifies `canonical.messages` but must NOT remove IDs from `seenMessageIds` ledger
- `seenMessageIds` = transcript ingestion ledger (what has been absorbed)
- `canonical.messages` = current durable history view (what is currently visible)
- If a message id is removed from `seenMessageIds`, it would be re-appended on next sync, breaking durable eviction

## Current Module Structure

- `packages/layers/decision/` - Policy decisions
- `packages/openclaw-plugin/` - Plugin implementation

Current reality on 2026-04-24:

- plugin-local execution now lives under `packages/openclaw-plugin/src/execution/`
- `packages/layers/execution/` has been removed
- `compaction` is not part of the live runtime anymore

## Phase Priority

1. **Eviction** - task-level durable history removal
2. **Reduction** - request-level content trimming and tool-result slimming
3. **Compaction** - currently removed from runtime; reserved for future redesign if needed

## Before Call / After Call Responsibilities

### before call
- Reads current canonical transcript
- Does request-level rewrite
- Assembles messages for upstream

### after call
- Extracts new messages from transcript
- Appends to canonical transcript
- Updates raw semantic turns
- Updates task registry
- Does durable rewrite (eviction) plus request-level reduction side effects that were already materialized upstream
