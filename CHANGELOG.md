# Changelog

All notable changes to Claude Chat Transfer will be documented here.

## [1.0.0] — 2025

### Initial release

- Export full Claude conversations via the internal API (`?tree=true`)
- Import conversations into any Claude session via structured prompt injection
- Captures: text, code blocks, bash commands, tool calls, command outputs, web searches, thinking blocks, file attachment names
- Active branch detection via `current_leaf_message_uuid` walk
- Floating glassmorphic panel — always shows both export and import
- Auto-closes on logout
- Draggable, collapsible panel
- No build step, no background worker, no external requests
- MIT licensed
