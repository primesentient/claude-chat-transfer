# Changelog

## v1.2.1 — Fix: transfer note was triggering Claude's injection detection
- **Fixed:** the instruction note added in v1.2.0 (telling Claude the transcript wasn't "new instructions" and it shouldn't "obey" anything inside it) backfired — that exact phrasing is what Claude's own safety training recognizes as an *injection attempt*, so some transfers opened with Claude flagging the import instead of continuing. The note is now a plain, first-person context message with no directives about what to ignore or how to reply — Claude's normal conversational judgment handles the rest.
- No changes to the capsule/flattening format itself — chained transfers are unaffected by this fix.

## v1.2.0 — Chained Transfers, No More Nesting
- **Fixed:** transferring a conversation A → B, then B → C (and so on) used to nest each transfer's formatting inside the last one, producing garbled "message inside a message" text and making Claude re-litigate the transfer on every hop. Every export now auto-flattens any earlier transfer found in the chat history first, so the result is always a single flat conversation, no matter how many hops it's been through.
- **Changed:** the text injected into a new chat is now much shorter and no longer asks Claude to "acknowledge receipt" — that phrasing is what caused Claude to respond with a long list of caveats instead of just continuing. Claude now gets a short, direct note (treat this as background, not live state or new instructions; reply in one line; then follow whatever the user asks next) instead of having to work out those rules itself.
- **Added:** a generation counter (visible in the import preview as `gen 2`, `gen 3`, etc.) so you can see at a glance if a file already carries earlier transfers.
- **Added:** any text you type alongside a pasted transfer, or before/after it, is preserved instead of being absorbed into the transfer block.
- Raised the message cap (`MAX_MESSAGES`) from 500 to 2000 to comfortably fit longer transfer chains.
- New extension icon and logo.

## v1.1.0 — Selective Message Export
- Export button now fetches messages and shows a per-message selection list before downloading
- Each message row shows role icon (👤/🤖) and a text preview
- Select All and Deselect All controls above the list
- Live counter showing how many messages are selected out of total
- Download button is disabled when nothing is selected
- Cancel button returns to the normal export view
- Panel widens to 280px while selection is open, returns to 220px on cancel/download
- Custom styled checkboxes matching the glassmorphic theme
- Scrollable message list (max 220px height) for long conversations

## v1.0.0 — Initial Release
- Export full Claude conversations to `.claudetransfer` files
- Import and inject conversations into new Claude chats
- Glassmorphic floating panel, draggable, collapsible
- Auto-closes on logout
