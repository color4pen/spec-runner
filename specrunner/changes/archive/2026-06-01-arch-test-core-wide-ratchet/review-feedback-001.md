# Code Review Feedback — iteration 001

- **verdict**: needs-fix
- **iteration**: 001

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | high | architecture | `tests/unit/architecture/core-invariants.test.ts` + `arch-allowlist.ts` | B-8 grep pattern `config\.runtime` misses `cfg.runtime` variants. `checkRuntimePrereqs` in `src/core/preflight.ts` uses parameter name `cfg: SpecRunnerConfig` and has `cfg.runtime ?? "local"` (L43) and `cfg.runtime === "managed"` (L59). Neither is caught by the enforcement test nor in the allowlist — the ratchet has a live hole for B-8. | (1) Widen the B-8 grep pattern to `(config\|cfg)\.runtime`. (2) Add two allowlist entries in `arch-allowlist.ts` for `src/core/preflight.ts` / pattern `cfg.runtime ?? "local"` / B-8 / `B8-preflight-checkRuntimePrereqs` and pattern `cfg.runtime === "managed"` / B-8 / `B8-preflight-checkRuntimePrereqs`. | yes |
| 2 | low | testing | `tests/unit/architecture/core-invariants.test.ts` L224, L244 | B-3 and B-4 test bodies are `expect(true).toBe(true)` — no codebase scanning, zero enforcement. TC-009 and TC-010 are "must" priority in test-cases.md. The delta spec requirement scenario lists B-3 and B-4 assertions as required. Per design the violations originate outside `core/` so this is intentional deferral, but the current stub silently passes rather than documenting its deferred scope. | Convert the body to `it.skip(...)` or add an explicit `// deferred: src-wide change` comment and a `pending()` / `todo()` marker so the gap is machine-visible rather than a passing no-op. This is a non-blocking suggestion — the deferral rationale in the design is sound. | no |
| 3 | info | testing | `tests/unit/architecture/core-invariants.test.ts` L265-274 | B-5 grep pattern `(readFile\|readFileSync\|readdir\|existsSync\|statSync)` has no word-boundary anchors and would match seam-based `deps.readFile(` calls. Scoped to `src/core/pipeline/` only (currently zero violations). If pipeline code adopts `deps.readFile`, the test will false-positive and block CI. | Acceptable given current zero-violation state; note the risk in a comment so the next author knows not to add `deps.readFile` calls to pipeline/ without updating the filter. | no |

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness | 8 | 0.30 |
| security | 9 | 0.25 |
| architecture | 7 | 0.15 |
| performance | 9 | 0.10 |
| maintainability | 7 | 0.10 |
| testing | 7 | 0.10 |

- **total**: 7.95

## Summary

全体的に設計は健全。vitest + grep + TypeScript allowlist の ratchet 実装は今後の burn-down change への足がかりとして十分機能する。regression guard テスト (T-04) は実証済みで、アーキテクチャ判断 (D1–D5) の根拠も ADR レベルで残っている。

ただし **Finding 1 は実際の穴**: B-8 enforcement の grep が `config.runtime` のみを対象としており、`checkRuntimePrereqs` で使われている `cfg.runtime` (preflight.ts L43・L59) を拾えない。この 2 行は allowlist にも入っていないため、ratchet の外側に既知 B-8 違反が漏れている。パターンを `(config|cfg)\.runtime` に広げ、2 エントリを allowlist に追加すれば修正完了（小さな変更）。

Finding 2 (B-3/B-4 no-op) は設計上の deliberate deferral であり block しない。
