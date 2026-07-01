/**
 * ui.js — Floating glassmorphic panel injected into claude.ai
 * Always shows both export + import. Closes on logout.
 * v1.1 — selective message export with Select All / Deselect All
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
          <span class="ct-btn-icon">⬇</span><span>Select Messages</span>
        </button>
        <div class="ct-hint" id="ct-export-hint">Navigate to a chat first</div>
        <div class="ct-status" id="ct-export-status"></div>

        <!-- MESSAGE SELECTION — hidden until export clicked -->
        <div class="ct-select-wrapper" id="ct-select-wrapper" style="display:none">
          <div class="ct-select-controls">
            <button class="ct-sel-ctrl-btn" id="ct-sel-all">Select All</button>
            <span class="ct-sel-divider">·</span>
            <button class="ct-sel-ctrl-btn" id="ct-sel-none">Deselect All</button>
            <span class="ct-sel-count" id="ct-sel-count"></span>
          </div>
          <div class="ct-msg-list" id="ct-msg-list"></div>
          <div class="ct-select-actions">
            <button class="ct-btn ct-btn-dl" id="ct-download-btn">
              <span class="ct-btn-icon">⬇</span><span>Download Selected</span>
            </button>
            <button class="ct-btn ct-btn-cancel" id="ct-cancel-btn">Cancel</button>
          </div>
        </div>

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

    // ✕ Close
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

    // Export button — fetch then show selection UI
    panel.querySelector('#ct-export-btn').addEventListener('click', handleFetchForSelection);

    // Select All / Deselect All
    panel.querySelector('#ct-sel-all').addEventListener('click', () => {
      panel.querySelectorAll('.ct-msg-cb').forEach(cb => cb.checked = true);
      updateSelCount();
    });
    panel.querySelector('#ct-sel-none').addEventListener('click', () => {
      panel.querySelectorAll('.ct-msg-cb').forEach(cb => cb.checked = false);
      updateSelCount();
    });

    // Download selected
    panel.querySelector('#ct-download-btn').addEventListener('click', handleDownloadSelected);

    // Cancel selection
    panel.querySelector('#ct-cancel-btn').addEventListener('click', closeSelectionUI);

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

  // ── Export: Step 1 — Fetch & show selection UI ────────────────
  let _fetchedParsed = null;

  async function handleFetchForSelection() {
    const statusEl = document.getElementById('ct-export-status');
    setStatus(statusEl, 'loading', 'Reading page...');

    try {
      const match = location.pathname.match(CT.CHAT_URL_PATTERN);
      if (!match) throw new Error('Navigate to a chat first');
      const conversationId = match[1];

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
      _fetchedParsed = parseConversation(rawData);

      setStatus(statusEl, '', '');
      showSelectionUI(_fetchedParsed);
    } catch (err) {
      setStatus(statusEl, 'error', `✗ ${err.message}`);
    }
  }

  // ── Export: Step 2 — Render selection UI ─────────────────────
  function showSelectionUI(parsed) {
    const wrapper = document.getElementById('ct-select-wrapper');
    const list    = document.getElementById('ct-msg-list');
    const exportBtn = document.getElementById('ct-export-btn');

    // Widen the panel for the list
    if (_panel) _panel.style.width = '280px';
    exportBtn.style.display = 'none';

    list.innerHTML = '';
    for (const msg of parsed.messages) {
      const preview = getMessagePreview(msg);
      const roleLabel = msg.role === 'human' ? '👤' : '🤖';
      const item = document.createElement('label');
      item.className = 'ct-msg-item';
      item.innerHTML = `
        <input type="checkbox" class="ct-msg-cb" data-index="${msg.index}" checked />
        <span class="ct-msg-role">${roleLabel}</span>
        <span class="ct-msg-preview">${preview}</span>
      `;
      item.querySelector('.ct-msg-cb').addEventListener('change', updateSelCount);
      list.appendChild(item);
    }

    wrapper.style.display = '';
    updateSelCount();
  }

  function closeSelectionUI() {
    const wrapper   = document.getElementById('ct-select-wrapper');
    const exportBtn = document.getElementById('ct-export-btn');
    wrapper.style.display = 'none';
    exportBtn.style.display = '';
    if (_panel) _panel.style.width = '220px';
    _fetchedParsed = null;
  }

  function updateSelCount() {
    const all  = document.querySelectorAll('.ct-msg-cb');
    const checked = document.querySelectorAll('.ct-msg-cb:checked');
    const el   = document.getElementById('ct-sel-count');
    if (el) el.textContent = `${checked.length}/${all.length}`;

    const dlBtn = document.getElementById('ct-download-btn');
    if (dlBtn) {
      dlBtn.disabled = checked.length === 0;
      dlBtn.style.opacity = checked.length === 0 ? '0.45' : '1';
    }
  }

  function getMessagePreview(msg) {
    for (const block of msg.contentBlocks || []) {
      const t = block.text || block.code || block.result || '';
      if (t.trim()) {
        const clean = t.replace(/\n/g, ' ').trim();
        return escHtml(clean.length > 48 ? clean.slice(0, 48) + '…' : clean);
      }
    }
    if (msg.hasFiles) return `[File: ${msg.fileNames[0] || 'attachment'}]`;
    return '[no text]';
  }

  function escHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Export: Step 3 — Download selected ───────────────────────
  function handleDownloadSelected() {
    const statusEl = document.getElementById('ct-export-status');
    if (!_fetchedParsed) { setStatus(statusEl, 'error', '✗ No data loaded'); return; }

    const checked = new Set(
      [...document.querySelectorAll('.ct-msg-cb:checked')].map(cb => parseInt(cb.dataset.index))
    );

    if (checked.size === 0) { setStatus(statusEl, 'error', '✗ Select at least one message'); return; }

    const filtered = {
      ..._fetchedParsed,
      messages: _fetchedParsed.messages.filter(m => checked.has(m.index)),
    };

    try {
      setStatus(statusEl, 'loading', 'Saving...');
      const slug     = filtered.conversation.title.replace(/[^a-z0-9]/gi, '_').toLowerCase().slice(0, 40);
      const filename = `${slug}_${Date.now()}.claudetransfer`;
      const blob     = new Blob([JSON.stringify(filtered, null, 2)], { type: 'application/json' });
      const url      = URL.createObjectURL(blob);
      const a        = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);

      closeSelectionUI();
      setStatus(statusEl, 'success', `✓ ${checked.size} msg(s) saved`);
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

  function updateExportHint() {
    if (!_panel) return;
    const hint = _panel.querySelector('#ct-export-hint');
    const btn  = _panel.querySelector('#ct-export-btn');
    const onChat = CT.CHAT_URL_PATTERN.test(location.href);
    hint.style.display = onChat ? 'none' : '';
    btn.disabled = !onChat;
    btn.style.opacity = onChat ? '1' : '0.45';
  }

  // ── Public API ────────────────────────────────────────────────
  return {
    init() {
      if (!document.getElementById(CT.PANEL_ID)) createPanel();
      watchLogout();
    },
    onUrlChange() {
      if (!_closed && !document.getElementById(CT.PANEL_ID) && _panel) {
        document.body.appendChild(_panel);
      }
      updateExportHint();
    },
  };
})();
