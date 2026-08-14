# three-fiber-universal-fps-overlay

A Manifest V3 Chrome extension that overlays the actual render rate of foreign WebGL and WebGPU canvases, including Three.js and React Three Fiber scenes you do not control.

It does not use React, Three.js, R3F hooks, or page source access. The extension instruments browser rendering entry points at `document_start` and counts at most one render per canvas per browser animation frame.

## Install locally

```sh
bun install
bun run build
```

Then open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the generated `dist` directory. Reload pages that were already open.

Because the extension deliberately matches `<all_urls>`, Chrome grants it site access on pages where content scripts are allowed. Chrome-internal pages such as `chrome://` cannot be instrumented by ordinary extensions.

## What the number means

The overlay is a rolling one-second count of browser frames in which the canvas performed rendering work.

This is intentionally different from a generic `requestAnimationFrame` counter. For example, an R3F scene using `frameloop="demand"` falls to `0 FPS` when it is idle instead of continuing to report the monitor refresh rate.

Multiple WebGL draw calls from a single Three.js render are collapsed into one canvas frame. A scene doing 200 draw calls at 60 Hz therefore reports about `60 FPS`, not `12000 FPS`.

## Coverage

- WebGL 1 and WebGL 2
- Three.js / React Three Fiber `WebGLRenderer`
- WebGPU canvas presentation via `GPUCanvasContext.getCurrentTexture()`, including Three.js `WebGPURenderer` where that path is used
- ANGLE instanced drawing
- `WEBGL_multi_draw`
- Multiple canvases on one page
- Canvases inside open or closed shadow roots
- Matching cross-origin iframes and related `about:`, `data:`, `blob:`, and `filesystem:` frames where Chrome permits content-script injection

## Known limits

- WebGL/WebGPU work performed inside a Worker through `OffscreenCanvas` runs in a separate JavaScript realm and is not visible to this content script.
- The number measures render activity, not GPU completion time, presentation latency, or dropped compositor frames.
- A hostile page can deliberately replace browser prototypes after the extension patches them. Normal application code does not do this.
- Browser UI and restricted pages cannot be instrumented.

## Architecture

The extension uses one static MV3 content script in the page's `MAIN` JavaScript world at `document_start`. Running in the page world is necessary because patching WebGL methods in Chrome's isolated extension world would not affect the methods used by the site's renderer.

Keeping the overlay manager in the same page-world script also lets the instrumentation retain direct references to canvases inside closed shadow roots. The visual label itself lives in a closed shadow root, uses `pointer-events: none`, and is positioned from the canvas's viewport rectangle.

No service worker, remote code, network requests, storage, or extension API permissions are required.

## Development

```sh
bun run check
```

That runs ESLint, TypeScript, tests, and the extension build.
