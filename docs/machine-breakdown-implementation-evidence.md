# Machine Breakdown protocol 2 — local implementation evidence

Date: 2026-10-02. No production writes, deployment, real-index staging, commit or push performed by this implementation.

## Contract and implemented boundary

`breakdown-domain.js` owns browser read normalization, mapping M1–M4 to YK-101–YK-104, offset-aware completed vs elapsed downtime, explicit legacy-incomplete time quality and active precedence (Open before Monitoring before Closed). Product snapshots never follow later Configuration changes.

`breakdown-client.js` confirms only protocol 2 receipts matching requestId, action, SHA-256 canonical request fingerprint, canonical eventId and revision. Fingerprint is sorted JSON `{action, expectedRevision: null-or-number, payload}`; GAS validates allowable raw fields before fingerprinting, then internally normalizes timestamps. Unknown/pending retains the same operation. Pending operations are saved per server-verified subject before dispatch and restored after reload. Storage failure blocks dispatch. Completed requests are removed so a genuinely new incident gets a new requestId.

The three Breakdown pages use safe DOM text and server-confirmed reads, never local drafts as history. Log retains the compact read-only Configuration selector. Detail matches exact ID; no latest-record fallback. Schema creation is no longer page initialization. Writes require backend protocol 2, `breakdownWritesEnabled`, readable authenticated transport and verified session; legacy public browser password/session cannot enable them.

`scripts/breakdown-bff-adapter.cjs` is a server-only integration seam: injected **server-verified** durable-session authenticator, trusted role/station mapping, HMAC envelope, Origin/CSRF checks, 64 KiB body maximum and bounded GAS requests. It is not a deployed BFF, Google login implementation or durable-session store. A hosting owner must wire those dependencies without accepting browser identity claims. `/api/breakdown?action=health|read_breakdown|read_breakdown_event|submit|status` is the browser contract. GET health reads actual configured GAS health; status signs a fresh envelope with `payload.requestId` targeting the original operation.

`yakitori-machine-3d-viewer/breakdown-sync.js` only changes the overlay. It uses safe DOM, active precedence, void exclusion, last-good stale/unavailable states, valid-empty clearing and bounded polling with visibility pause/backoff. It no longer overrides Layout installation dots and does not use local draft/history. Core Viewer changes arriving from another chat are separate ownership and need their own source/build review.

## Verification evidence

Commands (all mock writes, never production):

```powershell
node --test tests/breakdown-domain.cjs tests/breakdown-bff.cjs tests/breakdown-gas.cjs
$env:NODE_PATH='C:/Users/NITRO 5/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'
node tests/breakdown-workflow-browser.cjs
node tests/breakdown-viewer-browser.cjs
```

Domain/client tests cover mappings, midnight/multiday/legacy durations, Open precedence, exact receipt mismatch rejection, saved-operation new ID, reload recovery and subject isolation, legacy gating and storage failure. BFF seam tests cover unauthenticated/CSRF/forged actor denial, server HMAC signing and status operation target. GAS tests cover signature/environment/roles/gating, migration ambiguity/preservation, storage, same-event lifecycle, retry/hash/revision/active-stop conflicts and injected crash boundaries. Unit harness serialization is not proof of simultaneous GAS executions; staging concurrency remains required.

Final implementation-lead unit checkpoint: `node --test tests/dashboard-regression.cjs tests/block-tracker-security.cjs tests/recording-baseline.cjs tests/gas-routing.cjs tests/breakdown-domain.cjs tests/breakdown-bff.cjs tests/breakdown-gas.cjs` — **65/65 passed, exit 0**. Pages artifact tracked-file checks are intentionally not bypassed; root validates the complete candidate with a temporary candidate index. GAS migration now initializes revision1/schemaVersion2 only for validated legacy IDs without inventing timestamps. Private signed detail is role/station-scoped and lookup-only; failed/forbidden unrelated requests never reconcile another operation. Definitive pre-mutation rejection is distinguished from pending/unknown, while a rejected status query does not discard the original pending write.

Root final complete CI checkpoint including `tests/pages-artifact.cjs`: **72/72 passed, exit 0**, using a temporary `GIT_INDEX_FILE` candidate index built from HEAD plus every public allowlist file. Temporary index/environment were restored/removed; the actual user index remained unchanged (no real staging). This validates a complete candidate's tracked-public-file boundary, not a committed release or live deployment. Root also reports Viewer `build --check`, existing Configuration browser and separate read-only Viewer browser checks passed.

Legacy backfill does **not** make incomplete old events actionable. Missing canonical startedAt, mapping/product/shift require reviewed signed `correct_breakdown` administration with expectedRevision and correctionReason; no end date or cause is guessed from legacy fields. Detail labels this legacy-incomplete state and blocks ordinary repair/close actions. Full canonical legacy adoption is API-only, not shipped as new editable mapping/time controls. Current live legacy record therefore remains readable, not automatically convertible to a new receipt-backed workflow.

Workflow browser fixture additionally captures the actual UI operation payloads and sends them through the loaded GAS source harness with test-only verified signatures: one event row, canonical ID throughout, Closed revision5 and30-minute downtime. This validates the browser/backend payload contract (including Configuration source) without a network write, but is not actual Google identity or staging proof.

Final browser contract cases also include actual GAS stale-revision/validation rejection, retaining draft values while enabling a new corrected operation; Machine-only active guards; restored Monitoring repeat `relatedEventId`; Process/Planned non-machine-stop reports; and server-derived reporter role disabling repair controls. Screenshots and finalized recordings reside in `output/breakdown-workflow/` (not public artifact).

Final frozen UI browser command `node tests/breakdown-workflow-browser.cjs` — **exit 0**, rerun by implementation lead after the legacy guard. Backfilled schema2/revision1 record with missing startedAt explicitly shows legacy warning and disables assign/repair/update/Monitoring/close; admin correction/void remain gated. Child-finalized complete recording: `output/breakdown-workflow/page@f0465cfcb521c383e4e699c3f0817e76.webm`. Overlay final command `node tests/breakdown-viewer-browser.cjs` — **exit 0**. All Google calls in these browser fixtures are mocked/intercepted.

Overlay browser fixture passed active vs Closed/Monitoring, literal HTML (no execution), unchanged Layout dot, void exclusion, stale retention and valid-empty clearing. This fixture is not a full live Viewer or backend identity test.

Finalized local workflow recordings were captured by Playwright. Supplementary `the-loop` AI video critique could not run because the managed vision provider reported `vision.no_api_key`; recovery doctor and one retry did not provide a key, and no provider/cloud configuration was changed. Root visually inspected the mobile screenshot; deterministic browser checks remain primary UI evidence. This is a critique-tool limitation, not a passing AI video assessment.

## External release gates — still pending

- Owner-defined isolated staging GAS deployment and private Sheet copies, signing configuration and backups/migration dry-run evidence.
- BFF hosting and real Google identity/OAuth ownership, durable server sessions, roles/station permissions, CSRF/session expiry/revoke tests with actual accounts.
- Full staging M1–M4 lifecycle, Sheet rows/audit/receipt inspection, real concurrent requests/crash/retry recovery and refresh timing evidence.
- Full inventory/cutover of other legacy POST/RPC/trigger/direct Sheet writers. Securing Breakdown alone is not central-auth completion.
- Viewer core source/build validation and coordination with the separate read-only Viewer implementation; no minified bundle was patched by this Breakdown change.
- Candidate tree review, public manifest validation, release map (Git/Pages/GAS/BFF/schema), rollout approval and rollback rehearsal.

Read-only live discovery supplied by root: `read_health` reports `apiVersion=20260930-routes-1`, no write protocol; one legacy Breakdown record without new revision/timestamps; four Layout records. These are **not** evidence of deployed protocol 2. The new client therefore keeps current live writes disabled.

Status: local implementation candidate; staging and live readiness **not verified**. Tests/build/source are not deployed GAS or actual authentication.

## Plan gate mapping

| Gate | Status and boundary |
| --- | --- |
| G0 Baseline | Local inventory and read-only live capability discovery complete; legacy deployment/trigger/direct-writer inventory remains incomplete. |
| G1 Contract | Local actions, schemas, mapping, shifts A/B, receipt states and validation implemented; real identities/roles and operating/loss units need owner signoff. |
| G2 Sandbox/auth | Fail-closed signed GAS and server adapter seams implemented/tested; actual isolated resources, login, sessions and hosting pending. |
| G3 Backend | Local schema/dry-run/lifecycle/revision/idempotency/audit/recovery candidate implemented; real GAS concurrency/Sheets behavior pending. |
| G4 Forms | Local quick report/Events/Detail/draft/errors/receipt workflow implemented and mocked browser verified. Manual fallback is deliberately disabled pending authority; batchRef/affectedTrial are API-only optional fields, not new UI controls. |
| G5 Viewer | Safe Breakdown overlay implemented; core read-only Viewer rebuild belongs to a concurrent separate chat and requires combined acceptance. |
| G6 Re-check | Local unit and mocked browser checks passing at recorded checkpoints; full candidate manifest validation is root-owned, staging regression still pending. |
| G7 Git candidate | Manifest/CI source updated; no real-index staging, commits or push. Candidate index evidence to be recorded by root. |
| G8 Live rollout | Not attempted, no approval or live-ready claim. |

## Coverage map (local evidence only)

| Cases | Evidence / qualification |
| --- | --- |
| D01–D11 | Unit/harness mapping/storage/validation/time/null duration/metadata/revision/closure/retry/hash conflicts. This does not imply every machine × product × shift permutation was live-tested. |
| D12 | Serialized competing creates and lock-busy behavior tested. Multi-execution simultaneous GAS concurrency remains staging-only. |
| D13–D14 | Injected failures at intent/business/audit/receipt plus tampered-state unknown and lock release/busy; not GAS process-kill proof. |
| D15–D18 | Migration dry-run/additive/reordered/custom-formula/ambiguity, lookup-only reads, correction/void permissions, protected-field/text constraints and literal encoding tests. Actual Sheets formula rendering/retention/backups remain sandbox acceptance. |
| U01 | Mocked desktop 1440/tablet768/mobile390 layout snapshots and horizontal overflow checks. |
| U02–U06 | Configuration validation, preserved read-only selector, unknown/lost receipt, exact Detail ID, filter/stale/empty behavior in mocked workflow. Manual Configuration override explicitly gated, not verified. |
| U07 | Revision conflict tested via API/harness, not two real authenticated browser sessions. |
| U08–U10 | Literal HTML/XSS checks; persisted reload pending/account isolation/storage denial in client units; stale/error/empty recovery in browser. Network overlap tested by sequence guards, not live polling load. |
| V01–V06 | Overlay active precedence, void/historical/non-machine exclusion, safe labels and retained Layout dot, stale/unavailable/empty. Core installation conflict and current-product rebuild acceptance is separate Viewer source work. |
| V07–V08 | Overlay machine button mapping implemented; live marker camera integration and <=75s confirmed-to-Viewer refresh target not established. |

Exact external prerequisites: identify the isolated GAS deployment and Sheet copy IDs privately; provide the hosting/identity owner and server session provider; set approved roles/station scopes and signing configuration through secret storage; complete backup+dry-run+writer cutover inventory; then run the plan's sandbox matrix and approve versioned rollout/rollback. Do not turn writes on merely because these local tests pass.

## Operator staging/cutover runbook

1. **Back up first.** Owner copies the actual Breakdown spreadsheet privately, including formulas/unknown columns and all ledger tabs; record row counts, unique IDs, headers, source/deployment version/timezone and restore target. Never use production IDs in local fixtures or staging. Inventory other projects, triggers, RPC and direct Sheet editors before central-auth cutover.
2. **Stage both GAS files together.** `yakitori-gas-src/รหัส.js` and `yakitori-gas-src/BreakdownProtocol.js` are one script release. Deploy a versioned isolated staging web app, not merely editor HEAD. Match deployment execution/access policy to the signed BFF contract; record deployment ID/version privately, API/schema protocol and release SHA. Adding only the router without the helper is invalid.
3. **Script Properties** (values through private secret/config storage): `BREAKDOWN_SPREADSHEET_ID`, `BREAKDOWN_ENVIRONMENT`, `BREAKDOWN_SIGNING_KEY_<keyId>` and `BREAKDOWN_WRITES_ENABLED` (initially `false`). Existing Layout resolver/settings remain owned by Configuration; confirm its read mapping before snapshot validation. Do not put signing keys in Pages/JavaScript/Git or messages.
4. **Admin migration**, using a trusted server-signed protocol 2 envelope with `breakdownAdmin`, action `migrate_breakdown_schema`, `payload:{dryRun:true}`. Review missing/duplicate headers, IDs, row counts and ambiguity report on the copy. Resolve ambiguity under audited administration, never row-number IDs by silent client guessing. Apply only the reviewed same environment/copy with `payload:{dryRun:false}`; compare preserved legacy values/formulas/IDs and appended schema columns, then rehearse restore on the copy. Tabs are `MachineBreakdownLog`, `MachineBreakdownAudit`, `MutationIntents` and `WriteReceipts`; receipt/intent tabs are private and never published.
5. **Host Portal+BFF on the same HTTPS origin.** Static GitHub Pages cannot execute `/api/breakdown`. Wire `scripts/breakdown-bff-adapter.cjs` to an HTTP framework with trusted parsed request URL/method/headers/raw body and map `{status,body}` to JSON HTTP responses. Provide `origin`, isolated `gasUrl`, environment/keyId/signingKey and a durable server-verified `authenticate` implementation; keep BFF `writesEnabled:false`. Real Google sign-in must verify issuer/audience/expiry/state/nonce, allowlist/domain, cookie policy, role/station policy, rotation/logout/revoke, and produce server session+CSRF. Do not replace this with a browser-supplied subject/roles. This dependency is not shipped by the seam.
6. **Verify disabled staging first.** Health must identify actual GAS protocol 2 with writes disabled. Anonymous/forged/expired/wrong role/station/CSRF/environment/signature requests must cause zero mutation, and public feeds must not disclose actor/ledger fields. Check ContentService redirect/timeout behavior from the intended hosting origin and separate browser sessions.
7. **Enable staging only after identity/migration pass.** Set the GAS property and BFF gate true together; test all M1–M4 and A/B, Configuration snapshot freshness, create→assign→repair→Monitoring→close, exact event ID/revisions, row counts/audit/receipt, missing receipts, retry, genuine concurrent requests, quota/load and cross-session reads. Record sanitized traces and the refreshed Viewer version/asOf and <=75s target result. No production test incidents.
8. **Review cutover before main push.** Shipping these pages alone makes existing live Breakdown writes read-only because current GAS is legacy and Pages lacks BFF identity. That deliberate capability gate is an operational behavior change, not a seamless release. Do not recommend main push/Pages publication until owner accepts the read-only interval or the verified Portal routing/backend rollout. Use backend compatible+writes gated → health/reads → frontend/Portal → approved pilot → writers; coordinate Configuration and all legacy callers.
9. **Rollback is secure.** Turn BFF/GAS write gates off first, preserve pending drafts/request IDs and reconcile through authenticated status/original retry as policy allows. Roll back compatible frontend/BFF/GAS versions from the release map without deleting new columns, business records, receipts, intents or audit. Never restore unauthenticated legacy writes as fallback. Recheck public reads/targets and backup restoration on the sandbox.

Required release map: candidate Git SHA, Pages build URL/version, GAS script/deployment/version, BFF release/hosting origin, schema/protocol and gates, backup/rollback targets and named rollout/pilot/rollback owners. All remain pending until supplied/verified by the owner.
