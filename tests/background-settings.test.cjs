const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

class Element extends EventTarget {
  clicks = 0;

  click() {
    if (this.disabled) return;
    this.clicks++;
    this.dispatchEvent(new Event('click'));
  }

  removeAttribute(name) {
    delete this[name];
  }
}

function createSettings(options = {}, saved = {}) {
  const elements = new Map();
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, new Element());
      return elements.get(id);
    },
  };
  const context = vm.createContext({
    document,
    chrome: {
      i18n: { getMessage: () => '' },
      storage: { local: { get: async () => saved } },
    },
  });
  const source = fs.readFileSync(path.join(__dirname, '../extension/background-settings.js'), 'utf8');
  const Settings = vm.runInContext(`${source}\nExportBackgroundSettings`, context);
  const settings = new Settings({ notify: () => {}, setBusy: () => {}, ...options });
  return { settings, elements };
}

test('toolbar selection delegates to a persistent page instead of opening a transient file input', () => {
  let opened = 0;
  const { elements } = createSettings({ chooseImage: () => { opened++; } });
  elements.get('chooseBackgroundBtn').click();
  assert.equal(opened, 1);
  assert.equal(elements.get('backgroundFile').clicks, 0);
});

test('the persistent settings page can still open its own file input', () => {
  const { elements } = createSettings();
  elements.get('chooseBackgroundBtn').click();
  assert.equal(elements.get('backgroundFile').clicks, 1);
});

test('reopening a view restores the saved background and blur', async () => {
  const image = { dataUrl: 'data:image/jpeg;base64,test-fixture', name: 'background.jpg' };
  const { settings, elements } = createSettings({}, {
    exportBackgroundImage: image,
    exportBackgroundBlur: 23,
  });
  await settings.load();
  assert.equal(elements.get('backgroundPreview').hidden, false);
  assert.equal(elements.get('backgroundPreview').src, image.dataUrl);
  assert.equal(elements.get('backgroundBlur').value, 23);
  assert.equal(elements.get('backgroundBlur').disabled, false);
  assert.equal(elements.get('backgroundFileName').textContent, image.name);
});
