// popup.js - Popup UI logic
// Extract DOM → preview → render long screenshot

function t(key, substitutions) {
  try {
    const msg = chrome?.i18n?.getMessage?.(key, substitutions);
    return msg || '';
  } catch (e) {
    return '';
  }
}

function isChatGptPage(href) {
  if (typeof href !== 'string') return false;
  const allowed = ['https://chatgpt.com', 'https://chat.openai.com'];
  try {
    if ('Origin' in globalThis) {
      const candidate = Origin.from(href);
      return allowed.some(origin => candidate.isSameOrigin(Origin.from(origin)));
    }
    const candidate = new URL(href);
    return candidate.origin !== 'null' && allowed.includes(candidate.origin);
  } catch (error) {
    return false;
  }
}

function localizePopupPage() {
  const lang = (chrome?.i18n?.getUILanguage?.() || 'en').replace('_', '-');
  try {
    document.documentElement.lang = lang;
  } catch (e) {}

  const privacyLink = document.getElementById('privacyPolicyLink');
  if (privacyLink) {
    privacyLink.href = `https://sancodeee.github.io/ChatGPT-Native-Longshot/privacy${/^zh(?:-|$)/i.test(lang) ? '' : '.en'}.html`;
  }

  // data-i18n: set textContent
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    if (!key) return;
    const msg = t(key);
    if (!msg) return;
    el.textContent = msg;
  });

  // data-i18n-html: set innerHTML (trusted extension strings)
  document.querySelectorAll('[data-i18n-html]').forEach((el) => {
    const key = el.getAttribute('data-i18n-html');
    if (!key) return;
    const msg = t(key);
    if (!msg) return;
    el.innerHTML = msg;
  });
}

class ChatImageExporter {
  constructor() {
    this.messages = [];               // Full message data
    this.selectedIndices = new Set(); // Selected message indices
    this.tabId = null;
    this.isBusy = false;
    this.viewMode = 'all';        // 'all' or 'selected'
    
    this.initElements();
    this.backgroundSettings = new ExportBackgroundSettings({
      notify: (message, error) => this.showToast(message, error),
      setBusy: busy => busy ? this.showLoading(t('backgroundWorking') || 'Saving background...') : this.hideLoading(),
      chooseImage: () => this.openBackgroundSettings(),
    });
    this.bindEvents();
  }
  
  initElements() {
    this.refreshBtn = document.getElementById('refreshBtn');
    // Status bar
    this.statusBar = document.getElementById('statusBar');
    this.selectedCount = document.getElementById('selectedCount');
    this.viewAllBtn = document.getElementById('viewAllBtn');
    this.viewSelectedBtn = document.getElementById('viewSelectedBtn');
    this.selectAllBtn = document.getElementById('selectAllBtn');
    this.deselectAllBtn = document.getElementById('deselectAllBtn');
    this.invertSelectBtn = document.getElementById('invertSelectBtn');
    
    // Preview area
    this.previewContainer = document.getElementById('previewContainer');
    this.chatPreview = document.getElementById('chatPreview');
    this.emptyState = document.getElementById('emptyState');
    this.loadingOverlay = document.getElementById('loadingOverlay');
    this.loadingText = document.getElementById('loadingText');
    
    // Footer
    this.footer = document.getElementById('footer');
    this.scaleSelect = document.getElementById('scaleSelect');
    this.copyBtn = document.getElementById('copyBtn');
    this.saveBtn = document.getElementById('saveBtn');
    
    
    // Toast
    this.toast = document.getElementById('toast');
  }
  
  bindEvents() {
    this.refreshBtn.addEventListener('click', () => this.loadMessages());
    // View toggle
    this.viewAllBtn.addEventListener('click', () => this.setViewMode('all'));
    this.viewSelectedBtn.addEventListener('click', () => this.setViewMode('selected'));
    
    // Selection actions
    this.selectAllBtn.addEventListener('click', () => this.selectAll());
    this.deselectAllBtn.addEventListener('click', () => this.deselectAll());
    this.invertSelectBtn.addEventListener('click', () => this.invertSelection());
    
    // Export actions
    this.copyBtn.addEventListener('click', () => this.copyImage());
    this.saveBtn.addEventListener('click', () => this.saveImage());
  }

  async openBackgroundSettings() {
    try {
      await chrome.runtime.openOptionsPage();
    } catch (error) {
      this.showToast(t('backgroundOpenFailed') || 'Unable to open background settings. Please retry.', true);
    }
  }
  
  showToast(message, isError = false) {
    this.toast.textContent = message;
    this.toast.className = 'toast' + (isError ? ' error' : '');
    this.toast.classList.add('show');
    setTimeout(() => {
      this.toast.classList.remove('show');
    }, 3000);
  }
  
  showLoading(text = '') {
    this.isBusy = true;
    this.refreshBtn.disabled = true;
    this.copyBtn.disabled = true;
    this.saveBtn.disabled = true;
    this.backgroundSettings?.setBusy(true);
    this.previewContainer.setAttribute('aria-busy', 'true');
    this.loadingText.textContent = text || t('loadingWorking') || 'Working...';
    this.loadingOverlay.classList.remove('hidden');
  }
  
  hideLoading() {
    this.isBusy = false;
    this.refreshBtn.disabled = false;
    this.backgroundSettings?.setBusy(false);
    this.previewContainer.setAttribute('aria-busy', 'false');
    this.loadingOverlay.classList.add('hidden');
    this.updateSelectedCount();
  }

  showEmptyState(title, description, icon = '💬') {
    const symbol = document.createElement('div');
    symbol.className = 'icon';
    symbol.setAttribute('aria-hidden', 'true');
    symbol.textContent = icon;
    const heading = document.createElement('h3');
    heading.textContent = title;
    const paragraph = document.createElement('p');
    paragraph.textContent = description;
    this.emptyState.replaceChildren(symbol, heading, paragraph);
    this.emptyState.style.display = 'flex';
  }

  showChatPageHint() {
    this.showEmptyState(t('emptyOpenChatGPTTitle') || 'Open a ChatGPT conversation',
      t('emptyOpenChatGPTDesc') || 'Switch to a ChatGPT conversation, then click Refresh.');
  }
  
  /** Send a message to the content script */
  async sendToContent(action, data = {}) {
    try {
      return await chrome.tabs.sendMessage(this.tabId, { action, ...data });
    } catch (e) {
      // If the content script isn't loaded, try injecting it.
      await chrome.scripting.executeScript({
        target: { tabId: this.tabId },
        files: ['content.js']
      });
      await new Promise(resolve => setTimeout(resolve, 100));
      return await chrome.tabs.sendMessage(this.tabId, { action, ...data });
    }
  }
  
  /** Load messages from the current ChatGPT tab */
  async loadMessages() {
    if (this.isBusy) return;
    // Failed or delayed refreshes must never leave an old conversation exportable.
    this.messages = [];
    this.tabId = null;
    this.selectedIndices.clear();
    this.chatPreview.replaceChildren();
    this.toast.classList.remove('show', 'error');
    this.toast.textContent = '';
    this.statusBar.style.display = 'none';
    this.footer.style.display = 'none';
    this.updateSelectedCount();
    this.emptyState.style.display = 'none';
    this.showLoading(t('loadingReadingConversation') || 'Reading conversation...');
    
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!Number.isInteger(tab?.id) || tab.id < 0) {
        this.showChatPageHint();
        return;
      }
      this.tabId = tab.id;

      // Avoid requiring the "tabs" permission: read location.href in page context.
      const [{ result: href } = {}] = await chrome.scripting.executeScript({
        target: { tabId: this.tabId },
        func: () => location.href
      }).catch(() => [{ result: '' }]);
      if (!isChatGptPage(href)) {
        // An unsupported/inaccessible page is a normal popup state, not an extension failure.
        this.tabId = null;
        this.showChatPageHint();
        return;
      }

      const limit = 50; // Default: last 50 messages
      
      // Extract structured messages
      this.showLoading(t('loadingExtractingMessages') || 'Extracting messages...');
      const response = await this.sendToContent('extractAllMessages', { limit });
      
      if (!response.success) {
        throw new Error(response.error || t('errFailedToReadMessages') || 'Failed to read messages.');
      }
      
      this.messages = response.messages;
      this.selectedIndices.clear();
      
      // 默认全选
      this.messages.forEach((msg, idx) => {
        this.selectedIndices.add(idx);
      });
      
      if (this.messages.length === 0) {
        this.emptyState.innerHTML = `
          <div class="icon">🔍</div>
          <h3>${t('emptyNoMessagesTitle') || 'No messages found'}</h3>
          <p>${t('emptyNoMessagesDescHtml') || 'Make sure the page has a conversation,<br>then try again.'}</p>
        `;
        this.emptyState.style.display = 'flex';
        this.statusBar.style.display = 'none';
        this.footer.style.display = 'none';
      } else {
        // 渲染预览
        this.renderPreview();
        this.statusBar.style.display = 'flex';
        this.footer.style.display = 'block';
        this.updateSelectedCount();
        this.showToast(t('toastLoadedMessages', [String(this.messages.length)]) || `Loaded ${this.messages.length} messages.`);
      }
      
    } catch (error) {
      console.error('Load error:', error);
      this.showEmptyState(t('emptyFailedToLoadTitle') || 'Failed to load', error.message, '⚠️');
      this.showToast(error.message, true);
    } finally {
      this.hideLoading();
    }
  }
  
  /** Render preview list */
  renderPreview() {
    this.chatPreview.replaceChildren();
    
    this.messages.forEach((msg, idx) => {
      const div = document.createElement('div');
      div.className = `chat-message ${msg.role === 'user' ? 'user' : 'assistant'}`;
      div.dataset.index = idx;
      
      if (this.selectedIndices.has(idx)) {
        div.classList.add('selected');
      }
      
      // 根据视图模式决定是否隐藏
      if (this.viewMode === 'selected' && !this.selectedIndices.has(idx)) {
        div.classList.add('hidden');
      }
      
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'msg-checkbox';
      checkbox.setAttribute('aria-labelledby', `message-role-${idx}`);
      checkbox.checked = this.selectedIndices.has(idx);
      const messageContent = document.createElement('div');
      messageContent.className = 'msg-content';
      const role = document.createElement('div');
      role.className = 'msg-role';
      role.id = `message-role-${idx}`;
      role.textContent = `${t(msg.role === 'user' ? 'roleYou' : 'roleChatGPT') || (msg.role === 'user' ? 'You' : 'ChatGPT')} · ${idx + 1}`;
      const body = document.createElement('div');
      body.className = 'msg-body';
      body.append(this.renderContent(msg.content));
      messageContent.append(role, body);
      div.append(checkbox, messageContent);
      
      // 点击消息切换选择
      div.addEventListener('click', (e) => {
        if (e.target !== checkbox) {
          checkbox.checked = !checkbox.checked;
          this.toggleSelection(idx, checkbox.checked);
        }
      });
      
      // checkbox 事件
      checkbox.addEventListener('change', (e) => {
        e.stopPropagation();
        this.toggleSelection(idx, e.target.checked);
      });
      
      this.chatPreview.appendChild(div);
    });
  }
  
  /** Render message content blocks */
  renderContent(contentBlocks) {
    return ChatPreviewContent.render(contentBlocks);
  }
  
  /** Toggle selection state */
  toggleSelection(idx, isSelected) {
    if (isSelected) {
      this.selectedIndices.add(idx);
    } else {
      this.selectedIndices.delete(idx);
    }
    
    const msgEl = this.chatPreview.querySelector(`[data-index="${idx}"]`);
    if (msgEl) {
      msgEl.classList.toggle('selected', isSelected);
      
      // In "Selected" view: hide item when deselected.
      if (this.viewMode === 'selected' && !isSelected) {
        msgEl.classList.add('hidden');
      }
    }
    
    this.updateSelectedCount();
  }
  
  updateSelectedCount() {
    this.selectedCount.textContent = this.selectedIndices.size;
    const hasSelection = this.selectedIndices.size > 0 && !this.isBusy;
    this.copyBtn.disabled = !hasSelection;
    this.saveBtn.disabled = !hasSelection;
  }
  
  /** Set view mode: 'all' or 'selected' */
  setViewMode(mode) {
    this.viewMode = mode;
    
    this.viewAllBtn.classList.toggle('active', mode === 'all');
    this.viewSelectedBtn.classList.toggle('active', mode === 'selected');
    this.viewAllBtn.setAttribute('aria-pressed', String(mode === 'all'));
    this.viewSelectedBtn.setAttribute('aria-pressed', String(mode === 'selected'));
    
    // 更新消息可见性
    this.chatPreview.querySelectorAll('.chat-message').forEach(el => {
      const idx = parseInt(el.dataset.index);
      if (mode === 'selected') {
        el.classList.toggle('hidden', !this.selectedIndices.has(idx));
      } else {
        el.classList.remove('hidden');
      }
    });
  }
  
  selectAll() {
    this.messages.forEach((msg, idx) => {
      this.selectedIndices.add(idx);
      const el = this.chatPreview.querySelector(`[data-index="${idx}"]`);
      if (el) {
        el.classList.add('selected');
        el.classList.remove('hidden');
        el.querySelector('.msg-checkbox').checked = true;
      }
    });
    this.updateSelectedCount();
  }
  
  deselectAll() {
    this.selectedIndices.clear();
    this.chatPreview.querySelectorAll('.chat-message').forEach(el => {
      el.classList.remove('selected');
      el.querySelector('.msg-checkbox').checked = false;
      if (this.viewMode === 'selected') {
        el.classList.add('hidden');
      }
    });
    this.updateSelectedCount();
  }
  
  invertSelection() {
    this.messages.forEach((msg, idx) => {
      const el = this.chatPreview.querySelector(`[data-index="${idx}"]`);
      if (el) {
        const checkbox = el.querySelector('.msg-checkbox');
        if (this.selectedIndices.has(idx)) {
          this.selectedIndices.delete(idx);
          el.classList.remove('selected');
          checkbox.checked = false;
          if (this.viewMode === 'selected') {
            el.classList.add('hidden');
          }
        } else {
          this.selectedIndices.add(idx);
          el.classList.add('selected');
          checkbox.checked = true;
          el.classList.remove('hidden');
        }
      }
    });
    this.updateSelectedCount();
  }
  
  /** Get selected messages */
  getSelectedMessages() {
    return this.messages.filter((msg, idx) => this.selectedIndices.has(idx));
  }

  async captureViewport(sessionId) {
    const captured = await chrome.runtime.sendMessage({ action: 'captureViewport', tabId: this.tabId });
    if (!captured?.success) throw new Error(captured?.error || 'Native screenshot failed.');
    const validation = await this.sendToContent('nativeCaptureValidate', { sessionId });
    if (!validation?.success) throw new Error(validation?.error || 'Page moved during capture.');
    const image = new Image();
    image.src = captured.dataUrl;
    await image.decode();
    return image;
  }

  async recoverFrame(whiteImage, frame, sessionId) {
    const matte = await this.sendToContent('nativeCaptureMatte', { sessionId, color: 'black' });
    if (!matte?.success) throw new Error(matte?.error || 'Unable to replace the conversation background.');
    const blackImage = await this.captureViewport(sessionId);
    if (whiteImage.naturalWidth !== blackImage.naturalWidth || whiteImage.naturalHeight !== blackImage.naturalHeight) {
      throw new Error('Capture dimensions changed. Please retry.');
    }
    const ratioX = whiteImage.naturalWidth / frame.viewportWidth;
    const ratioY = whiteImage.naturalHeight / frame.viewportHeight;
    const slice = frame.slice;
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(slice.width * ratioX);
    canvas.height = Math.ceil(slice.height * ratioY);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Unable to recover screenshot foreground.');
    const draw = image => context.drawImage(image,
      slice.x * ratioX, slice.y * ratioY, slice.width * ratioX, slice.height * ratioY,
      0, 0, canvas.width, canvas.height);
    draw(whiteImage);
    const white = context.getImageData(0, 0, canvas.width, canvas.height);
    draw(blackImage);
    const black = context.getImageData(0, 0, canvas.width, canvas.height);
    NativeCaptureMatte.recoverForeground(white.data, black.data);
    context.putImageData(black, 0, 0);
    return canvas;
  }
  
  /** Capture original page pixels and stitch only the selected message ranges. */
  async generateImage() {
    const scale = parseInt(this.scaleSelect.value, 10) || 2;
    const padding = 32;
    const indices = this.getSelectedMessages().map(message => message.index);
    if (!indices.length) throw new Error(t('toastPleaseSelectAtLeastOne'));
    await chrome.scripting.executeScript({
      target: { tabId: this.tabId }, files: ['capture-plan.js', 'native-capture.js']
    });
    let sessionId;
    try {
      const replaceBackground = !!this.backgroundSettings.image;
      const plan = await this.sendToContent('nativeCapturePrepare', { indices, replaceBackground });
      if (!plan?.success) throw new Error(plan?.error || 'Failed to prepare capture.');
      sessionId = plan.sessionId;
      let size;
      try { size = NativeCaptureGeometry.getOutputSize(plan.width, plan.height, scale, padding); }
      catch (error) { throw new Error(t('errNativeTooLarge') || error.message); }
      const canvas = document.createElement('canvas');
      canvas.width = size.width;
      canvas.height = size.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Unable to create screenshot canvas.');
      await this.backgroundSettings.paint(context, canvas.width, canvas.height, scale, plan.backgroundColor || '#ffffff');
      context.imageSmoothingQuality = 'high';
      while (true) {
        const frame = await this.sendToContent('nativeCaptureNext', { sessionId });
        if (!frame?.success) throw new Error(frame?.error || 'Capture session ended.');
        if (frame.done) break;
        this.showLoading(t('loadingNativeCapture', [String(frame.progress)]) ||
          `Capturing original page… ${frame.progress}%`);
        const image = await this.captureViewport(sessionId);
        const ratioX = image.naturalWidth / frame.viewportWidth;
        const ratioY = image.naturalHeight / frame.viewportHeight;
        const slice = frame.slice;
        if (replaceBackground) {
          const foreground = await this.recoverFrame(image, frame, sessionId);
          context.drawImage(foreground, padding * scale, (slice.destinationY + padding) * scale,
            slice.width * scale, slice.height * scale);
          foreground.width = foreground.height = 0;
        } else {
          context.drawImage(image,
            slice.x * ratioX, slice.y * ratioY, slice.width * ratioX, slice.height * ratioY,
            padding * scale, (slice.destinationY + padding) * scale, slice.width * scale, slice.height * scale);
        }
      }
      return canvas.toDataURL('image/png');
    } finally {
      if (sessionId) {
        try { await this.sendToContent('nativeCaptureFinish', { sessionId }); }
        catch (error) { console.warn('Capture cleanup unavailable; page watchdog will restore it.', error); }
      }
    }
  }

  /** Copy image to clipboard */
  async copyImage() {
    if (this.selectedIndices.size === 0) {
      this.showToast(t('toastPleaseSelectAtLeastOne') || 'Please select at least one message.', true);
      return;
    }
    
    this.showLoading(t('loadingGeneratingImage') || 'Generating image...');
    this.copyBtn.disabled = true;
    this.saveBtn.disabled = true;
    
    try {
      const dataUrl = await this.generateImage();
      
      this.showLoading(t('loadingCopyingToClipboard') || 'Copying to clipboard...');
      
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ]);
      
      this.showToast(t('toastCopied') || '✓ Copied to clipboard.');
      
    } catch (error) {
      console.error('Copy error:', error);
      this.showToast((t('toastCopyFailedPrefix') || 'Copy failed: ') + error.message, true);
    } finally {
      this.hideLoading();
      this.updateSelectedCount();
    }
  }
  
  /** Save image as a PNG file */
  async saveImage() {
    if (this.selectedIndices.size === 0) {
      this.showToast(t('toastPleaseSelectAtLeastOne') || 'Please select at least one message.', true);
      return;
    }
    
    this.showLoading(t('loadingGeneratingImage') || 'Generating image...');
    this.copyBtn.disabled = true;
    this.saveBtn.disabled = true;
    
    try {
      const dataUrl = await this.generateImage();
      
      this.showLoading(t('loadingSaving') || 'Saving...');
      
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `ChatGPT_${new Date().toISOString().slice(0, 10)}_${Date.now()}.png`;
      link.click();
      
      this.showToast(t('toastSaved') || '✓ Saved.');
      
    } catch (error) {
      console.error('Save error:', error);
      this.showToast((t('toastSaveFailedPrefix') || 'Save failed: ') + error.message, true);
    } finally {
      this.hideLoading();
      this.updateSelectedCount();
    }
  }
}

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
  localizePopupPage();
  const exporter = new ChatImageExporter();
  exporter.showLoading(t('backgroundLoading') || 'Loading settings...');
  await exporter.backgroundSettings.load();
  exporter.hideLoading();
  // Auto-load messages
  exporter.loadMessages();
});
