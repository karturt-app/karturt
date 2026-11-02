# V1 verification-only CI run — 2026-11-02

This is a disposable verification branch based on **main**
`ff9b992bd3154d2cfb65dd14bcb0f1de452b29f1`.

Purpose: trigger existing `.github/workflows/gate-a.yml` PostgreSQL
concurrency (PostgreSQL 17) and R2 disposable recovery (PostgreSQL 18) jobs
through a draft pull request whose head branch matches the existing
`codex/demo-to-production-` CI conditions.

- **No application, dependency, schema, migration or CI workflow changes.**
- Run tests only on GitHub-hosted disposable PostgreSQL services and
  synthetic test data; never use Neon Production or real resident data.
- Record exact test head SHA, job conclusions, and sanitized CI artifacts.
- Job status **SKIPPED** is not evidence of passing.
- This documentation-only PR is **NOT FOR MERGE** or deployment.
- Keep security PR #132 independent and unmodified.

Audit checkpoint after tests: mark pass/fail/skipped exactly; continue
authenticated four-role UAT only after a verified isolated Preview exists.
