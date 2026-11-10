// background.js - Service Worker
// Original-style exports use native viewport pixels instead of DOM rendering.
let captureQueue = Promise.resolve();
let lastCapture = 0;

function captureViewport(tabId, sender) {
  const job = captureQueue.then(async () => {
    if (sender.id !== chrome.runtime.id || !sender.url?.startsWith(chrome.runtime.getURL(''))) {
      throw new Error('Invalid capture sender.');
    }
    if (!Number.isInteger(tabId)) throw new Error('Missing capture tab.');
    const tab = await chrome.tabs.get(tabId);
    const hostname = new URL(tab.url).hostname;
    if (!['chatgpt.com', 'chat.openai.com'].includes(hostname)) {
      throw new Error('Please open a ChatGPT conversation.');
    }
    const delay = Math.max(0, 600 - (Date.now() - lastCapture));
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    const [active] = await chrome.tabs.query({ active: true, windowId: tab.windowId });
    if (active?.id !== tabId) throw new Error(chrome.i18n?.getMessage('errNativeKeepTab') || 'Keep the conversation tab active during capture.');
    lastCapture = Date.now();
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    const [current] = await chrome.tabs.query({ active: true, windowId: tab.windowId });
    if (current?.id !== tabId) throw new Error(chrome.i18n?.getMessage('errNativeTabChanged') || 'Conversation tab changed during capture. Please retry.');
    return dataUrl;
  });
  captureQueue = job.catch(() => {});
  return job;
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('ChatGPT Native Longshot: Extension installed (v2.3.3 - Native Capture)');
});

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function blobToDataUrl(blob) {
  // MV3 service worker doesn't reliably expose FileReader, so we use arrayBuffer -> base64.
  const mime = blob.type || 'application/octet-stream';
  const buffer = await blob.arrayBuffer();
  const base64 = arrayBufferToBase64(buffer);
  return `data:${mime};base64,${base64}`;
}

async function fetchToDataUrl(url) {
  const res = await fetch(url, {
    // In extension context, host_permissions allow reading cross-origin responses without CORS.
    // Keep cookies if the URL needs them (best-effort).
    credentials: 'include',
    cache: 'force-cache',
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  const blob = await res.blob();
  return await blobToDataUrl(blob);
}

async function blobUrlToDataUrlInMainWorld(tabId, blobUrl) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: async (u) => {
      const res = await fetch(u);
      const blob = await res.blob();
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
        reader.readAsDataURL(blob);
      });
    },
    args: [blobUrl],
  });
  return result;
}

// Message listener (image conversion helpers)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    if (request.action === 'captureViewport') {
      return { success: true, dataUrl: await captureViewport(request.tabId, sender) };
    }
    if (request.action === 'ping') {
      return { success: true, version: '2.3.3' };
    }

    // Fetch a remote image and return data URL (bypass CORS via host_permissions).
    if (request.action === 'fetchToDataUrl') {
      const url = request.url;
      if (!url || typeof url !== 'string') throw new Error('Missing url');
      const dataUrl = await fetchToDataUrl(url);
      return { success: true, dataUrl };
    }

    // Convert a blob: URL by running in the page MAIN world (blob URLs are origin-bound).
    if (request.action === 'blobToDataUrl') {
      const blobUrl = request.blobUrl;
      if (!blobUrl || typeof blobUrl !== 'string') throw new Error('Missing blobUrl');
      const tabId = sender?.tab?.id;
      if (typeof tabId !== 'number') throw new Error('Missing sender tab');
      const dataUrl = await blobUrlToDataUrlInMainWorld(tabId, blobUrl);
      return { success: true, dataUrl };
    }

    return { success: false, error: 'Unknown action' };
  })()
    .then((payload) => sendResponse(payload))
    .catch((err) => sendResponse({ success: false, error: err?.message || String(err) }));

  return true; // keep the message channel open for async response
});

console.log('ChatGPT Native Longshot: Background service worker loaded (v2.3.3)');
