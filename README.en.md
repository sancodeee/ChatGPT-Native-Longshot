# ChatGPT Native Longshot

[简体中文](README.md) · **English**

Export selected ChatGPT messages as a long PNG screenshot while preserving the original conversation's typography, theme, code, tables, formulas, and images. Save or copy the image, and optionally apply a custom background image with adjustable blur.

Current extension version: **2.3.5**. Built with Manifest V3, plain JavaScript, and native browser screenshots. Load it directly without a build step.

## Features

- Select all or individual messages; nonconsecutive selections are stitched in conversation order.
- Preserve the rendered light or dark theme with 1×, 2×, and 3× export scales.
- Expand internal code scrolling and wrap long lines to reduce clipping.
- Use a PNG, JPEG, or WebP background with 0–32px blur; settings stay on your device.
- Add 32px margins scaled with the export, then restore the page and scroll position.
- Include Simplified Chinese, Traditional Chinese, English, German, Spanish, French, and Japanese UI resources; missing translations fall back to English.
- Apple-inspired light popup with system typography, segmented filters, clear primary and secondary actions, keyboard focus, and reduced-motion support.

## Installation

1. Clone or download this repository.
2. Open `chrome://extensions/` in Chrome or a compatible Chromium browser and enable **Developer mode**.
3. Click **Load unpacked** and select the repository's **`extension/` directory**, which directly contains `manifest.json`.
4. Refresh any open ChatGPT conversation and click the extension icon.

Disable an older installation before loading this copy to avoid running two versions at once. Keep the loaded directory on disk. After changing the source, reload the extension on the extensions page and refresh the conversation.

For a packaged ZIP, extract it first and load the extracted directory containing `manifest.json`. Neither the repository root nor `dist/` is an extension root.

## Usage

1. Open a conversation at `https://chatgpt.com/` and wait for replies and images to finish loading.
2. Set your theme, window width, and browser zoom, then open the extension.
3. Select messages and an export scale. Use **Refresh** after new messages arrive.
4. To use an image background, click **Choose image** to open the dedicated settings page. Select an image there and wait for the thumbnail and saved confirmation. Return to ChatGPT, reopen the extension, then click **Save** or **Copy**. Blur and solid-background reset remain available on both surfaces.

Keep the conversation tab active during capture. Avoid scrolling, switching tabs, or resizing the window. Background settings are reused for subsequent exports; you can also restore the solid background.

## Repository layout

```text
ChatGPT-Native-Longshot/
├── extension/              # Directly loadable runtime files only
│   ├── manifest.json
│   ├── popup.html / popup.css / popup.js
│   ├── background.js
│   ├── content.js
│   ├── native-capture.js
│   ├── capture-plan.js / capture-matte.js
│   ├── background-settings.js
│   ├── options.html / options.css / options.js
│   ├── _locales/
│   └── icons/
├── scripts/                # Validation, packaging, optional icon generation
├── tests/                  # Background settings and image conversion regression tests
├── docs/                   # Development and icon guides
├── .github/workflows/      # Push and pull request checks
├── CHANGELOG.md
├── NOTICE.md
├── README.md               # Default Chinese documentation
└── README.en.md
```

## Development and packaging

Loading and using the extension requires neither Node.js, Python, nor dependency installation. Maintenance tools require **Node.js 22+ and Python 3.9+**. Validation and packaging use only standard libraries.

Run from the repository root:

```bash
# Validate the manifest, file references, locales, icons, and script syntax
python3 scripts/check.py

# Run background settings and image conversion regression tests
node --test tests/*.test.cjs

# Validate first, then create an installable ZIP
python3 scripts/package.py
```

The output is `dist/ChatGPT-Native-Longshot-2.3.5.zip`, with `manifest.json` at the archive root. The version comes from the manifest. Documentation, tooling, and local files are excluded from the package, and `dist/` is ignored by Git.

See the [development guide](docs/DEVELOPMENT.md) for module responsibilities, permissions, maintenance rules, and manual regression checks. Icon regeneration is optional; see the [icon guide](docs/ICONS.md). These detailed maintenance guides are currently in Chinese.

## Limits and data handling

- Reads the last 50 messages currently present in the page DOM; it does not load hidden conversation history.
- Output is limited to 30,000 pixels per side and 64 million pixels in total. Reduce the selection or scale if necessary.
- Higher scales do not create additional detail beyond the original screen pixels. Longer conversations take more time to capture.
- Image background mode uses white and black native captures for each slice, making it slower than solid background mode.
- Background images must be PNG, JPEG, or WebP and at most 20MB. They are stored as JPEG with the longest edge reduced to at most 1600px.
- Screenshots are generated locally. Background images and blur settings use `chrome.storage.local`, without cloud synchronization. Previews may request images from their original URLs; there is no separate screenshot upload service.
- ChatGPT DOM changes can affect message detection and capture, requiring regression checks in a real conversation.

## Verification scope

Automated checks cover repository structure, asset references, script syntax, and package creation. They do not replace real-conversation checks for saving, copying, and page restoration. The `tests/*.test.cjs` suite covers background selection, saved-state restoration, citation favicons, and body-image conversion fallbacks. The recovered source did not include the historical tests mentioned in its original documentation.

## Provenance and licensing

This repository was restored from a complete existing 2.3.3 extension copy. Subsequent changes are recorded in [CHANGELOG.md](CHANGELOG.md). See [NOTICE.md](NOTICE.md) for the recorded 2.0.0 origin and available licensing information.

This project is not affiliated with or endorsed by OpenAI.
