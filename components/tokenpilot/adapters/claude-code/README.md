# TokenPilot Claude Code Adapter

This adapter is the gateway-first TokenPilot integration for Claude Code.

Current scope:

- install Claude Code routing through a local Anthropic-compatible gateway
- inspect local install state with doctor
- register a real MCP-backed `memory_fault_recover` tool
- decode and forward Anthropic Messages requests through shared gateway helpers

Not implemented in this first scaffold:

- lifecycle eviction
- aggressive mode parity with OpenClaw
- in-host slash commands

Install now writes two things:

- `~/.claude/settings.json` for gateway routing and tool-search env
- `~/.claude/.claude.json` for the `tokenpilot_memory_fault_recover` MCP server

That MCP server backs the same recovery hints injected into trimmed payloads, so
Claude Code can call the real `memory_fault_recover` tool instead of only
seeing protocol text.
