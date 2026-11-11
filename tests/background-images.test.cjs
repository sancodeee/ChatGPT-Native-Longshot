const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const extensionId = 'test-extension-id';
const imageUrl = 'https://files.oaiusercontent.com/photo.png?signature=private-value';
const maxImageBytes = 20 * 1024 * 1024;
const backgroundSource = fs.readFileSync(path.join(__dirname, '../extension/background.js'), 'utf8');

function sender(overrides = {}) {
  return { id: extensionId, tab: { id: 17 }, frameId: 0, url: 'https://chatgpt.com/c/example', ...overrides };
}

function imageResponse(bytes = new Uint8Array([1, 2, 3]), headers = {}) {
  return new Response(bytes, { headers: { 'Content-Type': 'image/png', ...headers } });
}

function createBackground({ fetchImage = () => imageResponse(), pageUrl = 'https://chatgpt.com/c/example', Origin } = {}) {
  let listener;
  let now = 10000;
  let nextTimer = 0;
  const requests = [];
  const scripts = [];
  const captures = [];
  const timers = new Map();
  const api = {
    URL, Blob, Response, Uint8Array, AbortController, FileReader: class {
      async readAsDataURL(blob) {
        this.result = `data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString('base64')}`;
        this.onloadend();
      }
    },
    btoa: binary => Buffer.from(binary, 'binary').toString('base64'),
    setTimeout(callback, delay) { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    fetch: async (url, options) => {
      requests.push({ url, options });
      return await fetchImage(url, options);
    },
  };
  if (Origin) api.Origin = Origin;
  const context = vm.createContext({
    ...api,
    Date: { now: () => now },
    console: { log() {} },
    chrome: {
      runtime: {
        id: extensionId,
        getURL: value => `chrome-extension://${extensionId}/${value}`,
        onInstalled: { addListener() {} },
        onMessage: { addListener(callback) { listener = callback; } },
      },
      tabs: {
        get: async id => ({ id, windowId: 4, url: pageUrl }),
        query: async () => [{ id: 17 }],
        captureVisibleTab: async (...args) => { captures.push(args); return 'data:image/png;base64,AQID'; },
      },
      scripting: {
        executeScript: async injection => {
          scripts.push(injection);
          // Execute the serialized function in a separate page world, as Chrome does.
          const result = await vm.runInNewContext(`(${injection.func.toString()})(...args)`, {
            ...api, args: injection.args, location: { href: pageUrl, origin: new URL(pageUrl).origin },
          });
          return [{ frameId: 0, result }];
        },
      },
    },
  });
  vm.runInContext(backgroundSource, context);
  return {
    requests, scripts, captures, timers,
    send: (request, source = sender()) => new Promise(resolve => listener(request, source, resolve)),
    runTimer(delay) {
      const entry = [...timers].find(([, timer]) => timer.delay === delay);
      assert.ok(entry, `expected a ${delay}ms deadline`);
      timers.delete(entry[0]);
      now += delay;
      entry[1].callback();
    },
  };
}

test('allowed HTTPS image hosts return data URLs with bounded requests and no CDN cookies', async () => {
  for (const [url, source, credentials] of [
    [imageUrl, sender(), 'omit'],
    ['https://oaiusercontent.com/photo.png', sender(), 'omit'],
    ['https://a.b.oaiusercontent.com/photo.png', sender(), 'omit'],
    ['https://CHATGPT.com:443/image', sender(), 'include'],
    ['https://chat.openai.com/image', sender({ url: 'https://chat.openai.com/c/example' }), 'include'],
    ['https://chat.openai.com/image', sender(), 'omit'],
  ]) {
    const background = createBackground();
    const result = await background.send({ action: 'fetchToDataUrl', url }, source);
    assert.equal(result.success, true, url);
    assert.equal(result.dataUrl, 'data:image/png;base64,AQID');
    const request = new Request(background.requests[0].url, background.requests[0].options);
    assert.equal(request.redirect, 'error');
    assert.equal(request.credentials, credentials);
    assert.equal(background.requests[0].options.signal.aborted, false);
    assert.equal(background.timers.size, 0, 'the successful read releases its deadline');
  }
});

test('untrusted URL schemes, lookalike hosts, credentials, and custom ports never reach fetch', async () => {
  for (const url of [undefined, 42, '', '/image.png', 'data:image/png;base64,AQID', 'blob:https://chatgpt.com/photo', 'http://chatgpt.com/image', 'https://chatgpt.com.attacker.example/image', 'https://chatgpt.com@attacker.example/image', 'https://files.oaiusercontent.com.attacker.example/image', 'https://eviloaiusercontent.com/image', 'https://api.openai.com/image', 'https://storage.blob.core.windows.net/image', 'https://user:secret@chatgpt.com/image', 'https://chatgpt.com:8443/image', 'https://files.oaiusercontent.com:8443/image']) {
    const background = createBackground();
    const result = await background.send({ action: 'fetchToDataUrl', url });
    assert.equal(result.success, false, String(url));
    assert.equal(background.requests.length, 0, String(url));
  }
});

test('only this extension top-frame content scripts on HTTPS ChatGPT pages may read images', async () => {
  const sources = [
    {}, sender({ id: 'another-extension' }), sender({ tab: undefined }), sender({ tab: { id: -1 } }),
    sender({ tab: { id: '17' } }), sender({ tab: { id: 1.5 } }), sender({ frameId: 1 }), sender({ frameId: undefined }),
    sender({ url: `chrome-extension://${extensionId}/popup.html` }), sender({ url: 'http://chatgpt.com/' }),
    sender({ url: 'https://chatgpt.com.attacker.example/' }), sender({ url: 'https://files.oaiusercontent.com/' }),
    sender({ url: 'https://chatgpt.com:8443/' }), sender({ url: 'https://user:secret@chatgpt.com/' }),
    sender({ origin: 'null' }), sender({ origin: 'https://chat.openai.com' }),
  ];
  for (const source of sources) {
    for (const request of [{ action: 'fetchToDataUrl', url: imageUrl }, { action: 'blobToDataUrl', blobUrl: 'blob:https://chatgpt.com/photo' }]) {
      const background = createBackground();
      const result = await background.send(request, source);
      assert.equal(result.success, false, JSON.stringify(source));
      assert.equal(background.requests.length, 0);
      assert.equal(background.scripts.length, 0);
    }
  }
});

test('HTTP, network, and stream failures return fixed errors without signed URLs', async () => {
  for (const fetchImage of [
    () => new Response('private-value', { status: 403 }),
    () => { throw new Error(`Request failed for ${imageUrl}`); },
    () => imageResponse(new ReadableStream({ start(controller) { controller.error(new Error(imageUrl)); } })),
  ]) {
    const background = createBackground({ fetchImage });
    const result = await background.send({ action: 'fetchToDataUrl', url: imageUrl });
    assert.equal(result.success, false);
    assert.equal(result.error.includes('private-value'), false);
    assert.equal(result.error.includes('https:'), false);
    assert.equal(background.timers.size, 0);
  }
});

test('redirect responses cannot trigger a request to an unapproved host', async () => {
  const background = createBackground({ fetchImage: (url, options) => {
    if (options.redirect === 'error') throw new TypeError('Redirect refused');
    return imageResponse(); // A browser following redirects would expose these bytes.
  } });
  assert.equal((await background.send({ action: 'fetchToDataUrl', url: imageUrl })).success, false);
  assert.equal(background.requests.length, 1);
});

test('non-image MIME types and responses exceeding the declared or streamed 20MiB limit fail', async () => {
  const fixtures = [
    () => imageResponse(undefined, { 'Content-Type': 'text/html' }),
    () => imageResponse(undefined, { 'Content-Type': '' }),
    () => imageResponse(undefined, { 'Content-Length': String(maxImageBytes + 1) }),
    () => imageResponse(new ReadableStream({ start(controller) {
      controller.enqueue(new Uint8Array(maxImageBytes));
      controller.enqueue(new Uint8Array([1]));
      controller.close();
    } })),
  ];
  for (const fetchImage of fixtures) {
    const background = createBackground({ fetchImage });
    assert.equal((await background.send({ action: 'fetchToDataUrl', url: imageUrl })).success, false);
    assert.equal(background.timers.size, 0);
  }
});

test('an image exactly 20MiB is accepted', async () => {
  const background = createBackground({ fetchImage: () => imageResponse(new Uint8Array(maxImageBytes)) });
  const result = await background.send({ action: 'fetchToDataUrl', url: imageUrl });
  assert.equal(result.success, true);
  assert.equal(Buffer.from(result.dataUrl.split(',')[1], 'base64').length, maxImageBytes);
});

test('a stalled image network request aborts at ten seconds and releases its timer', async () => {
  const background = createBackground({ fetchImage: (url, options) => new Promise((resolve, reject) => {
    options.signal?.addEventListener('abort', () => reject(new Error(imageUrl)), { once: true });
  }) });
  const pending = background.send({ action: 'fetchToDataUrl', url: imageUrl });
  background.runTimer(10000);
  const result = await pending;
  assert.equal(result.success, false);
  assert.equal(background.requests[0].options.signal.aborted, true);
  assert.equal(result.error.includes('private-value'), false);
  assert.equal(background.timers.size, 0);
});

test('a stalled response body remains covered by the ten second deadline', async () => {
  const background = createBackground({ fetchImage: (url, options) => imageResponse(new ReadableStream({ start(controller) {
    options.signal?.addEventListener('abort', () => controller.error(new Error(imageUrl)), { once: true });
  } })) });
  const pending = background.send({ action: 'fetchToDataUrl', url: imageUrl });
  await new Promise(resolve => setImmediate(resolve));
  background.runTimer(10000);
  assert.equal((await pending).success, false);
});

test('same-origin blob images retain their page-world conversion in the top frame', async () => {
  for (const host of ['chatgpt.com', 'chat.openai.com']) {
    const background = createBackground({ pageUrl: `https://${host}/c/example` });
    const result = await background.send({ action: 'blobToDataUrl', blobUrl: `blob:https://${host}/photo` }, sender({ url: `https://${host}/c/example`, origin: `https://${host}` }));
    assert.equal(result.success, true);
    assert.equal(result.dataUrl, 'data:image/png;base64,AQID');
    assert.ok(Array.isArray(background.scripts[0].target.frameIds));
    assert.deepEqual(Array.from(background.scripts[0].target.frameIds), [0]);
    assert.equal(background.scripts[0].target.tabId, 17);
    assert.equal(background.scripts[0].world, 'MAIN');
    assert.equal(background.timers.size, 0);
  }
});

test('foreign and malformed blob URLs never enter the page world', async () => {
  for (const blobUrl of ['blob:https://chat.openai.com/photo', 'blob:https://files.oaiusercontent.com/photo', 'blob:https://chatgpt.com.attacker.example/photo', 'blob:http://chatgpt.com/photo', 'blob:null/photo', 'blob:https://chatgpt.com:8443/photo', 'blob:https://user:secret@chatgpt.com/photo', imageUrl, undefined]) {
    const background = createBackground();
    assert.equal((await background.send({ action: 'blobToDataUrl', blobUrl })).success, false, String(blobUrl));
    assert.equal(background.scripts.length, 0);
    assert.equal(background.requests.length, 0);
  }
});

test('blob conversion refuses a tab that navigated to another origin before injection', async () => {
  const background = createBackground({ pageUrl: 'https://attacker.example/' });
  assert.equal((await background.send({ action: 'blobToDataUrl', blobUrl: 'blob:https://chatgpt.com/photo' })).success, false);
  assert.equal(background.requests.length, 0);
});

test('blob reads enforce MIME, size, and timeout instead of trusting the page response', async () => {
  for (const fetchImage of [() => imageResponse(undefined, { 'Content-Type': 'text/html' }), () => imageResponse(undefined, { 'Content-Length': String(maxImageBytes + 1) })]) {
    const background = createBackground({ fetchImage });
    assert.equal((await background.send({ action: 'blobToDataUrl', blobUrl: 'blob:https://chatgpt.com/photo' })).success, false);
  }
  const background = createBackground({ fetchImage: (url, options) => new Promise((resolve, reject) => {
    options.signal?.addEventListener('abort', () => reject(new Error(imageUrl)), { once: true });
  }) });
  const pending = background.send({ action: 'blobToDataUrl', blobUrl: 'blob:https://chatgpt.com/photo' });
  background.runTimer(10000);
  assert.equal((await pending).success, false);
});

test('native Origin comparisons and URL fallback both reject foreign blob origins', async () => {
  let comparisons = 0;
  class Origin {
    static from(value) {
      const origin = new URL(value).origin;
      return { opaque: origin === 'null', origin, isSameOrigin(other) { comparisons++; return origin === other.origin; } };
    }
  }
  const background = createBackground({ Origin });
  assert.equal((await background.send({ action: 'blobToDataUrl', blobUrl: 'blob:https://chatgpt.com/photo' })).success, true);
  assert.equal((await background.send({ action: 'blobToDataUrl', blobUrl: 'blob:https://chat.openai.com/photo' })).success, false);
  assert.ok(comparisons > 0);
});

test('image conversion warnings never include the original signed URL or thrown error', async () => {
  const warnings = [];
  const context = vm.createContext({
    fetch: async () => { throw new Error(imageUrl); },
    chrome: { runtime: { onMessage: { addListener() {} }, sendMessage: async () => { throw new Error(imageUrl); } } },
    console: { log() {}, warn: (...values) => warnings.push(values) },
  });
  const source = fs.readFileSync(path.join(__dirname, '../extension/content.js'), 'utf8');
  const convert = vm.runInContext(`${source}\nimageToBase64`, context);
  assert.equal(await convert(imageUrl), imageUrl);
  assert.equal(warnings.length, 2);
  for (const warning of warnings) {
    assert.equal(warning.length, 1);
    assert.equal(warning[0].includes('private-value'), false);
    assert.equal(warning[0].includes('https:'), false);
  }
});

test('capture validation, the 600ms throttle, and ping remain available', async () => {
  const background = createBackground();
  assert.equal((await background.send({ action: 'captureViewport', tabId: 17 })).success, false);
  const popup = { id: extensionId, url: `chrome-extension://${extensionId}/popup.html` };
  assert.equal((await background.send({ action: 'captureViewport', tabId: 17 }, popup)).success, true);
  const second = background.send({ action: 'captureViewport', tabId: 17 }, popup);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(background.captures.length, 1);
  background.runTimer(600);
  assert.equal((await second).success, true);
  assert.equal(background.captures.length, 2);
  const ping = await background.send({ action: 'ping' }, {});
  assert.equal(ping.success, true);
  assert.match(ping.version, /^\d+\.\d+\.\d+$/);
});
