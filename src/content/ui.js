/**
 * ui.js — Floating glassmorphic panel injected into claude.ai
 * Always shows both export + import. Closes on logout.
 */

const UI = (() => {
  let _panel = null;
  let _statusTimer = {};
  let _observer = null;
  let _importedParsed = null;
  let _closed = false;

  // ── Auto-close on logout: watch for URL becoming /login ──────
  function watchLogout() {
    let lastUrl = location.href;
    setInterval(() => {
      if (location.href === lastUrl) return;
      lastUrl = location.href;
      const loggedOut =
        location.pathname.startsWith('/login') ||
        location.pathname.startsWith('/logout') ||
        location.pathname === '/';
      if (loggedOut && _panel) {
        _panel.remove();
        _panel = null;
        _closed = true;
        if (_observer) { _observer.disconnect(); _observer = null; }
      }
    }, 800);

    // Also watch for Claude injecting the login form into the DOM
    const loginObserver = new MutationObserver(() => {
      const loginForm = document.querySelector('form[action*="login"], input[name="email"][type="email"]');
      if (loginForm && _panel) {
        _panel.remove();
        _panel = null;
        _closed = true;
        loginObserver.disconnect();
        if (_observer) { _observer.disconnect(); _observer = null; }
      }
    });
    loginObserver.observe(document.body, { childList: true, subtree: true });
  }

  // ── Panel HTML ────────────────────────────────────────────────
  function createPanel() {
    if (document.getElementById(CT.PANEL_ID)) return;

    const panel = document.createElement('div');
    panel.id = CT.PANEL_ID;
    panel.innerHTML = `
      <div class="ct-header">
        <img class="ct-logo" src="${chrome.runtime.getURL('icons/logo.png')}" alt="" />
        <span class="ct-title">Chat Transfer</span>
        <button class="ct-collapse" title="Minimize">−</button>
        <button class="ct-close" title="Close">✕</button>
      </div>
      <div class="ct-body">

        <!-- EXPORT SECTION — always visible -->
        <div class="ct-section-label">EXPORT</div>
        <button class="ct-btn ct-btn-export" id="ct-export-btn">
          <span class="ct-btn-icon">⬇</span><span>Export Current Chat</span>
        </button>
        <div class="ct-hint" id="ct-export-hint">Navigate to a chat first</div>
        <div class="ct-status" id="ct-export-status"></div>

        <div class="ct-divider"></div>

        <!-- IMPORT SECTION — always visible -->
        <div class="ct-section-label">IMPORT</div>
        <div class="ct-dropzone" id="ct-dropzone">
          <div class="ct-drop-icon">⬆</div>
          <div class="ct-drop-text">Drop .claudetransfer file</div>
          <div class="ct-drop-sub">or click to browse</div>
          <input type="file" id="ct-file-input" accept=".claudetransfer,.json" />
        </div>
        <div class="ct-preview" id="ct-preview" style="display:none">
          <div class="ct-preview-info" id="ct-preview-info"></div>
          <button class="ct-btn ct-btn-import" id="ct-inject-btn">
            <span class="ct-btn-icon">⬆</span><span>Inject into Chat</span>
          </button>
        </div>
        <div class="ct-status" id="ct-import-status"></div>

      </div>
    `;

    document.body.appendChild(panel);
    _panel = panel;
    _closed = false;
    bindEvents(panel);
    updateExportHint();

    // MutationObserver: only re-attach if NOT deliberately closed
    if (_observer) _observer.disconnect();
    _observer = new MutationObserver(() => {
      if (!_closed && !document.getElementById(CT.PANEL_ID)) {
        document.body.appendChild(panel);
      }
    });
    _observer.observe(document.body, { childList: true });

    return panel;
  }

  // ── Events ────────────────────────────────────────────────────
  function bindEvents(panel) {

    // ✕ Close — sets flag so MutationObserver won't re-add it
    panel.querySelector('.ct-close').addEventListener('click', (e) => {
      e.stopPropagation();
      _closed = true;
      if (_observer) { _observer.disconnect(); _observer = null; }
      panel.remove();
      _panel = null;
    });

    // − Collapse body
    const collapseBtn = panel.querySelector('.ct-collapse');
    collapseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const body = panel.querySelector('.ct-body');
      const hidden = body.style.display === 'none';
      body.style.display = hidden ? '' : 'none';
      collapseBtn.textContent = hidden ? '−' : '+';
    });

    // Drag to reposition
    const header = panel.querySelector('.ct-header');
    let dragging = false, sx, sy, ol, ot;
    header.addEventListener('mousedown', (e) => {
      if (e.target.closest('.ct-close, .ct-collapse')) return;
      dragging = true;
      sx = e.clientX; sy = e.clientY;
      const r = panel.getBoundingClientRect();
      ol = r.left; ot = r.top;
      document.body.style.userSelect = 'none';
    });
    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      panel.style.left = `${ol + e.clientX - sx}px`;
      panel.style.top  = `${ot + e.clientY - sy}px`;
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
    });
    document.addEventListener('mouseup', () => {
      dragging = false;
      document.body.style.userSelect = '';
    });

    // Export button
    panel.querySelector('#ct-export-btn').addEventListener('click', handleExport);

    // Drop zone
    const dropzone = panel.querySelector('#ct-dropzone');
    const fileInput = panel.querySelector('#ct-file-input');
    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('dragover',  (e) => { e.preventDefault(); dropzone.classList.add('ct-drag-over'); });
    dropzone.addEventListener('dragleave', ()  => dropzone.classList.remove('ct-drag-over'));
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('ct-drag-over');
      if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', (e) => {
      if (e.target.files[0]) handleFile(e.target.files[0]);
    });

    // Inject button
    panel.querySelector('#ct-inject-btn').addEventListener('click', handleInject);
  }

  // ── Export ────────────────────────────────────────────────────
  function updateExportHint() {
    if (!_panel) return;
    const hint = _panel.querySelector('#ct-export-hint');
    const btn  = _panel.querySelector('#ct-export-btn');
    const onChat = CT.CHAT_URL_PATTERN.test(location.href);
    hint.style.display = onChat ? 'none' : '';
    btn.disabled = !onChat;
    btn.style.opacity = onChat ? '1' : '0.45';
  }

  async function handleExport() {
    const statusEl = document.getElementById('ct-export-status');
    setStatus(statusEl, 'loading', 'Reading page...');

    try {
      const match = location.pathname.match(CT.CHAT_URL_PATTERN);
      if (!match) throw new Error('Navigate to a chat first');
      const conversationId = match[1];

      // Get org ID — cached → DOM → bridge API
      let orgId = BridgeClient._orgId;

      if (!orgId) {
        const el = document.querySelector('[data-organization-uuid]');
        if (el) orgId = el.dataset.organizationUuid;
      }
      if (!orgId) {
        setStatus(statusEl, 'loading', 'Finding account...');
        try {
          const r = await BridgeClient.request('getOrgId', {});
          orgId = r?.orgId;
        } catch (_) {}
      }
      if (!orgId) throw new Error('Could not find org ID. Click a sidebar chat first.');

      BridgeClient._orgId = orgId;

      setStatus(statusEl, 'loading', 'Fetching messages...');
      const rawData = await BridgeClient.request('conversation', { orgId, conversationId });
      const parsed  = parseConversation(rawData);

      setStatus(statusEl, 'loading', 'Saving...');
      const slug     = parsed.conversation.title.replace(/[^a-z0-9]/gi, '_').toLowerCase().slice(0, 40);
      const filename = `${slug}_${Date.now()}.claudetransfer`;
      const blob     = new Blob([JSON.stringify(parsed, null, 2)], { type: 'application/json' });
      const url      = URL.createObjectURL(blob);
      const a        = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);

      setStatus(statusEl, 'success', `✓ ${filename}`);
    } catch (err) {
      setStatus(statusEl, 'error', `✗ ${err.message}`);
    }
  }

  // ── Import ────────────────────────────────────────────────────
  function handleFile(file) {
    const statusEl  = document.getElementById('ct-import-status');
    const previewEl = document.getElementById('ct-preview');
    const infoEl    = document.getElementById('ct-preview-info');
    const injectBtn = document.getElementById('ct-inject-btn');

    if (file.size > CT.MAX_FILE_SIZE) {
      setStatus(statusEl, 'error', '✗ File too large (max 10MB)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        validateImportFile(parsed);
        _importedParsed = sanitizeImport(parsed);
        const chars = getCharCount(_importedParsed);
        infoEl.innerHTML = `
          <div class="ct-preview-title">${_importedParsed.conversation.title}</div>
          <div class="ct-preview-meta">${_importedParsed.messages.length} msgs · ${(chars/1024).toFixed(1)}K chars</div>
        `;
        previewEl.style.display = '';
        injectBtn.style.display = '';
        setStatus(statusEl, 'success', '✓ Ready to inject');
      } catch (err) {
        setStatus(statusEl, 'error', `✗ ${err.message}`);
        _importedParsed = null;
        previewEl.style.display = 'none';
      }
    };
    reader.readAsText(file);
  }

  async function handleInject() {
    const statusEl = document.getElementById('ct-import-status');
    if (!_importedParsed) { setStatus(statusEl, 'error', '✗ No file loaded'); return; }
    setStatus(statusEl, 'loading', 'Injecting...');
    try {
      const prompt = buildImportPrompt(_importedParsed);
      await BridgeClient.request('inject', { text: prompt });
      setStatus(statusEl, 'success', '✓ Done! Press Enter to send.');
      const el = document.querySelector('[contenteditable="true"]') ||
                 document.querySelector('.ProseMirror') ||
                 document.querySelector('[role="textbox"]');
      if (el) el.focus();
    } catch (err) {
      setStatus(statusEl, 'error', `✗ ${err.message}`);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────
  function setStatus(el, type, msg) {
    if (!el) return;
    el.textContent = msg;
    el.className = `ct-status ct-status-${type}`;
    el.style.display = msg ? '' : 'none';
    const key = el.id;
    if (_statusTimer[key]) clearTimeout(_statusTimer[key]);
    if (type === 'success') {
      _statusTimer[key] = setTimeout(() => { if (el) el.style.display = 'none'; }, 5000);
    }
  }

  // ── Public API ────────────────────────────────────────────────
  return {
    init() {
      if (!document.getElementById(CT.PANEL_ID)) createPanel();
      watchLogout();
    },
    onUrlChange() {
      // Restore panel if it was hidden by SPA navigation, not by user close
      if (!_closed && !document.getElementById(CT.PANEL_ID) && _panel) {
        document.body.appendChild(_panel);
      }
      updateExportHint();
    },
  };
})();
