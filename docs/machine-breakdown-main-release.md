# Machine Breakdown main release — 2026-10-02

This release publishes the receipt-backed Breakdown frontend and restores the
original Sarabun/Inter, dark/yellow Recording Hub presentation. It includes the
read-only Viewer build and the Configuration frontend dependencies needed by
the navigation. Private GAS source, tests, adapters and documents remain excluded
from the public Pages artifact.

## Operational boundary

- Git/main and Pages publication do **not** deploy GAS or a BFF.
- Current live GAS is legacy; secure Breakdown writes remain disabled. Drafts
  may be kept locally but are not confirmed Sheet records.
- Configuration's secure Layout frontend is also fail-closed until its separate
  authenticated transport is configured; this release does not activate it.
- Layout protocol 3 backend, sandbox, adapters and deployment work from the
  separate Configuration chat are deliberately excluded. The GAS router keeps
  its pre-existing Layout routes; central auth cutover is not completed here.
- No cloud resources, production Sheet writes, keys, deployment configuration,
  `.clasp.json`, analysis folders or test recordings are included.
- Recovered dependency runtime and its embedded GLSL retain their original
  shader whitespace. They are not hand-edited to satisfy whitespace lint;
  application code and the generated artifact are build-verified instead.

The implementation evidence describes earlier local checkpoints. Actual GAS
deployment, private sandbox acceptance, identity/session hosting and concurrent
Sheets tests remain separate release gates. Use the production plan and operator
runbook before enabling writes.

## Checks on this candidate

- Full Pages CI regression suite: 72/72 passed in the main publication worktree.
- Additional browser checks intercept every write and use fixture data only.
- Viewer build is generated from reviewed source, canonicalizing CRLF/LF before
  hashing to keep Windows and Linux builds reproducible.
- Public artifact contains only the allowlisted files; no server-only source is
  published. No GAS deployment is performed by this commit.
