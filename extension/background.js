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
  console.log('ChatGPT Native Longshot: Extension installed (v2.3.6 - Native Capture)');
});

function hasSameOrigin(first, second) {
  try {
    if ('Origin' in globalThis && typeof globalThis.Origin?.from === 'function') {
      const firstOrigin = globalThis.Origin.from(first);
      const secondOrigin = globalThis.Origin.from(second);
      return !firstOrigin.opaque && !secondOrigin.opaque && firstOrigin.isSameOrigin(secondOrigin);
    }
    const firstUrl = new URL(first);
    const secondUrl = new URL(second);
    return firstUrl.origin !== 'null' && firstUrl.origin === secondUrl.origin;
  } catch {
    return false;
  }
}

function parseImageUrl(value, allowCdn = true) {
  if (typeof value !== 'string') throw new Error('Invalid image URL.');
  const url = new URL(value);
  const chatHost = ['chatgpt.com', 'chat.openai.com'].includes(url.hostname);
  const imageHost = allowCdn && (url.hostname === 'oaiusercontent.com' || url.hostname.endsWith('.oaiusercontent.com'));
  if (url.protocol !== 'https:' || url.username || url.password || url.port || (!chatHost && !imageHost)) {
    throw new Error('Unapproved image origin.');
  }
  return url;
}

function getImageSenderUrl(sender) {
  if (sender?.id !== chrome.runtime.id || !Number.isInteger(sender?.tab?.id) || sender.tab.id < 0 || sender.frameId !== 0) {
    throw new Error('Invalid image sender.');
  }
  const url = parseImageUrl(sender.url, false);
  if (sender.origin !== undefined && !hasSameOrigin(sender.origin, url.href)) {
    throw new Error('Invalid image sender origin.');
  }
  return url;
}

// This function is also serialized into the page world for origin-bound blob images.
async function readImageDataUrl(url, credentials, expectedPageOrigin = '') {
  if (expectedPageOrigin) {
    let matches;
    if ('Origin' in globalThis && typeof globalThis.Origin?.from === 'function') {
      const pageOrigin = globalThis.Origin.from(globalThis.location.href);
      const expectedOrigin = globalThis.Origin.from(expectedPageOrigin);
      matches = !pageOrigin.opaque && !expectedOrigin.opaque && pageOrigin.isSameOrigin(expectedOrigin);
    } else {
      const pageUrl = new URL(globalThis.location.href);
      matches = pageUrl.origin !== 'null' && pageUrl.origin === new URL(expectedPageOrigin).origin;
    }
    if (!matches) throw new Error('Image page origin changed.');
  }

  const maxBytes = 20 * 1024 * 1024;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  let reader;
  try {
    const response = await fetch(url, {
      credentials,
      cache: 'force-cache',
      // Refuse before following any redirect; no extra host permission is needed.
      redirect: 'error',
      signal: controller.signal,
    });
    if (!response.ok || response.redirected) throw new Error('Image request failed.');
    const mime = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!/^image\/[a-z0-9.+-]+$/.test(mime)) throw new Error('Unsupported image response.');
    if (Number(response.headers.get('content-length')) > maxBytes) throw new Error('Image is too large.');

    const chunks = [];
    let size = 0;
    reader = response.body?.getReader();
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) throw new Error('Image is too large.');
        chunks.push(value);
      }
    }
    // FileReader is not consistently available in MV3 service workers.
    const buffer = await new Blob(chunks, { type: mime }).arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return `data:${mime};base64,${btoa(binary)}`;
  } catch {
    controller.abort();
    throw new Error('Unable to read image.');
  } finally {
    reader?.releaseLock();
    clearTimeout(timer);
  }
}

async function blobUrlToDataUrlInMainWorld(sender, blobUrl, senderUrl) {
  if (typeof blobUrl !== 'string' || new URL(blobUrl).protocol !== 'blob:') {
    throw new Error('Invalid blob URL.');
  }
  // Parse the embedded URL as well: URL.origin alone discards credentials.
  parseImageUrl(blobUrl.slice(5), false);
  if (!hasSameOrigin(blobUrl, senderUrl.href)) throw new Error('Invalid blob origin.');
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: sender.tab.id, frameIds: [0] },
    world: 'MAIN',
    func: readImageDataUrl,
    args: [blobUrl, 'omit', senderUrl.origin],
  });
  if (typeof result !== 'string' || !result.startsWith('data:image/')) throw new Error('Invalid image result.');
  return result;
}

// Message listener (image conversion helpers)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    try {
      if (request?.action === 'captureViewport') {
        sendResponse({ success: true, dataUrl: await captureViewport(request.tabId, sender) });
      } else if (request?.action === 'ping') {
        sendResponse({ success: true, version: '2.3.6' });
      } else if (request?.action === 'fetchToDataUrl') {
        const senderUrl = getImageSenderUrl(sender);
        const url = parseImageUrl(request.url);
        // Only the sending ChatGPT origin may need its authentication cookies.
        const credentials = hasSameOrigin(url.href, senderUrl.href) ? 'include' : 'omit';
        sendResponse({ success: true, dataUrl: await readImageDataUrl(url.href, credentials) });
      } else if (request?.action === 'blobToDataUrl') {
        const senderUrl = getImageSenderUrl(sender);
        sendResponse({ success: true, dataUrl: await blobUrlToDataUrlInMainWorld(sender, request.blobUrl, senderUrl) });
      } else {
        sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (err) {
      // Network and scripting errors can contain signed URLs; never echo them.
      const imageRequest = ['fetchToDataUrl', 'blobToDataUrl'].includes(request?.action);
      sendResponse({ success: false, error: imageRequest ? 'Unable to read image.' : (err?.message || String(err)) });
    }
  })();

  return true; // keep the message channel open for async response
});

console.log('ChatGPT Native Longshot: Background service worker loaded (v2.3.6)');
