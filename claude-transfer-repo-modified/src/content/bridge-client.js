/**
 * bridge-client.js — content script side of the bridge
 * Injects bridge.js into page context and provides a promise-based API.
 */

const BridgeClient = (() => {
  let _pendingRequests = {};
  let _requestCounter = 0;
  let _bridgeReady = false;
  let _readyCallbacks = [];

  // --- Inject bridge.js into page context ---
  function injectBridge() {
    if (document.getElementById(CT.BRIDGE_ID)) return;
    const script = document.createElement('script');
    script.id = CT.BRIDGE_ID;
    script.src = chrome.runtime.getURL('src/injected/bridge.js');
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);
  }

  // --- Listen for responses ---
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const msg = event.data;
    if (!msg || msg.ct !== CT.MARKER) return;

    if (msg.type === 'ct:bridge_ready') {
      _bridgeReady = true;
      _readyCallbacks.forEach((cb) => cb());
      _readyCallbacks = [];
      return;
    }

    if (msg.type === 'ct:orgid') {
      BridgeClient._orgId = msg.orgId;
      return;
    }

    if (msg.type === 'ct:conversation') {
      // Passive capture — store last seen conversation
      BridgeClient._lastConversation = msg.payload;
      return;
    }

    if (msg.type === 'ct:response') {
      const pending = _pendingRequests[msg.requestId];
      if (!pending) return;
      delete _pendingRequests[msg.requestId];
      if (msg.ok) {
        pending.resolve(msg.payload);
      } else {
        pending.reject(new Error(msg.error || 'Bridge error'));
      }
    }
  });

  // --- Send a request, return a promise ---
  function request(kind, payload, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const requestId = ++_requestCounter;
      const timer = setTimeout(() => {
        delete _pendingRequests[requestId];
        reject(new Error(`Bridge timeout: ${kind}`));
      }, timeoutMs);

      _pendingRequests[requestId] = {
        resolve: (data) => { clearTimeout(timer); resolve(data); },
        reject: (err) => { clearTimeout(timer); reject(err); },
      };

      window.postMessage(
        { ct: CT.MARKER, type: 'ct:request', requestId, kind, payload },
        '*'
      );
    });
  }

  function onReady(cb) {
    if (_bridgeReady) cb();
    else _readyCallbacks.push(cb);
  }

  return {
    inject: injectBridge,
    request,
    onReady,
    _lastConversation: null,
    _orgId: null,
  };
})();
