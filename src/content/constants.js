/**
 * constants.js — shared selectors and config
 */
const CT = {
  MARKER: 'ClaudeTransfer',
  ROOT_UUID: '00000000-0000-4000-8000-000000000000',
  PANEL_ID: 'ct-panel',
  BRIDGE_ID: 'ct-bridge-script',
  MAX_MESSAGES: 2000,
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB

  // Transfer capsule format version. Bumping this is only needed if the
  // capsule grammar itself changes — it has nothing to do with extension
  // version in manifest.json.
  CAPSULE_VERSION: 2,

  // DOM anchors — tried in order
  TOOLBAR_ANCHORS: [
    '[data-testid="chat-menu-trigger"]',
    '[data-testid="model-selector-dropdown"]',
    'header .flex',
    'nav',
  ],

  // URL patterns
  CHAT_URL_PATTERN: /\/chat\/([a-f0-9-]{36})/,
  NEW_CHAT_PATTERNS: [
    /^https:\/\/claude\.ai\/?$/,
    /^https:\/\/claude\.ai\/new/,
  ],
};
