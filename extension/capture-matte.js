// Recover native foreground pixels without color-keying white images or bubbles.
(function (root) {
  function recoverForeground(white, black) {
    if (!white || !black || white.length !== black.length || white.length % 4) {
      throw new Error('Capture dimensions do not match. Please retry.');
    }
    for (let index = 0; index < black.length; index += 4) {
      // Cwhite - Cblack = 255 * (1 - alpha), including antialiased edges.
      const difference = Math.round(((white[index] - black[index]) +
        (white[index + 1] - black[index + 1]) + (white[index + 2] - black[index + 2])) / 3);
      const alpha = 255 - Math.max(0, Math.min(255, difference));
      for (let channel = 0; channel < 3; channel++) {
        black[index + channel] = alpha ? Math.round(black[index + channel] * 255 / alpha) : 0;
      }
      black[index + 3] = alpha;
    }
    return black;
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { recoverForeground };
  else root.NativeCaptureMatte = { recoverForeground };
})(globalThis);
