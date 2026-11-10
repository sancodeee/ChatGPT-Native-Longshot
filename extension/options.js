// Keep the file picker and image decoding in a page that survives focus changes.
document.addEventListener('DOMContentLoaded', async () => {
  document.documentElement.lang = chrome.i18n.getUILanguage().replace('_', '-');
  document.querySelectorAll('[data-i18n]').forEach(element => {
    const message = chrome.i18n.getMessage(element.dataset.i18n);
    if (message) element.textContent = message;
  });

  const status = document.getElementById('backgroundSaveStatus');
  const panel = document.querySelector('.background-panel');
  const settings = new ExportBackgroundSettings({
    notify: (message, isError = false) => {
      status.textContent = message;
      status.classList.toggle('is-error', isError);
    },
    setBusy: busy => {
      settings.setBusy(busy);
      panel.setAttribute('aria-busy', String(busy));
      if (busy) {
        status.textContent = chrome.i18n.getMessage('backgroundWorking');
        status.classList.remove('is-error');
      }
    },
  });
  settings.setBusy(true);
  await settings.load();
  settings.setBusy(false);
});
