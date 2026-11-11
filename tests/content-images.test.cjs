const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const favicon = 'https://t0.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https%3A%2F%2Fwww.ksrcb.cn&size=32&drop_404_icon=true';

function createConverter({ fetchImage, convertInBackground } = {}) {
  const requests = [];
  const warnings = [];
  const context = vm.createContext({
    fetch: async url => {
      requests.push(url);
      if (fetchImage) return fetchImage(url);
      throw new TypeError('Failed to fetch');
    },
    FileReader: class {
      readAsDataURL(blob) {
        blob.arrayBuffer().then(buffer => {
          this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString('base64')}`;
          this.onloadend();
        }).catch(error => this.onerror(error));
      }
    },
    chrome: { runtime: {
      onMessage: { addListener() {} },
      sendMessage: async request => {
        requests.push(request);
        return convertInBackground ? convertInBackground(request) : { success: false, error: 'Failed to fetch' };
      },
    } },
    console: { log() {}, warn: (...args) => warnings.push(args) },
  });
  const source = fs.readFileSync(path.join(__dirname, '../extension/content.js'), 'utf8');
  const convert = vm.runInContext(`${source}\nimageToBase64`, context);
  return { convert, requests, warnings };
}

test('citation favicons keep their URL without conversion requests or warnings on repeated extraction', async () => {
  const { convert, requests, warnings } = createConverter();
  assert.equal(await convert(favicon), favicon);
  assert.equal(await convert(favicon), favicon);
  assert.deepEqual(requests, []);
  assert.deepEqual(warnings, []);
});

test('ordinary images on the same host are still converted and cached', async () => {
  const source = 'https://t0.gstatic.com/images/photo.png';
  const { convert, requests } = createConverter({
    fetchImage: () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'Content-Type': 'image/png' } }),
  });
  assert.equal(await convert(source), 'data:image/png;base64,AQID');
  assert.equal(await convert(source), 'data:image/png;base64,AQID');
  assert.deepEqual(requests, [source]);
});

test('body images still use background conversion when CORS blocks the page request', async () => {
  const source = 'https://files.oaiusercontent.com/photo.png';
  const { convert, requests, warnings } = createConverter({
    convertInBackground: () => ({ success: true, dataUrl: 'data:image/png;base64,AQID' }),
  });
  assert.equal(await convert(source), 'data:image/png;base64,AQID');
  assert.equal(requests[1].action, 'fetchToDataUrl');
  assert.equal(requests[1].url, source);
  assert.deepEqual(warnings, []);
});

test('generated blob images still use the page-world fallback', async () => {
  const source = 'blob:https://chatgpt.com/test-image';
  const { convert, requests } = createConverter({
    convertInBackground: () => ({ success: true, dataUrl: 'data:image/png;base64,AQID' }),
  });
  assert.equal(await convert(source), 'data:image/png;base64,AQID');
  assert.equal(requests[1].action, 'blobToDataUrl');
  assert.equal(requests[1].blobUrl, source);
});

test('unavailable body images retain their URL and warning rather than losing the message', async () => {
  const source = 'https://images.example.org/photo.png';
  const { convert, warnings } = createConverter();
  assert.equal(await convert(source), source);
  assert.equal(warnings.length, 1);
});
