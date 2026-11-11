// Browser-only tests: the real DOM and native Sanitizer are the security boundary.
(() => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGMw7jjzHwAFAAKHH+5aBwAAAABJRU5ErkJggg==';
  let scriptsReady;

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  async function loadPopupScripts() {
    // Load after DOMContentLoaded so the toolbar's automatic initialization does not run.
    if (document.readyState === 'loading') {
      await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
    }
    const response = await fetch('../extension/popup.html', { cache: 'no-store' });
    assert(response.ok, 'Cannot read popup.html');
    const html = await response.text();
    const files = html.includes('src="preview-content.js"') ? ['preview-content.js', 'popup.js'] : ['popup.js'];
    for (const file of files) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = `../extension/${file}`;
        script.onload = resolve;
        script.onerror = () => reject(new Error(`Cannot load ${file}`));
        document.head.appendChild(script);
      });
    }
  }

  function render(content) {
    const exporter = Object.create(ChatImageExporter.prototype);
    exporter.messages = [{ role: 'assistant', index: 7, content }];
    exporter.selectedIndices = new Set([0]);
    exporter.viewMode = 'all';
    exporter.isBusy = false;
    exporter.chatPreview = document.createElement('div');
    exporter.selectedCount = document.createElement('span');
    exporter.copyBtn = document.createElement('button');
    exporter.saveBtn = document.createElement('button');
    exporter.renderPreview();
    document.getElementById('fixture').replaceChildren(exporter.chatPreview);
    return { exporter, body: exporter.chatPreview.querySelector('.msg-body') };
  }

  function assertNoUnsafeAttributes(container) {
    for (const element of container.querySelectorAll('*')) {
      for (const attribute of element.attributes) {
        assert(!/^on/i.test(attribute.name), `Event attribute remains: ${attribute.name}`);
        assert(!['style', 'href', 'srcdoc', 'srcset', 'action', 'formaction', 'ping', 'target', 'download', 'id', 'name'].includes(attribute.name),
          `Unsafe attribute remains: ${attribute.name}`);
      }
    }
  }

  function withoutNativeSanitizer(callback) {
    const properties = [[Element.prototype, 'setHTML'], [Document, 'parseHTML']];
    const descriptors = properties.map(([owner, name]) => Object.getOwnPropertyDescriptor(owner, name));
    try {
      properties.forEach(([owner, name]) => {
        assert(delete owner[name], `Cannot temporarily disable ${name}`);
      });
      return callback();
    } finally {
      properties.forEach(([owner, name], index) => {
        if (descriptors[index]) Object.defineProperty(owner, name, descriptors[index]);
      });
    }
  }

  window.runPreviewTests = async function runPreviewTests() {
    scriptsReady ||= loadPopupScripts();
    await scriptsReady;
    const results = [];
    const nativeSanitizer = typeof Element.prototype.setHTML === 'function' || typeof Document.parseHTML === 'function';
    const test = async (name, callback, needsNative = false) => {
      if (needsNative && !nativeSanitizer) {
        results.push({ name, status: 'skipped', reason: 'Native Sanitizer unavailable' });
        return;
      }
      try {
        await callback();
        results.push({ name, status: 'passed' });
      } catch (error) {
        results.push({ name, status: 'failed', reason: error.message });
      }
    };

    await test('active tags and foreign content are removed', () => {
      const { body } = render([{ type: 'html', html: '<p>Safe text</p><script>window.__unsafePreview = true</script><iframe srcdoc="unsafe"></iframe><object data="data:text/html,unsafe"></object><embed src="data:text/html,unsafe"><form><input name="unsafe"></form><style>body{display:none}</style><svg><a href="javascript:void(0)">foreign</a></svg><math><mtext>foreign</mtext></math><template><p>hidden</p></template>' }]);
      assert(!body.querySelector('script, iframe, object, embed, form, input, style, svg, math, template'), 'Active or foreign element remains');
      assert(body.textContent.includes('Safe text'), 'Safe body text was lost');
    });

    await test('page attributes cannot inject handlers or popup controls', () => {
      window.__unsafePreview = false;
      const { body } = render([{ type: 'paragraph', html: `<span id="saveBtn" name="saveBtn" class="msg-checkbox" style="position:fixed" onclick="window.__unsafePreview=true">Safe text</span><img src="${png}" onerror="window.__unsafePreview=true" srcset="javascript:void(0) 1x">` }]);
      assertNoUnsafeAttributes(body);
      assert(!body.querySelector('.msg-checkbox'), 'Untrusted control class remains');
      body.querySelector('span')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      assert(!window.__unsafePreview, 'A page-supplied handler executed');
    });

    await test('links keep their labels without navigation and selection still works', () => {
      const initialUrl = location.href;
      const { exporter, body } = render([{ type: 'paragraph', html: '<a href="https://example.invalid/" target="_blank" ping="https://example.invalid/ping">Reference label</a><a href="javascript:window.__unsafePreview=true">Unsafe label</a>' }]);
      assert(body.textContent.includes('Reference label') && body.textContent.includes('Unsafe label'), 'Link labels were lost');
      assert(!body.querySelector('[href], [target], [ping]'), 'A navigable link remains');
      (body.querySelector('a') || body).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      assert(location.href === initialUrl, 'Preview click changed location');
      assert(exporter.selectedIndices.size === 0, 'Preview click no longer toggles message selection');
      assert(exporter.copyBtn.disabled && exporter.saveBtn.disabled, 'Deselected message remains exportable');
      exporter.selectAll();
      assert(exporter.selectedIndices.size === 1 && !exporter.copyBtn.disabled && !exporter.saveBtn.disabled, 'Reselecting did not restore export actions');
    });

    await test('image URLs reject executable and unsupported schemes', () => {
      const sources = [
        'javascript:window.__unsafePreview=true',
        'java\nscript:void(0)',
        'data:text/html;base64,PHNjcmlwdD4=',
        'data:image/svg+xml,%3Csvg%20onload%3D%22alert(1)%22%3E',
        'data:image/png;base64,not valid base64!',
        'http://example.invalid/insecure.png',
        'blob:https://chatgpt.com/unreadable',
        'file:///tmp/private.png',
        'chrome-extension://other-extension/private.png',
        'https://user:password@example.invalid/private.png',
        '/relative.png'
      ];
      for (const source of sources) {
        const { body } = render([{ type: 'image', src: source, alt: 'Rejected image' }]);
        assert(!body.querySelector('img[src]'), 'An unsafe structured image URL remains');
      }
    });

    await test('raw HTML images use the same URL restrictions', () => {
      const { body } = render([{ type: 'html', html: `<p>Image content</p><img src="javascript:void(0)"><img src="data:text/html;base64,WA=="><img src="data:image/svg+xml,%3Csvg%3E"><img src="http://example.invalid/insecure.png"><img src="${png}" alt="Safe inline image">` }]);
      assert(Array.from(body.querySelectorAll('img[src]')).every(image => image.getAttribute('src') === png), 'Raw HTML bypassed image URL checks');
      assert(body.querySelector('img[src]')?.getAttribute('alt') === 'Safe inline image', 'Safe inline image was lost');
    }, true);

    await test('image source and alt cannot escape their attributes', () => {
      const { body } = render([{ type: 'image', src: 'https://example.invalid/a" onerror="window.__unsafePreview=true', alt: '" onload="unsafe & <image>' }]);
      assertNoUnsafeAttributes(body);
      const image = body.querySelector('img');
      assert(image?.getAttribute('alt') === '" onload="unsafe & <image>', 'Image alt text changed');
      assert(image?.getAttribute('src') === 'https://example.invalid/a%22%20onerror=%22window.__unsafePreview=true', 'Image URL was not safely normalized');
    });

    await test('normal code, lists, tables, and safe images remain readable', async () => {
      const code = 'const value = "<img src=x onerror=unsafe()>";\nreturn value & 2;';
      const { body } = render([
        { type: 'text', content: 'Body <text> & characters' },
        { type: 'heading', level: 2, content: 'Heading' },
        { type: 'paragraph', html: '<strong>Bold text</strong> and <em>emphasis</em>' },
        { type: 'code', language: 'javascript', content: code },
        { type: 'list', ordered: true, items: ['First <strong>item</strong>', 'Second item'] },
        { type: 'table', html: '<table><thead><tr><th>Column</th></tr></thead><tbody><tr><td colspan="2">Cell</td></tr></tbody></table>' },
        { type: 'blockquote', html: '<p>Quoted text</p>' },
        { type: 'image', src: png, alt: 'Safe raster image' }
      ]);
      assert(body.textContent.includes('Body <text> & characters'), 'Plain text changed');
      assert(body.querySelector('pre')?.textContent === code, 'Code text changed');
      assert(!body.querySelector('pre img'), 'Code was interpreted as HTML');
      assert(body.querySelector('h2')?.textContent === 'Heading', 'Heading was lost');
      assert(body.querySelectorAll('ol > li').length === 2, 'List was lost');
      assert(body.querySelector('td')?.textContent === 'Cell', 'Table was lost');
      assert(body.querySelector('blockquote')?.textContent.includes('Quoted text'), 'Quote was lost');
      const image = body.querySelector('img[alt="Safe raster image"]');
      assert(image?.getAttribute('src') === png, 'Safe raster image was lost');
      await image.decode();
      assert(image.naturalWidth === 1 && image.naturalHeight === 1, 'Safe raster image did not render');
    }, true);

    await test('missing Sanitizer uses literal text and keeps message selection usable', () => {
      withoutNativeSanitizer(() => {
        const { exporter, body } = render([
          { type: 'paragraph', html: '<strong>Rich paragraph</strong><img src=x onerror=unsafe()>', text: 'Rich paragraph' },
          { type: 'html', html: '<script>unsafe()</script><p>Literal fallback</p>' },
          { type: 'table', html: '<table><tr><td>Fallback table</td></tr></table>' },
          { type: 'code', content: '<script>literal code</script>', language: 'html' }
        ]);
        assert(!body.querySelector('script, img, strong, table'), 'Fallback parsed page HTML');
        assert(body.textContent.includes('Rich paragraph') && body.textContent.includes('Literal fallback') && body.textContent.includes('Fallback table'), 'Fallback text was lost');
        assert(body.querySelector('pre')?.textContent === '<script>literal code</script>', 'Fallback code changed');
        body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        assert(exporter.selectedIndices.size === 0, 'Fallback message cannot be deselected');
        exporter.selectAll();
        assert(exporter.getSelectedMessages()[0]?.index === 7 && !exporter.saveBtn.disabled, 'Fallback lost the original capture selection');
      });
    });

    await test('the setHTML path rejects image URLs before any network request', async () => {
      if (typeof Element.prototype.setHTML !== 'function') return;
      const parseHTML = Object.getOwnPropertyDescriptor(Document, 'parseHTML');
      const marker = `rejected-preview-image-${crypto.randomUUID()}`;
      const requests = [];
      const observer = new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          if (entry.name.includes(marker)) requests.push(entry.name);
        }
      });
      observer.observe({ type: 'resource' });
      try {
        delete Document.parseHTML;
        const { body } = render([{ type: 'html', html: `<img src="${location.origin}/tests/preview-content.html?${marker}"><img src="preview-content.html?relative-${marker}">` }]);
        assert(!body.querySelector('img'), 'Rejected images remain visible');
        // Resource timing is delivered asynchronously after the parser starts a request.
        await new Promise(resolve => setTimeout(resolve, 150));
        requests.push(...observer.takeRecords().filter(entry => entry.name.includes(marker)).map(entry => entry.name));
        assert(requests.length === 0, 'A rejected image URL was requested before filtering');
      } finally {
        observer.disconnect();
        if (parseHTML) Object.defineProperty(Document, 'parseHTML', parseHTML);
      }
    });

    await test('Sanitizer failure falls back to text without breaking the popup', () => {
      const setHTML = Object.getOwnPropertyDescriptor(Element.prototype, 'setHTML');
      const parseHTML = Object.getOwnPropertyDescriptor(Document, 'parseHTML');
      try {
        Object.defineProperty(Element.prototype, 'setHTML', { configurable: true, value() { throw new Error('Unavailable'); } });
        Object.defineProperty(Document, 'parseHTML', { configurable: true, value() { throw new Error('Unavailable'); } });
        const { body } = render([{ type: 'html', html: '<p>Readable fallback</p><img src=x onerror=unsafe()>' }]);
        assert(!body.querySelector('p, img'), 'Failing Sanitizer was bypassed');
        assert(body.textContent.includes('Readable fallback'), 'Sanitizer failure hid the message');
      } finally {
        if (setHTML) Object.defineProperty(Element.prototype, 'setHTML', setHTML);
        else delete Element.prototype.setHTML;
        if (parseHTML) Object.defineProperty(Document, 'parseHTML', parseHTML);
        else delete Document.parseHTML;
      }
    });

    const report = {
      nativeSanitizer,
      passed: results.filter(result => result.status === 'passed').length,
      failed: results.filter(result => result.status === 'failed').length,
      skipped: results.filter(result => result.status === 'skipped').length,
      results
    };
    document.getElementById('results').textContent = JSON.stringify(report, null, 2);
    return report;
  };

  document.getElementById('runTests').addEventListener('click', () => window.runPreviewTests());
})();
