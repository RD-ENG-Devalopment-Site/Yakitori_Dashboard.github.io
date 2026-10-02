# Viewer source and build

Run `node scripts/build-machine-viewer.cjs` from the repository root. The build
requires only Node and creates `assets/index-readonly.js`, `build-manifest.json`
and `data/embedded-normal.png`.
The existing viewer URL, GLB and Draco paths are retained.

The original React project was not available in this repository or the inspected
sibling archives. `vendor-runtime.js` is the byte-for-byte dependency prefix from
the former live `assets/index-Clkc_pfI.js`, ending before `var lx=`. It includes
React, Three.js, React Three Fiber, Zustand and loader/control dependencies.
Treat this as a recovered vendor artifact, not handwritten application code.
Upgrading these dependencies requires restoring/replacing the original package
sources; the current build does not claim dependency version reproducibility.

`model-viewer.js` contains formatted, recovered model components and the original
physical node/hitbox mappings. Loader-sanitized names resolve to the same static
mapping. `layout-viewer.js` is the maintained read-only application, data loader,
validated read model and confirmed cache. Its rendering uses React safe text.
The original app, password, draft cache, edit handlers and POST implementation
were discarded; they are not concatenated into the new asset.

The build rejects known write/editor paths. The public allowlist includes only
the new JavaScript app asset and excludes all former `index-*.js` writer bundles.
Old assets remain in the checkout for recovery, but are not shipped by Pages.
Maintain `scripts/pages-files.json` when adding public assets.

Run `node tests/machine-viewer-readonly-browser.cjs` with the bundled Playwright
dependencies on `NODE_PATH`. The mock Sheet store is shared with Configuration;
all remote requests are intercepted and production writes are blocked.

The retained GLB labels its embedded 512×512 texture PNG, but its bytes are an
uncompressed BGRX DDS image. The build decodes those original base-level pixels
using built-in Node/zlib into the allowlisted PNG; the loader redirects only that
embedded texture. GLB geometry and Draco paths remain unchanged. The manifest
records its hash and --check verifies reproducibility. Sandbox CSP allows
wasm-unsafe-eval for Draco, without broad eval.
