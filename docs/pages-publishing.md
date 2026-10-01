# Pages Publishing Boundary

`scripts/pages-files.json` is the explicit public-file allowlist. The builder copies
only those files into a new `_site` directory, then adds `build-info.json` and
`.nojekyll`. It never scans/copies the repository recursively or overwrites an
existing output directory. Missing sources, private paths and symlinks fail the build.

Existing public URLs and file bytes remain unchanged. All current dashboard pages,
runtime styles/scripts, legacy JSON feeds and existing 3D assets are retained for
compatibility. New public assets must be added to the allowlist deliberately.

The deployment workflow runs dependency-free regression tests, builds `_site`, and
uploads only `_site`. Backend source, `.clasp.json`, tests, scripts, documentation,
analysis and local output are not part of the Pages artifact. This does not make
tracked files private on GitHub; the repository's visibility is unchanged.

## Release Scope

- Block Tracker safe-DOM/image fixes are the frontend release.
- GAS route/target validation and local fixtures are a separate preparatory commit.
  They do not update the deployed Apps Script. Authentication, write receipts,
  durable idempotency and writer migration remain gated; no GAS deployment is made.
- Pages artifact/workflow changes are a third commit. Pushing `main` triggers Pages
  only, with unit tests required before publishing.

## Local Verification

```powershell
node --test tests/dashboard-regression.cjs tests/block-tracker-security.cjs tests/recording-baseline.cjs tests/gas-routing.cjs tests/pages-artifact.cjs
node scripts/build-pages.cjs output/pages-preview
node tests/pages-browser.cjs
```

Use a new preview directory each time. `pages-browser.cjs` builds a disposable
artifact and runs the homepage/dashboard/Block Tracker tests against that artifact,
then checks the 3D entry and model under the Pages repository subpath.
Browser tests require Playwright/Edge and
mock Google requests; never perform integration writes on production Sheets.
