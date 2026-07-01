# Changelog

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
