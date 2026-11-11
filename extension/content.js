// content.js - Extract structured chat data from ChatGPT pages

/**
 * Get all message elements on the page.
 * @returns {Array} Message element list
 */
function getMessageElements() {
  // New ChatGPT layouts identify individual user/assistant units inside a turn.
  const units = document.querySelectorAll('[data-content-search-unit-key]');
  const messageUnits = Array.from(units).filter(element =>
    /:(user|assistant)$/.test(element.getAttribute('data-content-search-unit-key') || ''));
  if (messageUnits.length) return messageUnits;
  // Prefer conversation-turn containers (stable, avoids nested role markers)
  const turnSelectors = [
    'article[data-testid^="conversation-turn"]',
    'div[data-testid^="conversation-turn"]',
    '[data-testid="conversation-turn"]',
    '.group\\/conversation-turn',
    '[class*="conversation-turn"]',
    'div[data-message-id]',
  ];

  for (const selector of turnSelectors) {
    const elements = document.querySelectorAll(selector);
    if (elements.length > 0) {
      return Array.from(elements);
    }
  }

  // Fallback: role markers exist, but may be nested. Normalize to a best-effort "turn" container.
  const roleNodes = document.querySelectorAll('[data-message-author-role]');
  if (roleNodes.length > 0) {
    const set = new Set();
    const closestTurn = (node) => {
      for (const sel of turnSelectors) {
        const t = node.closest(sel);
        if (t) return t;
      }
      // Best-effort: take a reasonable ancestor that likely wraps one message
      return node.closest('article') || node.closest('section') || node.closest('div') || node;
    };
    roleNodes.forEach((n) => set.add(closestTurn(n)));

    // Keep DOM order
    const arr = Array.from(set);
    arr.sort((a, b) => (a === b ? 0 : (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1)));
    return arr;
  }
  
  // Fallback: locate message-like blocks under the main container
  const mainContainer = document.querySelector('main') || document.querySelector('[role="main"]');
  if (mainContainer) {
    const allDivs = mainContainer.querySelectorAll('div[class*="group"]');
    return Array.from(allDivs).filter(el => {
      const text = el.textContent?.trim();
      return text && text.length > 10 && el.querySelector('p, pre, img');
    });
  }
  
  return [];
}

/**
 * Detect message role.
 * @param {Element} element - Message DOM element
 * @returns {string} 'user' or 'assistant'
 */
function getMessageRole(element) {
  const unitRole = element.getAttribute('data-content-search-unit-key')?.match(/:(user|assistant)$/)?.[1];
  if (unitRole) return unitRole;
  const roleAttr = element.getAttribute('data-message-author-role');
  
  if (roleAttr) {
    return roleAttr;
  }
  
  if (element.classList.contains('user-turn') || element.querySelector('[data-message-author-role="user"]')) {
    return 'user';
  }
  
  if (element.classList.contains('agent-turn') || element.querySelector('[data-message-author-role="assistant"]')) {
    return 'assistant';
  }
  
  // Heuristic: markdown/prose is typically assistant output
  const hasMarkdown = element.querySelector('.markdown, .prose, [class*="markdown"]');
  return hasMarkdown ? 'assistant' : 'user';
}

/**
 * Extract a short text preview for display.
 * @param {Element} element - Message DOM element
 * @returns {string} Preview text
 */
function getTextPreview(element) {
  const clone = element.cloneNode(true);
  
  // Remove code blocks to keep preview short
  clone.querySelectorAll('pre, code').forEach(el => el.remove());
  
  let text = '';
  const paragraphs = clone.querySelectorAll('p, span, li');
  
  if (paragraphs.length > 0) {
    paragraphs.forEach(p => {
      const pText = p.textContent?.trim();
      if (pText) text += pText + ' ';
    });
  } else {
    text = clone.textContent?.trim() || '';
  }
  
  text = text.trim();
  return text.length > 100 ? text.substring(0, 100) + '...' : text;
}

/**
 * Convert an image URL to base64 (best-effort).
 * @param {string} src - Image URL
 * @returns {Promise<string>} base64 string or original URL
 */
async function imageToBase64(src) {
  if (!src) return src;

  // If already base64, return as-is
  if (src.startsWith('data:')) {
    return src;
  }

  // Citation favicons are display-only: native exports already capture their pixels.
  // Their endpoint can reject CORS reads, so leave them to the browser's <img> loader.
  if (/^https:\/\/t\d+\.gstatic\.com\/faviconV2(?:[?#]|$)/i.test(src)) {
    return src;
  }

  // Cache to avoid re-fetching the same images (helps large transcripts)
  // Note: blob: URLs are unique per page instance; caching still helps within one extraction.
  if (!imageToBase64._cache) imageToBase64._cache = new Map();
  const cache = imageToBase64._cache;
  if (cache.has(src)) return cache.get(src);
  
  try {
    // First try: regular fetch (works for same-origin / CORS-enabled images)
    const response = await fetch(src, { mode: 'cors' });
    const blob = await response.blob();
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    cache.set(src, dataUrl);
    return dataUrl;
  } catch (e) {
    // Fallbacks:
    // - GPT generated images are often blob: URLs (origin-bound), which content scripts cannot fetch.
    // - Some remote image hosts don't allow CORS for fetch(), although <img> can display them.
    try {
      if (src.startsWith('blob:')) {
        const r = await chrome.runtime.sendMessage({ action: 'blobToDataUrl', blobUrl: src });
        if (r?.success && r.dataUrl) {
          cache.set(src, r.dataUrl);
          return r.dataUrl;
        }
      } else if (src.startsWith('http://') || src.startsWith('https://')) {
        const r = await chrome.runtime.sendMessage({ action: 'fetchToDataUrl', url: src });
        if (r?.success && r.dataUrl) {
          cache.set(src, r.dataUrl);
          return r.dataUrl;
        }
      }
    } catch (e2) {
      console.warn('Fallback image conversion failed.');
    }

    console.warn('Failed to convert image to base64.');
    cache.set(src, src);
    return src; // Return original URL as last-resort fallback
  }
}

/**
 * Extract code block info from a <pre> element.
 * @param {Element} preElement - <pre> element
 * @returns {Object} Code block info
 */
function extractCodeBlock(preElement) {
  const codeElement = preElement.querySelector('code');
  const content = codeElement ? codeElement.textContent : preElement.textContent;
  
  // Try detecting language
  let language = '';
  if (codeElement) {
    const classList = Array.from(codeElement.classList);
    const langClass = classList.find(c => c.startsWith('language-') || c.startsWith('hljs-'));
    if (langClass) {
      language = langClass.replace('language-', '').replace('hljs-', '');
    }
  }
  
  // Try finding a language label in a nearby container
  if (!language) {
    const langLabel = preElement.closest('div')?.querySelector('[class*="language"], .text-xs');
    if (langLabel) {
      language = langLabel.textContent?.trim().toLowerCase() || '';
    }
  }
  
  return {
    type: 'code',
    language: language || 'plaintext',
    content: content?.trim() || ''
  };
}

/**
 * Extract structured content blocks from a message element.
 * @param {Element} element - Message DOM element
 * @returns {Promise<Array>} Content block list
 */
async function extractMessageContent(element) {
  const contentBlocks = [];

  // Use the whole message element to avoid missing non-markdown content blocks (e.g. "Image created" + generated image grid).
  // We'll avoid common UI/action text by skipping button label text nodes.
  const contentContainer = element;
  const seenImageSrc = new Set();

  const isTextInUiControl = (textNode) => {
    const p = textNode?.parentElement;
    if (!p) return false;
    // Don't drop images; only avoid capturing action labels like "Copy", "Regenerate", etc.
    // Also skip screen-reader only content (sr-only) which becomes visible in our exported template.
    if (p.closest('.sr-only,[class*="sr-only"],.visually-hidden,[class*="visually-hidden"]')) return true;
    if (p.closest('button,[role="button"],[role="toolbar"]')) return true;
    if (p.closest('svg')) return true;
    // Common action containers in ChatGPT UI
    if (p.closest('[data-testid*="conversation-turn-actions"],[data-testid*="message-actions"],[data-testid*="copy"],[data-testid*="share"]')) return true;
    return false;
  };

  const stripRolePrefix = (text) => {
    let t = (text || '').replace(/\s+/g, ' ').trim();
    if (!t) return '';
    // Strip common screen-reader/label prefixes that should not be part of exported content.
    // e.g. "You said: hello", "ChatGPT said: ...", "Assistant said: ..."
    t = t.replace(/^(you|chatgpt|assistant)\s+said\s*[:：]?\s*/i, '');
    // Chinese variants seen in some UIs
    t = t.replace(/^(你|您)\s*说\s*[:：]?\s*/, '');
    return t.trim();
  };
  
  // Recursively process nodes
  async function processNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const raw = node.textContent || '';
      const cleaned = stripRolePrefix(raw);
      if (cleaned && !isTextInUiControl(node)) {
        contentBlocks.push({ type: 'text', content: cleaned });
      }
      return;
    }
    
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    
    const tagName = node.tagName.toLowerCase();

    // Skip accessibility-only nodes entirely (prevents "You said:" leaking into export after widening traversal scope)
    try {
      if (node.matches?.('.sr-only,[class*="sr-only"],.visually-hidden,[class*="visually-hidden"]')) {
        return;
      }
    } catch (e) {}
    
    // Code blocks
    if (tagName === 'pre') {
      contentBlocks.push(extractCodeBlock(node));
      return;
    }
    
    // Images (do not skip even if inside a clickable wrapper)
    if (tagName === 'img') {
      // Prefer currentSrc (handles srcset / lazy-load variants)
      const rawSrc = node.currentSrc ||
        node.src ||
        node.getAttribute('src') ||
        node.getAttribute('data-src') ||
        node.getAttribute('data-original') ||
        '';
      if (rawSrc) {
        if (seenImageSrc.has(rawSrc)) return;
        seenImageSrc.add(rawSrc);
        const base64Src = await imageToBase64(rawSrc);
        contentBlocks.push({
          type: 'image',
          src: base64Src,
          alt: node.alt || ''
        });
      }
      return;
    }
    
    // Paragraphs
    if (tagName === 'p') {
      const html = node.innerHTML;
      const text = node.textContent?.trim();
      if (text) {
        contentBlocks.push({
          type: 'paragraph',
          html: html,
          text: text
        });
      }
      return;
    }
    
    // Headings
    if (/^h[1-6]$/.test(tagName)) {
      contentBlocks.push({
        type: 'heading',
        level: parseInt(tagName[1]),
        content: node.textContent?.trim() || ''
      });
      return;
    }
    
    // Lists
    if (tagName === 'ul' || tagName === 'ol') {
      const items = Array.from(node.querySelectorAll(':scope > li')).map(li => li.innerHTML);
      contentBlocks.push({
        type: 'list',
        ordered: tagName === 'ol',
        items: items
      });
      return;
    }
    
    // Blockquotes
    if (tagName === 'blockquote') {
      contentBlocks.push({
        type: 'blockquote',
        html: node.innerHTML
      });
      return;
    }
    
    // Tables
    if (tagName === 'table') {
      contentBlocks.push({
        type: 'table',
        html: node.outerHTML
      });
      return;
    }
    
    // Recurse into children
    for (const child of node.childNodes) {
      await processNode(child);
    }
  }
  
  await processNode(contentContainer);

  // If we still didn't capture any image, do a focused scan for img tags in this message.
  // Some layouts keep the image outside the obvious content subtree; this ensures we don't miss it.
  if (!contentBlocks.some(b => b.type === 'image')) {
    const imgs = element.querySelectorAll('img');
    for (const img of Array.from(imgs)) {
      const rawSrc = img.currentSrc ||
        img.src ||
        img.getAttribute('src') ||
        img.getAttribute('data-src') ||
        img.getAttribute('data-original') ||
        '';
      if (!rawSrc) continue;
      if (seenImageSrc.has(rawSrc)) continue;
      seenImageSrc.add(rawSrc);
      const base64Src = await imageToBase64(rawSrc);
      contentBlocks.push({ type: 'image', src: base64Src, alt: img.alt || '' });
    }
  }
  
  // If nothing was extracted, fall back to raw HTML
  if (contentBlocks.length === 0) {
    const html = contentContainer.innerHTML;
    if (html?.trim()) {
      contentBlocks.push({
        type: 'html',
        html: html
      });
    }
  }
  
  return contentBlocks;
}

/**
 * Extract structured messages.
 * @param {number} limit - Max messages
 * @returns {Promise<Array>} Message list
 */
async function extractStructuredMessages(limit = 50) {
  const elements = getMessageElements();
  const startIndex = Math.max(0, elements.length - limit);
  const limitedElements = elements.slice(-limit);
  
  const messages = [];
  
  for (let i = 0; i < limitedElements.length; i++) {
    const el = limitedElements[i];
    const absoluteIndex = startIndex + i;
    
    try {
      const content = await extractMessageContent(el);
      const role = getMessageRole(el);
      
      // Skip empty messages
      if (content.length === 0) continue;
      
      messages.push({
        id: `msg-${absoluteIndex}-${Date.now()}`,
        index: absoluteIndex,
        role: role,
        content: content,
        preview: getTextPreview(el),
        hasCode: content.some(c => c.type === 'code'),
        hasImages: content.some(c => c.type === 'image')
      });
    } catch (e) {
      console.warn('Failed to extract message:', e);
    }
  }
  
  return messages;
}

/**
 * Get lightweight message info (for list display).
 * @param {number} limit - Max messages
 * @returns {Array} Message info list
 */
function getMessagesInfo(limit = 50) {
  const elements = getMessageElements();
  const startIndex = Math.max(0, elements.length - limit);
  const limitedElements = elements.slice(-limit);
  
  return limitedElements.map((el, relativeIndex) => {
    const absoluteIndex = startIndex + relativeIndex;
    
    return {
      id: `msg-${absoluteIndex}-${Date.now()}-${relativeIndex}`,
      index: absoluteIndex,
      role: getMessageRole(el),
      preview: getTextPreview(el),
      hasCode: el.querySelectorAll('pre').length > 0,
      hasImages: el.querySelectorAll('img').length > 0
    };
  }).filter(msg => msg.preview || msg.hasCode || msg.hasImages);
}

/**
 * Get full structured message data by indices.
 * @param {Array<number>} indices - Message indices
 * @returns {Promise<Array>} Message list
 */
async function getSelectedMessagesData(indices) {
  const elements = getMessageElements();
  const messages = [];
  
  for (const idx of indices) {
    if (idx >= 0 && idx < elements.length) {
      const el = elements[idx];
      try {
        const content = await extractMessageContent(el);
        messages.push({
          id: `msg-${idx}`,
          index: idx,
          role: getMessageRole(el),
          content: content
        });
      } catch (e) {
        console.warn('Failed to extract message at index', idx, e);
      }
    }
  }
  
  return messages;
}

/**
 * Extract some page theme tokens (optional, for future styling).
 * @returns {Object} Theme tokens
 */
function extractPageStyles() {
  // Read computed CSS variables
  const computedStyle = getComputedStyle(document.documentElement);
  
  // Try capturing primary colors
  const bgColor = computedStyle.getPropertyValue('--main-surface-primary') || '#212121';
  const textColor = computedStyle.getPropertyValue('--text-primary') || '#ececec';
  
  return {
    backgroundColor: bgColor.trim() || '#212121',
    textColor: textColor.trim() || '#ececec',
    // Best-effort dark mode detection
    isDark: document.documentElement.classList.contains('dark') || 
            document.body.style.backgroundColor?.includes('21') ||
            true // Conservative default
  };
}

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // A separate controller owns these asynchronous responses.
  if (request.action?.startsWith('nativeCapture')) return false;
  switch (request.action) {
    case 'getMessages':
      try {
        const messages = getMessagesInfo(request.limit || 50);
        sendResponse({ success: true, messages: messages });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
      break;
      
    case 'getSelectedMessagesData':
      getSelectedMessagesData(request.indices)
        .then(messages => sendResponse({ success: true, messages: messages }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true; // Async response
      
    case 'extractAllMessages':
      extractStructuredMessages(request.limit || 50)
        .then(messages => sendResponse({ success: true, messages: messages }))
        .catch(error => sendResponse({ success: false, error: error.message }));
      return true;
      
    case 'getPageStyles':
      try {
        const styles = extractPageStyles();
        sendResponse({ success: true, styles: styles });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
      break;
      
    case 'ping':
      sendResponse({ success: true, message: 'Content script is ready' });
      break;
      
    default:
      sendResponse({ success: false, error: 'Unknown action' });
  }
  
  return true;
});

console.log('ChatGPT Native Longshot: Content script loaded (DOM extraction mode)');
