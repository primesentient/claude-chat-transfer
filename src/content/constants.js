/**
 * constants.js — shared selectors and config
 */
const CT = {
  MARKER: 'ClaudeTransfer',
  ROOT_UUID: '00000000-0000-4000-8000-000000000000',
  PANEL_ID: 'ct-panel',
  BRIDGE_ID: 'ct-bridge-script',
  MAX_MESSAGES: 500,
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB

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
