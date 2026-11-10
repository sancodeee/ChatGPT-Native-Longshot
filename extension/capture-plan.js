// Geometry shared by the page scroll controller and the PNG compositor.
(function (root) {
  function mergeRanges(ranges) {
    const result = [];
    for (const range of [...ranges].sort((a, b) => a.index - b.index)) {
      const previous = result[result.length - 1];
      if (previous && range.index === previous.last + 1) {
        previous.last = range.index;
        previous.bottom = Math.max(previous.bottom, Math.ceil(range.bottom));
      } else {
        result.push({ first: range.index, last: range.index,
          top: Math.floor(range.top), bottom: Math.ceil(range.bottom) });
      }
    }
    return result;
  }

  function getSlice({ top, bottom, offset, scrollTop, scrollerTop,
    viewTop, viewBottom, left, width, destinationTop }) {
    const y = scrollerTop + top + offset - scrollTop;
    const height = Math.min(bottom - top - offset, Math.floor(viewBottom - y));
    if (y < viewTop - 0.5 || height <= 0) {
      throw new Error('Selected content is not visible. Please retry the export.');
    }
    return { x: left, y, width, height, destinationY: destinationTop + offset };
  }

  function getOutputSize(width, height, scale, padding = 0) {
    if (![width, height, scale, padding].every(Number.isFinite) || width <= 0 || height <= 0 ||
        padding < 0 || ![1, 2, 3].includes(scale)) {
      throw new Error('Invalid screenshot dimensions or scale.');
    }
    const output = { width: Math.ceil((width + padding * 2) * scale),
      height: Math.ceil((height + padding * 2) * scale) };
    if (output.width > 30000 || output.height > 30000 || output.width * output.height > 64000000) {
      throw new Error('Screenshot too large. Select fewer messages or lower the scale.');
    }
    return output;
  }

  const api = { mergeRanges, getSlice, getOutputSize };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.NativeCaptureGeometry = api;
})(globalThis);
