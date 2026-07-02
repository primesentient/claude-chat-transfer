# Claude Chat Transfer

> Export and import full Claude.ai conversations between accounts — instantly, with zero data loss.

A browser extension that transfers complete Claude conversations including messages, code blocks, bash commands, tool outputs, and thinking blocks. Works by reading Claude's own internal API — not fragile DOM scraping.

---

## Features

- **Full export** — captures every message, code block, bash command, tool call, command output, web searches, and file attachments
- **Full import** — injects the entire conversation into a new Claude session as a structured prompt, ready to continue
- **Safe to chain** — transfer A → B → C → ... as many times as you like; each export automatically flattens any earlier transfer it finds, so nothing nests or duplicates
- **Always-on panel** — floating glassmorphic UI lives inside claude.ai, both export and import always accessible
- **Auto-closes on logout** — panel disappears when you sign out
- **Draggable & collapsible** — stays out of your way
- **No build step** — pure vanilla JS, load unpacked and go
- **No background worker** — content scripts only, minimal permissions
- **No data leaves claude.ai** — all requests are same-origin with your own credentials

---

## Install

### Chrome / Edge / Brave

1. Download the latest zip from [Releases](../../releases)
2. Unzip it — you'll get a `claude-transfer/` folder
3. Open `chrome://extensions` (or `edge://extensions` / `brave://extensions`)
4. Turn on **Developer Mode** (top right toggle)
5. Click **Load unpacked** → select the `claude-transfer/` folder
6. Navigate to [claude.ai](https://claude.ai) — the panel appears bottom-right

### Firefox

Firefox support coming soon (requires MV2 manifest conversion).

---

## How to use

### Export a conversation

1. Open any Claude chat
2. The panel shows **Export Current Chat** (active when on a chat page)
3. Click it — your conversation downloads as `conversation_name_timestamp.claudetransfer`

### Import into a new account

1. Sign into your other Claude account
2. Start a new chat
3. Drop your `.claudetransfer` file onto the panel, or click to browse
4. Preview shows: title, message count, size — and generation number if this file already carries an earlier transfer
5. Click **Inject into Chat** — the full conversation is pasted into Claude's input
6. Hit Enter — Claude gives one short line confirming it's caught up, then continues naturally from your next message

You can repeat this any number of times across any number of accounts. Each new export re-flattens the full history first, so a conversation that's already been transferred once (or several times) still comes out as a single clean transcript — never nested.

---

## What gets exported

| Content type | Exported |
|---|---|
| Human messages | ✅ Full text |
| Claude responses | ✅ Full text |
| Code blocks | ✅ With language tag |
| Bash / terminal commands | ✅ With `[BASH COMMAND]` label |
| Command output / results | ✅ With `[COMMAND OUTPUT]` label |
| Web searches | ✅ With query |
| Web fetch results | ✅ With URL |
| Tool calls (generic) | ✅ With JSON input |
| Thinking blocks | ✅ Preserved |
| File attachment names | ✅ Listed (file content not exported) |
| Branched conversations | ✅ Active branch only (walks `current_leaf_message_uuid`) |
| Prior transfers already in the chat | ✅ Auto-flattened into plain turns, never re-nested |

---

## Architecture

No DOM scraping. No popup. No background service worker.

```
claude-transfer/
├── manifest.json                  ← MV3, content scripts only
├── icons/                         ← Extension icons
└── src/
    ├── styles.css                 ← Glassmorphic panel styles
    ├── injected/
    │   └── bridge.js              ← Injected into page context, intercepts fetch()
    └── content/
        ├── constants.js           ← Selectors & config
        ├── bridge-client.js       ← postMessage relay (promise-based API)
        ├── conversation.js        ← Parser + import prompt builder
        ├── ui.js                  ← Floating panel, all UI logic
        └── main.js                ← Orchestrator, URL change detection
```

**How the bridge works:** `bridge.js` is injected into the page's own JavaScript context (not the content script sandbox) so it can intercept `window.fetch` before React wraps it. When Claude's UI fetches conversation data from `/api/organizations/{orgId}/chat_conversations/{id}?tree=true`, the bridge captures that response and relays it to the content scripts via `postMessage`. The content scripts never touch the DOM to read data.

**Active branch:** Claude stores all conversation branches. The export walks backwards from `current_leaf_message_uuid` through `parent_message_uuid` until hitting the root UUID, giving you only the branch you were actually reading — not all branches.

**Transfer capsules & chaining:** when you inject a conversation, it's wrapped in a plain-text capsule — `[[[CT-TRANSFER v2 hops=N]]] ... [[[/CT-TRANSFER]]]`, with each turn tagged `[[3:H]]` / `[[4:A]]` — plus a short instruction telling Claude to treat it as background context, reply in one line, and defer to whatever the user asks next. `parseConversation()` scans for this exact pattern on every export and unpacks it back into plain turns *before* anything gets re-wrapped, so a conversation that's already been transferred once (or ten times) is always flattened to a single, ordinary turn list first. `buildImportPrompt()` only ever adds one capsule layer on top of that flat list. That's the whole mechanism that keeps chained transfers (A → B → C → ...) from nesting.

---

## Testing

`test/capsule.test.js` regression-tests the transfer-capsule format directly (chained transfers, lookalike-content escaping, multi-capsule chats, the real JSON save/load path). No dependencies — plain Node:

```bash
cd test && node capsule.test.js
```

---

## Permissions

```json
"matches": ["https://claude.ai/*"]
```

That's it. No `tabs`, no `storage`, no `downloads` API, no external requests.

---

## Privacy

- All API calls go to `claude.ai` only, using your own session cookies (`credentials: 'include'`)
- Nothing is stored — no `localStorage`, no `chrome.storage`, no databases
- The `.claudetransfer` file is saved locally to your machine only
- No analytics, no telemetry, no phone-home

---

## Contributing

PRs welcome. Ideas for future versions:

- [ ] Firefox (MV2) support
- [ ] Export to Markdown / plain text format
- [ ] Conversation merge (combine two exports)
- [ ] Chrome Web Store listing

---

## License

MIT — free to use, modify, and distribute. See [LICENSE](LICENSE).

---

## Disclaimer

This extension is not affiliated with Anthropic. It reads data from Claude's own API using your own authenticated session. Use responsibly.
