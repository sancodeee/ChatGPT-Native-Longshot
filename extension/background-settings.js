// Persist one continuous export backdrop locally. Foreground content is never blurred.
class ExportBackgroundSettings {
  constructor({ notify, setBusy }) {
    this.notify = notify;
    this.setAppBusy = setBusy;
    this.image = null;
    this.blur = 16;
    this.busy = false;
    this.chooseBtn = document.getElementById('chooseBackgroundBtn');
    this.clearBtn = document.getElementById('clearBackgroundBtn');
    this.fileInput = document.getElementById('backgroundFile');
    this.blurInput = document.getElementById('backgroundBlur');
    this.blurValue = document.getElementById('backgroundBlurValue');
    this.preview = document.getElementById('backgroundPreview');
    this.fileName = document.getElementById('backgroundFileName');
    this.summary = document.getElementById('backgroundSummary');
    this.chooseBtn.addEventListener('click', () => this.fileInput.click());
    this.fileInput.addEventListener('change', async () => {
      const file = this.fileInput.files[0];
      if (file) await this.selectFile(file);
      this.fileInput.value = '';
    });
    this.clearBtn.addEventListener('click', () => this.clear());
    this.blurInput.addEventListener('input', () => this.saveBlur());
    this.syncUi();
  }

  message(key, fallback, substitutions) {
    return chrome.i18n.getMessage(key, substitutions) || fallback;
  }

  async load() {
    try {
      const values = await chrome.storage.local.get(['exportBackgroundImage', 'exportBackgroundBlur']);
      const saved = values.exportBackgroundImage;
      if (saved && typeof saved.dataUrl === 'string' && saved.dataUrl.length < 5000000 &&
          saved.dataUrl.startsWith('data:image/jpeg;base64,')) {
        this.image = { dataUrl: saved.dataUrl, name: typeof saved.name === 'string' ? saved.name : '' };
      }
      if (Number.isInteger(values.exportBackgroundBlur)) {
        this.blur = Math.max(0, Math.min(32, values.exportBackgroundBlur));
      }
    } catch (error) {
      this.notify(this.message('backgroundSaveFailed', 'Unable to read background settings.'), true);
    }
    this.syncUi();
  }

  setBusy(busy) {
    this.busy = busy;
    this.chooseBtn.disabled = busy;
    this.fileInput.disabled = busy;
    this.clearBtn.disabled = busy || !this.image;
    this.blurInput.disabled = busy || !this.image;
  }

  syncUi() {
    this.chooseBtn.textContent = this.message(this.image ? 'backgroundChange' : 'backgroundChoose',
      this.image ? 'Change image' : 'Choose image');
    this.fileName.textContent = this.image?.name || this.message('backgroundNone', 'No image selected');
    this.summary.textContent = this.image
      ? this.message('backgroundConfigured', `Image · ${this.blur}px blur`, [String(this.blur)])
      : this.message('backgroundPlain', 'Solid color');
    this.blurInput.value = this.blur;
    this.blurValue.textContent = `${this.blur}px`;
    this.preview.hidden = !this.image;
    if (this.image) this.preview.src = this.image.dataUrl;
    else this.preview.removeAttribute('src');
    this.setBusy(this.busy);
  }

  async selectFile(file) {
    if (this.busy) return;
    this.setAppBusy(true);
    let url;
    try {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 20 * 1024 * 1024) {
        throw new Error(this.message('backgroundInvalidFile', 'Choose a PNG, JPEG or WebP image under 20 MB.'));
      }
      url = URL.createObjectURL(file);
      const image = new Image();
      image.src = url;
      await image.decode();
      const ratio = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Unable to prepare background image.');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const saved = { dataUrl: canvas.toDataURL('image/jpeg', 0.88), name: file.name };
      await chrome.storage.local.set({ exportBackgroundImage: saved });
      this.image = saved;
      this.syncUi();
      this.notify(this.message('backgroundSaved', 'Background saved for future exports.'));
    } catch (error) {
      this.notify(error.message || this.message('backgroundSaveFailed', 'Unable to save background.'), true);
    } finally {
      if (url) URL.revokeObjectURL(url);
      this.setAppBusy(false);
    }
  }

  async saveBlur() {
    if (this.busy || !this.image) return;
    this.blur = Math.max(0, Math.min(32, Number(this.blurInput.value) || 0));
    this.blurValue.textContent = `${this.blur}px`;
    this.summary.textContent = this.message('backgroundConfigured', `Image · ${this.blur}px blur`, [String(this.blur)]);
    try {
      // Persist only this small value while dragging; do not rewrite the image.
      await chrome.storage.local.set({ exportBackgroundBlur: this.blur });
    } catch (error) {
      this.notify(this.message('backgroundSaveFailed', 'Unable to save background settings.'), true);
    }
  }

  async clear() {
    if (this.busy) return;
    this.setAppBusy(true);
    try {
      await chrome.storage.local.remove('exportBackgroundImage');
      this.image = null;
      this.syncUi();
      this.notify(this.message('backgroundCleared', 'Solid background restored.'));
    } catch (error) {
      this.notify(this.message('backgroundSaveFailed', 'Unable to save background settings.'), true);
    } finally {
      this.setAppBusy(false);
    }
  }

  async paint(context, width, height, scale, baseColor) {
    context.fillStyle = baseColor;
    context.fillRect(0, 0, width, height);
    if (!this.image) return;
    const image = new Image();
    image.src = this.image.dataUrl;
    await image.decode();
    const blur = this.blur * scale;
    const spread = Math.ceil(blur * 3);
    const cover = Math.max((width + spread * 2) / image.naturalWidth,
      (height + spread * 2) / image.naturalHeight);
    context.save();
    context.filter = blur ? `blur(${blur}px)` : 'none';
    const imageWidth = image.naturalWidth * cover;
    const imageHeight = image.naturalHeight * cover;
    context.drawImage(image, (width - imageWidth) / 2, (height - imageHeight) / 2, imageWidth, imageHeight);
    context.filter = 'none';
    const [red, green, blue] = (baseColor.match(/[\d.]+/g) || [255, 255, 255]).map(Number);
    const dark = red * 0.2126 + green * 0.7152 + blue * 0.0722 < 128;
    // A single subtle tint covers both margins and content, without an inner panel edge.
    context.fillStyle = dark ? 'rgba(0, 0, 0, 0.18)' : 'rgba(255, 255, 255, 0.18)';
    context.fillRect(0, 0, width, height);
    context.restore();
  }
}
