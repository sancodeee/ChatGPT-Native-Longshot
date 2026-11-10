// Scroll the original conversation. Image exports replace only its page backdrop.
(() => {
  if (globalThis.__nativeChatCaptureLoaded) return;
  globalThis.__nativeChatCaptureLoaded = true;
  let session = null;

  function restore() {
    if (!session) return;
    const previous = session;
    session = null;
    clearTimeout(previous.timer);
    previous.style?.remove();
    previous.codeStyle?.remove();
    for (const [element, attribute] of previous.codeChanges || []) element.removeAttribute(attribute);
    for (const [element, value, priority, hadStyle] of previous.codeWhiteSpace || []) {
      if (value) element.style.setProperty('white-space', value, priority);
      else element.style.removeProperty('white-space');
      if (!hadStyle && !element.style.length) element.removeAttribute('style');
    }
    for (const [element, position] of previous.codeScrollPositions || []) {
      element.scrollTop = position.top;
      element.scrollLeft = position.left;
    }
    previous.matteStyle?.remove();
    for (const [element, attribute] of previous.pseudoSurfaces || []) element.removeAttribute(attribute);
    for (const element of previous.surfaces || []) element.removeAttribute(previous.surfaceAttribute);
    for (const element of previous.hidden) element.removeAttribute(previous.attribute);
    // Restore while scroll-behavior is still forced to auto.
    previous.scroller.scrollTop = previous.originalTop;
    previous.scroller.scrollLeft = previous.originalLeft;
    previous.motionStyle?.remove();
    for (const range of previous.selection) {
      try { window.getSelection()?.addRange(range); } catch (error) { /* DOM may have changed. */ }
    }
  }

  function renewTimeout() {
    clearTimeout(session.timer);
    // A closed popup cannot run its finally block. Restore the page in that case too.
    session.timer = setTimeout(restore, 15000);
  }

  function getViewport(scroller) {
    const root = scroller === document.scrollingElement;
    const rect = root ? { left: 0, top: 0 } : scroller.getBoundingClientRect();
    const top = root ? 0 : rect.top + scroller.clientTop;
    const left = root ? 0 : rect.left + scroller.clientLeft;
    const width = root ? document.documentElement.clientWidth : scroller.clientWidth;
    const height = root ? innerHeight : scroller.clientHeight;
    return { scrollerTop: top, viewTop: Math.max(0, top),
      viewBottom: Math.min(innerHeight, top + height),
      viewLeft: Math.max(0, left), viewRight: Math.min(innerWidth, left + width) };
  }

  async function settleImages(elements) {
    const images = elements.flatMap(element => [...element.querySelectorAll('img')]);
    await Promise.all(images.filter(image => !image.complete).map(image => new Promise(resolve => {
      const done = () => {
        clearTimeout(timer);
        image.removeEventListener('load', done);
        image.removeEventListener('error', done);
        resolve();
      };
      const timer = setTimeout(done, 2000);
      image.addEventListener('load', done, { once: true });
      image.addEventListener('error', done, { once: true });
    })));
  }

  function getPageBackgroundColor(element) {
    const colors = [];
    for (let node = element; node; node = node.parentElement) {
      colors.push(getComputedStyle(node).backgroundColor);
    }
    // Composite translucent ancestors in the browser's own color parser.
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, 1, 1);
    for (const color of colors.reverse()) {
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
    }
    const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;
    return `rgb(${red}, ${green}, ${blue})`;
  }

  async function prepareCodeBlocks(turns) {
    const grow = `${session.attribute}-code-grow`;
    const wrap = `${session.attribute}-code-wrap`;
    const wrapRoot = `${session.attribute}-code-root`;
    const header = `${session.attribute}-code-header`;
    const changes = new Map();
    const scrollPositions = new Map();
    session.codeWhiteSpace = [];
    function mark(element, attribute) {
      if (!changes.has(element)) changes.set(element, new Set());
      changes.get(element).add(attribute);
    }
    for (const turn of turns) {
      for (const content of turn.querySelectorAll('pre, .cm-content, [data-code-block-source], .chatgpt-code-scrollport')) {
        let needsWrap = false;
        const card = content.closest('[data-code-block], [class*="CodeBlock"], [class*="code-block"], [data-testid*="code-block"]');
        for (let node = content; node && node !== turn && node !== session.scroller; node = node.parentElement) {
          if (!scrollPositions.has(node)) scrollPositions.set(node, {top: node.scrollTop, left: node.scrollLeft});
          const style = getComputedStyle(node);
          if (/auto|scroll/.test(style.overflowY) || style.maxHeight !== 'none' ||
              (/hidden|clip/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1)) {
            mark(node, grow);
          }
          if (node.scrollWidth > node.clientWidth + 1) needsWrap = true;
          if (node === card) break;
        }
        if (needsWrap) {
          mark(content, wrapRoot);
          for (const node of [content, ...content.querySelectorAll('*')]) mark(node, wrap);
        }
        // Sticky code titles otherwise cover/repeat code as the conversation scrolls.
        for (const node of (card || content.parentElement).querySelectorAll('*')) {
          if (getComputedStyle(node).position === 'sticky') mark(node, header);
        }
      }
    }
    session.codeChanges = [];
    session.codeScrollPositions = [...scrollPositions];
    session.codeStyle = document.createElement('style');
    session.codeStyle.textContent = `[${grow}] { height: auto !important; max-height: none !important;
      overflow-y: visible !important; }
      [${wrap}] { white-space: pre-wrap !important; overflow-wrap: anywhere !important;
        min-width: 0 !important; max-width: 100% !important; }
      [${wrapRoot}] { width: auto !important; flex-shrink: 1 !important; }
      [${header}] { position: static !important; }`;
    document.documentElement.appendChild(session.codeStyle);
    const entries = [...changes];
    for (let start = 0; start < entries.length; start += 100) {
      for (const [node, attributes] of entries.slice(start, start + 100)) {
        for (const attribute of attributes) {
          node.setAttribute(attribute, '');
          session.codeChanges.push([node, attribute]);
          if (attribute === wrap) {
            // Inline !important also overrides ChatGPT's layered whitespace-pre! utility.
            session.codeWhiteSpace.push([node, node.style.getPropertyValue('white-space'),
              node.style.getPropertyPriority('white-space'), node.hasAttribute('style')]);
            node.style.setProperty('white-space', 'pre-wrap', 'important');
          }
        }
      }
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  async function enableMatte(backgroundColor) {
    const surfaces = new Set();
    const protectedSelector = 'pre, code, table, figure, picture, svg, canvas, img, button, a, ' +
      '[role="button"], .user-message-bubble, [data-testid*="file"]';
    const hasCardDecoration = style => style.boxShadow !== 'none' ||
      [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomLeftRadius,
        style.borderBottomRightRadius, style.borderTopWidth, style.borderRightWidth,
        style.borderBottomWidth, style.borderLeftWidth].some(value => parseFloat(value) > 0);
    // Ancestors are the page canvas, not message cards. Remove every stacked layer.
    for (const turn of session.all) {
      for (let node = turn.parentElement; node; node = node.parentElement) {
        if (node.closest(protectedSelector)) continue;
        if (!hasCardDecoration(getComputedStyle(node)) || node === session.scroller ||
            node.matches('html, body, main, [role="main"]') ||
            (session.all.length > 1 && session.all.every(message => node.contains(message)))) {
          surfaces.add(node);
        }
      }
    }
    const nodes = session.all.flatMap(turn => [turn, ...turn.querySelectorAll('div, article, section')]);
    for (let start = 0; start < nodes.length; start += 100) {
      for (const node of nodes.slice(start, start + 100)) {
        if (node.closest(protectedSelector)) continue;
        const style = getComputedStyle(node);
        let inCard = false;
        for (let parent = node.parentElement; parent && !surfaces.has(parent); parent = parent.parentElement) {
          if (hasCardDecoration(getComputedStyle(parent))) { inCard = true; break; }
        }
        // Preserve cards/bubbles (even white ones); only flatten plain page-colored wrappers.
        if (!inCard && style.backgroundColor === backgroundColor && style.backgroundImage === 'none' &&
            !hasCardDecoration(style)) {
          surfaces.add(node);
        }
      }
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
    session.surfaceAttribute = `${session.attribute}-surface`;
    session.surfaces = [...surfaces];
    session.pseudoSurfaces = [];
    // Clear page-sized painted layers only; preserve small pseudo-element decorations.
    for (const node of surfaces) {
      for (const pseudo of ['before', 'after']) {
        const style = getComputedStyle(node, `::${pseudo}`);
        if (!['none', 'normal'].includes(style.content) &&
            (style.backgroundColor !== 'rgba(0, 0, 0, 0)' || style.backgroundImage !== 'none') &&
            parseFloat(style.width) >= session.width - 2 &&
            parseFloat(style.height) >= Math.min(session.height, 100)) {
          const attribute = `${session.attribute}-matte-${pseudo}`;
          node.setAttribute(attribute, '');
          session.pseudoSurfaces.push([node, attribute]);
        }
      }
    }
    for (const node of surfaces) node.setAttribute(session.surfaceAttribute, '');
    session.matteStyle = document.createElement('style');
    document.documentElement.appendChild(session.matteStyle);
    await setMatte('white');
  }

  async function setMatte(color) {
    if (!session?.matteStyle || !['white', 'black'].includes(color)) {
      throw new Error('Invalid capture background. Please retry.');
    }
    session.matteStyle.textContent = `[${session.surfaceAttribute}] {
      background-color: transparent !important; background-image: none !important;
    } [${session.attribute}-matte-before]::before, [${session.attribute}-matte-after]::after {
      background-color: transparent !important; background-image: none !important;
    } html[${session.surfaceAttribute}] { background-color: ${color} !important; }`;
    renewTimeout();
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  async function prepare(indices, replaceBackground) {
    restore();
    const all = getMessageElements();
    if (!Array.isArray(indices) || !indices.length || indices.some(index =>
      !Number.isInteger(index) || index < 0 || index >= all.length)) {
      throw new Error(chrome.i18n?.getMessage('errNativeMessagesChanged') || 'Message list changed. Reopen the extension and select messages again.');
    }
    if (document.querySelector('[data-testid="stop-button"]')) {
      throw new Error(chrome.i18n?.getMessage('errNativeStreaming') || 'Please wait for the response to finish before capturing.');
    }
    const selectedIndices = [...new Set(indices)].sort((a, b) => a - b);
    const selected = selectedIndices.map(index => all[index]);
    let scroller = selected[0].parentElement;
    while (scroller && !(selected.every(element => scroller.contains(element)) &&
      /auto|scroll/.test(getComputedStyle(scroller).overflowY) &&
      scroller.scrollHeight > scroller.clientHeight + 1)) {
      scroller = scroller.parentElement;
    }
    scroller ||= document.scrollingElement;
    const attribute = `data-chat-capture-${crypto.randomUUID().replaceAll('-', '')}`;
    const selection = window.getSelection();
    const savedRanges = selection ? Array.from({ length: selection.rangeCount },
      (_, index) => selection.getRangeAt(index).cloneRange()) : [];
    session = { id: crypto.randomUUID(), scroller, all, selected, attribute, hidden: [],
      originalTop: scroller.scrollTop, originalLeft: scroller.scrollLeft,
      selection: savedRanges, segmentIndex: 0, offset: 0, destinationTop: 0,
      viewportWidth: innerWidth, viewportHeight: innerHeight, frames: 0 };
    renewTimeout();
    selection?.removeAllRanges();
    session.motionStyle = document.createElement('style');
    session.motionStyle.textContent = `* { scroll-behavior: auto !important;
      overflow-anchor: none !important; transition: none !important;
      animation-play-state: paused !important; caret-color: transparent !important; }`;
    document.documentElement.appendChild(session.motionStyle);

    // Hide site chrome only. Message DOM, CSS, theme, widths and zoom stay intact.
    const candidates = new Set(document.querySelectorAll(
      'header, form, #thread-bottom-container, [data-thread-scroll-footer], [data-testid="composer"], [data-testid="composer-container"]'));
    for (const element of document.body.querySelectorAll('*')) {
      const position = getComputedStyle(element).position;
      if (position === 'fixed' || position === 'sticky') candidates.add(element);
    }
    for (const element of candidates) {
      if (all.some(turn => turn.contains(element) || element.contains(turn))) continue;
      element.setAttribute(attribute, '');
      session.hidden.push(element);
    }
    session.style = document.createElement('style');
    session.style.textContent = `[${attribute}], [${attribute}] * { visibility: hidden !important; }`;
    document.documentElement.appendChild(session.style);
    await Promise.race([document.fonts.ready, new Promise(resolve => setTimeout(resolve, 2000))]);
    await settleImages(selected);
    await prepareCodeBlocks(selected);
    const viewport = getViewport(scroller);
    const rects = selected.map(element => element.getBoundingClientRect());
    const left = Math.max(viewport.viewLeft, Math.floor(Math.min(...rects.map(rect => rect.left))));
    const right = Math.min(viewport.viewRight, Math.ceil(Math.max(...rects.map(rect => rect.right))));
    session.left = left;
    session.width = right - left;
    if (session.width <= 0 || viewport.viewBottom - viewport.viewTop < 50) {
      throw new Error(chrome.i18n?.getMessage('errNativeOutside') || 'Conversation is outside the visible viewport. Close overlays and retry.');
    }
    session.segments = NativeCaptureGeometry.mergeRanges(rects.map((rect, index) => ({
      index: selectedIndices[index], top: rect.top - viewport.scrollerTop + scroller.scrollTop,
      bottom: rect.bottom - viewport.scrollerTop + scroller.scrollTop,
    })));
    session.height = session.segments.reduce((sum, segment) => sum + segment.bottom - segment.top, 0);
    const backgroundColor = getPageBackgroundColor(scroller === document.scrollingElement
      ? selected[0].parentElement : scroller);
    if (replaceBackground) await enableMatte(backgroundColor);
    return { sessionId: session.id, width: session.width, height: session.height, backgroundColor };
  }

  async function nextFrame(id) {
    if (!session || session.id !== id) throw new Error(chrome.i18n?.getMessage('errNativeExpired') || 'Capture session expired. Please retry.');
    renewTimeout();
    if (innerWidth !== session.viewportWidth || innerHeight !== session.viewportHeight) {
      throw new Error(chrome.i18n?.getMessage('errNativeResized') || 'Window size changed. Keep the window unchanged during capture.');
    }
    const segment = session.segments[session.segmentIndex];
    if (!segment) return { done: true };
    if (session.matteStyle) await setMatte('white');
    if (++session.frames > 200) throw new Error(chrome.i18n?.getMessage('errNativeTooMany') || 'Too many capture frames. Select fewer messages.');
    const viewport = getViewport(session.scroller);
    session.scroller.scrollTop = segment.top + session.offset - (viewport.viewTop - viewport.scrollerTop);
    // Two paints plus a short compositor delay are needed before captureVisibleTab.
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await new Promise(resolve => setTimeout(resolve, 100));
    await settleImages([session.all[segment.first], session.all[segment.last]]);
    const current = getViewport(session.scroller);
    const first = session.all[segment.first];
    const last = session.all[segment.last];
    if (!first?.isConnected || !last?.isConnected ||
      Math.abs(first.getBoundingClientRect().top - current.scrollerTop + session.scroller.scrollTop - segment.top) > 2 ||
      Math.abs(last.getBoundingClientRect().bottom - current.scrollerTop + session.scroller.scrollTop - segment.bottom) > 2) {
      throw new Error(chrome.i18n?.getMessage('errNativeLayoutChanged') || 'Conversation layout changed during capture. Wait for images and responses, then retry.');
    }
    const slice = NativeCaptureGeometry.getSlice({ ...segment, offset: session.offset,
      scrollTop: session.scroller.scrollTop, ...current, left: session.left,
      width: session.width, destinationTop: session.destinationTop });
    session.lastScrollTop = session.scroller.scrollTop;
    session.lastScrollLeft = session.scroller.scrollLeft;
    session.offset += slice.height;
    if (session.offset >= segment.bottom - segment.top) {
      session.destinationTop += segment.bottom - segment.top;
      session.segmentIndex++;
      session.offset = 0;
    }
    return { done: false, slice, viewportWidth: innerWidth, viewportHeight: innerHeight,
      progress: Math.min(100, Math.round((session.destinationTop + session.offset) / session.height * 100)) };
  }

  chrome.runtime.onMessage.addListener((request, sender, respond) => {
    if (!['nativeCapturePrepare', 'nativeCaptureNext', 'nativeCaptureMatte', 'nativeCaptureValidate', 'nativeCaptureFinish'].includes(request.action)) return;
    (async () => {
      if (request.action === 'nativeCapturePrepare') return await prepare(request.indices, request.replaceBackground === true);
      if (request.action === 'nativeCaptureNext') return await nextFrame(request.sessionId);
      if (request.action === 'nativeCaptureMatte') {
        if (!session || session.id !== request.sessionId) throw new Error('Capture session expired.');
        await setMatte(request.color);
        return {};
      }
      if (request.action === 'nativeCaptureValidate') {
        if (!session || session.id !== request.sessionId ||
          Math.abs(session.scroller.scrollTop - session.lastScrollTop) > 0.5 ||
          Math.abs(session.scroller.scrollLeft - session.lastScrollLeft) > 0.5 ||
          innerWidth !== session.viewportWidth || innerHeight !== session.viewportHeight) {
          throw new Error(chrome.i18n?.getMessage('errNativeMoved') || 'Page moved during capture. Do not scroll or resize; please retry.');
        }
        renewTimeout();
        return {};
      }
      if (session?.id === request.sessionId) restore();
      return {};
    })().then(result => respond({ success: true, ...result })).catch(error => {
      restore();
      respond({ success: false, error: error.message });
    });
    return true;
  });
  window.addEventListener('pagehide', restore);
})();
