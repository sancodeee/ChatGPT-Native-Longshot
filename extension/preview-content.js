// Untrusted conversation markup must be sanitized before it enters the popup.
const ChatPreviewContent = (() => {
  const sanitizer = {
    elements: [
      // parseHTML sanitizes the whole document; retain its containers to keep the body.
      'html', 'body',
      'a', 'abbr', 'b', 'blockquote', 'br', 'caption', 'code', 'col', 'colgroup',
      'dd', 'del', 'div', 'dl', 'dt', 'em', 'figcaption', 'figure', 'h1', 'h2',
      'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'kbd', 'li', 'mark', 'ol', 'p',
      'pre', 's', 'samp', 'small', 'span', 'strong', 'sub', 'sup', 'table',
      'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'u', 'ul', 'var', 'wbr'
    ],
    // No links, page styles/classes, event handlers, or resource alternatives.
    attributes: ['alt', 'colspan', 'rowspan', 'src']
  };

  function imageSource(value) {
    if (typeof value !== 'string') return '';
    const source = value.trim();
    if (!source || /[\u0000-\u001f\u007f]/.test(source)) return '';
    if (/^data:image\/(?:png|jpeg|gif|webp|avif);base64,[a-z0-9+/]+={0,2}$/i.test(source)) {
      return source;
    }
    try {
      const url = new URL(source);
      return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
    } catch (error) {
      return '';
    }
  }

  function restrictImages(container) {
    container.querySelectorAll('img').forEach(image => {
      const source = imageSource(image.getAttribute('src'));
      if (source) {
        image.setAttribute('src', source);
        image.referrerPolicy = 'no-referrer';
      } else {
        image.replaceWith(document.createTextNode(image.getAttribute('alt') || ''));
      }
    });
  }

  function appendHtml(target, html, fallback = html) {
    const source = typeof html === 'string' ? html : '';
    try {
      let sanitized;
      if ('parseHTML' in Document && typeof Document.parseHTML === 'function') {
        sanitized = Document.parseHTML(source, { sanitizer }).body;
      } else if ('setHTML' in Element.prototype && typeof Element.prototype.setHTML === 'function') {
        // A detached element in the active document can still start image requests.
        // Parse without a browsing context, then validate URLs before adopting nodes.
        sanitized = document.implementation.createHTMLDocument('').createElement('div');
        sanitized.setHTML(source, { sanitizer });
      } else {
        target.textContent = fallback || '';
        return;
      }
      restrictImages(sanitized);
      // Move sanitized nodes directly: serializing and parsing again can reintroduce mXSS.
      target.append(...sanitized.childNodes);
    } catch (error) {
      // Older or partially implemented APIs must never fall back to parsing raw HTML.
      target.textContent = fallback || '';
    }
  }

  function textElement(tag, text, className = '') {
    const element = document.createElement(tag);
    element.textContent = text || '';
    if (className) element.className = className;
    return element;
  }

  function render(contentBlocks) {
    const content = document.createDocumentFragment();
    if (!Array.isArray(contentBlocks)) return content;
    contentBlocks.forEach(block => {
      if (!block || typeof block !== 'object') return;
      let element;
      switch (block.type) {
        case 'text':
          element = textElement('p', block.content);
          break;
        case 'paragraph':
          element = document.createElement('p');
          if (block.html) appendHtml(element, block.html, block.text || block.html);
          else element.textContent = block.text || '';
          break;
        case 'heading': {
          const level = Number.isInteger(block.level) ? Math.min(Math.max(block.level, 1), 6) : 2;
          element = textElement(`h${level}`, block.content);
          break;
        }
        case 'code':
          element = document.createElement('div');
          element.className = 'code-block';
          element.append(textElement('div', block.language || 'code', 'code-header'),
            textElement('pre', block.content, 'code-content'));
          break;
        case 'image': {
          const source = imageSource(block.src);
          if (!source) {
            if (block.alt) content.append(textElement('p', block.alt));
            return;
          }
          element = document.createElement('img');
          // DOM setters preserve attribute boundaries even when a URL/label contains quotes.
          element.setAttribute('src', source);
          element.alt = block.alt || '';
          element.referrerPolicy = 'no-referrer';
          break;
        }
        case 'list':
          element = document.createElement(block.ordered ? 'ol' : 'ul');
          if (Array.isArray(block.items)) {
            block.items.forEach(item => {
              const li = document.createElement('li');
              appendHtml(li, item);
              element.append(li);
            });
          }
          break;
        case 'blockquote':
          element = document.createElement('blockquote');
          appendHtml(element, block.html);
          break;
        case 'table':
        case 'html':
          element = document.createDocumentFragment();
          appendHtml(element, block.html);
          break;
        default:
          return;
      }
      content.append(element);
    });
    return content;
  }

  return Object.freeze({ render });
})();
