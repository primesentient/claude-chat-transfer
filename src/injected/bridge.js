/**
 * bridge.js — runs in PAGE CONTEXT (window world)
 * Intercepts window.fetch before React touches it.
 */
(function () {
  const MARKER = 'ClaudeTransfer';
  const originalFetch = window.fetch;

  let _orgId = null;

  // --- URL change detection ---
  function patchHistory(method) {
    const original = history[method];
    history[method] = function (...args) {
      const result = original.apply(this, args);
      window.dispatchEvent(new Event('ct:urlchange'));
      return result;
    };
  }
  patchHistory('pushState');
  patchHistory('replaceState');
  window.addEventListener('popstate', () => window.dispatchEvent(new Event('ct:urlchange')));

  // --- Intercept fetch: sniff org ID passively ---
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    try {
      const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');

      // Sniff org ID from ANY /api/organizations/{uuid}/... call
      if (!_orgId) {
        const orgMatch = url.match(/\/api\/organizations\/([a-f0-9-]{36})/);
        if (orgMatch) {
          _orgId = orgMatch[1];
          window.postMessage({ ct: MARKER, type: 'ct:orgid', orgId: _orgId }, '*');
        }
      }

      // Capture full conversation on tree fetch
      if (url.includes('/chat_conversations/') && url.includes('tree=true')) {
        const clone = response.clone();
        clone.json().then((data) => {
          window.postMessage({ ct: MARKER, type: 'ct:conversation', payload: data }, '*');
        }).catch(() => {});
      }
    } catch (_) {}
    return response;
  };

  // --- Active request handler ---
  window.addEventListener('message', async (event) => {
    if (event.source !== window) return;
    const msg = event.data;
    if (!msg || msg.ct !== MARKER || msg.type !== 'ct:request') return;

    const { requestId, kind, payload } = msg;

    const reply = (ok, data, error) =>
      window.postMessage({ ct: MARKER, type: 'ct:response', requestId, ok, payload: data, error }, '*');

    try {
      if (kind === 'getOrgId') {
        // 1. Return cached value from sniffed requests
        if (_orgId) { reply(true, { orgId: _orgId }); return; }

        // 2. Try known Claude API endpoints
        const endpoints = ['/api/bootstrap', '/api/account', '/api/organizations'];
        for (const ep of endpoints) {
          try {
            const res = await originalFetch(ep, { credentials: 'include' });
            if (!res.ok) continue;
            const text = await res.text();
            const match = text.match(/"uuid"\s*:\s*"([a-f0-9-]{36})"/);
            if (match) { _orgId = match[1]; reply(true, { orgId: _orgId }); return; }
            try {
              const json = JSON.parse(text);
              const id = json?.uuid || json?.[0]?.uuid ||
                         json?.memberships?.[0]?.organization?.uuid ||
                         json?.account?.memberships?.[0]?.organization?.uuid;
              if (id) { _orgId = id; reply(true, { orgId: _orgId }); return; }
            } catch (_) {}
          } catch (_) {}
        }

        reply(false, null, 'Could not find org ID. Click any conversation first, then retry.');

      } else if (kind === 'conversation') {
        const { orgId, conversationId } = payload;
        const url = `/api/organizations/${orgId}/chat_conversations/${conversationId}?tree=true&rendering_mode=messages&render_all_tools=true`;
        const res = await originalFetch(url, { credentials: 'include' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        reply(true, data);

      } else if (kind === 'inject') {
        injectText(payload.text, reply);

      } else {
        reply(false, null, 'Unknown kind: ' + kind);
      }
    } catch (err) {
      reply(false, null, err.message);
    }
  });

  // --- Text injection into Claude's contenteditable ---
  function injectText(text, reply) {
    const selectors = [
      'div[contenteditable="true"]',
      'div[data-placeholder]',
      '.ProseMirror',
      '[role="textbox"]',
    ];
    let el = null;
    for (const sel of selectors) { el = document.querySelector(sel); if (el) break; }
    if (!el) { reply(false, null, 'Could not find input area'); return; }

    el.focus();

    // Method A: execCommand
    try {
      document.execCommand('selectAll');
      if (document.execCommand('insertText', false, text)) {
        reply(true, { method: 'execCommand' }); return;
      }
    } catch (_) {}

    // Method B: direct + InputEvent
    try {
      el.textContent = text;
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      const range = document.createRange();
      range.selectNodeContents(el); range.collapse(false);
      const sel2 = window.getSelection();
      sel2.removeAllRanges(); sel2.addRange(range);
      reply(true, { method: 'InputEvent' }); return;
    } catch (_) {}

    // Method C: clipboard
    try {
      navigator.clipboard.writeText(text).then(() => {
        el.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, clipboardData: new DataTransfer() }));
        reply(true, { method: 'clipboard' });
      }).catch(() => reply(false, null, 'All injection methods failed'));
    } catch (_) {
      reply(false, null, 'All injection methods failed');
    }
  }

  window.postMessage({ ct: MARKER, type: 'ct:bridge_ready' }, '*');
})();
