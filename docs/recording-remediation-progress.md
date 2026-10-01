# Recording Remediation Progress

Baseline: `fa6f67c`, 2026-09-30. This work log is not deployment authorization.
On 2026-10-01 the user requested separate frontend/GAS commits and a bounded Pages
artifact before pushing main. No production Sheets mutations or GAS deployment
are included in this release.

## Status

| Package | Status | Evidence / Gate |
| --- | --- | --- |
| 1. Baseline and inventory | Passed locally | Existing 9 tests/browser suite; 7 synthetic GAS baseline/inventory tests |
| 2. Block Tracker XSS | Passed locally | 4 helper tests; browser cached/remote XSS tests; desktop/mobile inventory geometry unchanged |
| 3. Route and target contract | Passed locally | 11 GAS routing/write-shape tests; three skin targets 120; live parity requires later GAS deploy |
| 4a. Local transport PoC | Passed locally | Readable JSON/redirect, rejection/pending, exact receipt, retry/lost-response recovery; mock only |
| 4b-4c. Real auth/transport | Gated | Await hosting/identity/roles and isolated staging; no production auth implemented |
| 5. GAS auth/receipts | Gated | Depends on package 4 contract and staging prerequisites |
| 6. Writer migration | Gated | Depends on readable receipts; 3D source/build missing |
| 7. Integration/artifact | Partial | Pages allowlist and frontend regression verified; secure writer integration still gated |
| 8. Production cutover | Not started | Requires explicit approval, sandbox/backup/secure rollback |

## Mutation Inventory

| Entry/action | Implementation | Caller | Required permission / disposition |
| --- | --- | --- | --- |
| POST record_trial | saveExternalRecord_ | DataRecordingApproval.html via runtime | line editor; receipt required |
| POST validate_record_route | resolveRecordRoute_ | recording integration/legacy API | authenticated writer; lookup-only |
| POST approve_record | saveApprovalRecord_ | API capability; verify callers before migration | approver; record revision |
| POST record_breakdown | saveBreakdownRecord_ | Approval preview path, MachineBreakdownLog.html | line editor; stable eventId |
| POST record_block_tracker | saveBlockTrackerRecord_ | BlockTrackerRecord.html | inventory editor; expected revision |
| POST delete_block_tracker | deleteBlockTrackerRecord_ | BlockTrackerRecord.html | inventory editor; tombstone policy gate |
| POST upsert_machine_layout | saveMachineLayoutRecord_ | compiled 3D viewer bundles | layout editor; obtain active source/build |
| POST create_breakdown_sheet | createBreakdownSheet_ | MachineBreakdownLog.html page-init | remove from ordinary page-init; editor-only maintenance |
| POST create_bl23_shift_b_sheet | createBl23gShiftBSheet | exposed API | editor-only maintenance |
| POST create_gz30_shift_b_sheet | createGz30gShiftBSheet | exposed API | editor-only maintenance |
| POST create_gz40_shift_b_sheet | createGz40gShiftBSheet | exposed API | editor-only maintenance |
| POST reset_gizzard_data | resetGizzardDataSheets_ | exposed destructive API | disable remote action; never test on production |
| google.script.run saveData | saveData | yakitori-gas-src/DataEntry.html | must remove/guard RPC bypass |
| public createBl23gShiftBSheet/createGz30gShiftBSheet/createGz40gShiftBSheet | top-level public functions | discoverable RPC even without linked UI | private/editor-only |
| public repairBl23DataLayout/repairBl23ProductivityLayout | top-level public functions | discoverable RPC | private/editor-only; no repair execution |
| local Block Tracker dialog | localStorage cache only | BlockTracker.html | distinguish local draft from confirmed remote |
| local quick-edit/delete/save | local cache before remote acknowledgment | BlockTrackerRecord.html | migrate to confirmed/pending states in package 6 |

## Public Reads With Existing Side Effects

- read_breakdown calls ensureBreakdownLogSheet_: creates missing sheet/header.
- read_block_tracker calls getBlockTrackerSheet_: creates missing sheet/header.
- read_machine_layout calls ensureMachineLayoutSheet_: creates missing sheet/header.
- Package 3 must make each read lookup-only and return a schema-compatible empty feed when missing.

Package 3 now uses lookup-only reads for all three storage actions. Unknown/conflicting production routes are rejected before opening Sheets. Existing BL/Gizzard base-dataset Shift B aliases remain supported; native saveData now shares the validated route but still needs the authorization gate in package 5.

## Local Changes and Verification

- Added `block-tracker-ui.js` for safe text/input/image DOM construction and cache validation. Names are preserved as literal text, not stripped.
- Raster uploads accept PNG/JPEG/WebP up to 2 MiB; SVG/HTML/remote URLs are not approved. Invalid images show the incumbent placeholder.
- Removed the obsolete unsafe base render and dynamic HTML data interpolations from both Block Tracker pages. Static headers remain unchanged.
- Added a canonical production route map and structured errors; removed arbitrary-sheet read/write fallback. No productivity/output/manpower/history values are rewritten.
- Added read_health metadata without credentials, Sheet IDs or extra homepage polling. writeProtocolVersion remains null: secure write protocol is not implemented yet.
- In-memory harness and route tests include legacy sheet-only clients and legacy shift-column rows. No test uses production Sheets.

```powershell
node --test tests/dashboard-regression.cjs tests/recording-baseline.cjs tests/block-tracker-security.cjs tests/gas-routing.cjs
node tests/dashboard-browser.cjs
node tests/block-tracker-browser.cjs
node tests/recording-transport-poc.cjs
```

For browser scripts on this machine, set NODE_PATH to the bundled Codex runtime packages and use installed Edge. Screenshots are test output under `output/recording-security/`, not source changes or staging files.

At this checkpoint: 31 unit tests pass; dashboard browser regression and Block Tracker browser security/geometry checks pass. The disposable local transport PoC also passes. Its synthetic cookie, redirect endpoint and in-memory receipt map are test fixtures, not a deployable BFF or proof of production authentication/idempotency.

The mechanical UI detector also ran once. It reports incumbent font/spacing/card warnings from the existing theme; this security change deliberately does not redesign those styles. Inventory row classes/text/geometry were compared against committed HEAD at 1440px and 390px.

Active 3D viewer entry is `yakitori-machine-3d-viewer/index.html`, loading `assets/index-Clkc_pfI.js`. Source/package/build instructions are absent from this checkout; do not edit the compiled bundle as a workaround.

**Not fixed yet:** production authorization, old public maintenance/RPC permissions, real write receipts/idempotency, writer migration/false-success UX, active GAS version parity and secure backend production rollout. The remaining auth gap is intentional gating, not a claim of safety; do not deploy this partial backend change as a completed security release.

Pages publishing is now independently scoped: explicit public-file allowlist,
unchanged public file bytes/URLs, unit-test gate and `_site` upload instead of the
repository root. Artifact browser checks cover the homepage/dashboard/Block Tracker
suites and 3D entry/model under the repository subpath with no missing requests.
See `docs/pages-publishing.md`. Pages deployment does not redeploy GAS.

## Decisions Still Needed

- BFF hosting versus authenticated GAS-native transport, authorized Google accounts/domain and roles.
- Sandbox GAS and private copies of Sheets; do not use production for integration writes.
- Active 3D viewer source/build instructions; compiled bundle changes are not an accepted substitute.
- Direct sheet editing, revision/tombstone/retention policy, production cutover and deployment owner.

Unrelated untracked paths `.understand-anything/`, `UNDERSTAND_WORKFLOW.md`,
`analysis/`, `output/`, `tmp/` are preserved and excluded from work staging.
