# Code Review Feedback — slug-basebranch-charset-validation — iter 1

- **verdict**: approved
- **reviewer**: claude code-review
- **date**: 2026-05-27

---

## Summary

コア実装（charset validation + SLUG_REGEX 集約）は設計通り正確で、全 must テストケースが通過し受け入れ基準をすべて満たしている。スコープ外の変更 2 件を MEDIUM/LOW で記録するが、いずれも機能不全・明確なバグには該当しないため approved。

---

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | MEDIUM | scope-creep | `src/core/step/code-fixer.ts` | `requiresCommit: false → true` が本 request のスコープ外。request.md / design.md / tasks.md に記載なく、pipeline の commit 生成動作を変える semantic change。テストは全通過だが変更の根拠が追跡不能。 | 別 issue / PR に分離するか、design.md に変更理由を追記する。 | no |
| 2 | LOW | scope-creep | `tests/adapter/dispatching/agent-runner.test.ts` | CodexAgentRunner mock 追加（EPIPE 抑制）が charset validation と無関係。純粋なテスト安定化であり blocking ではないが、本 PR への混在は変更追跡を困難にする。 | 別 PR で対応することを推奨。 | no |
| 3 | LOW | defense-in-depth | `src/util/validation-patterns.ts` | `BASE_BRANCH_REGEX` に長さ上限がなく、任意長の文字列が通過する。実用上 OS の branch 名制限（~255 bytes）に収まるため critical ではない。 | 任意。`{1,255}` 等の量指定子を追加する場合は別 PR。 | no |

---

## Acceptance Criteria Check

| 受け入れ基準 | 結果 |
|---|---|
| parser rules で charset 不正な slug / baseBranch が error として検出される | ✅ |
| 既存の `request new` CLI と同じ正規表現が parser rules に適用されている | ✅ SLUG_REGEX 完全一致 |
| SLUG_REGEX が1箇所で定義され、全利用箇所から参照されている | ✅ `src/util/validation-patterns.ts` のみ定義、4箇所から import |
| baseBranch に `--upload-pack` を渡した場合 parser rules で reject される | ✅ TC-09 |
| 既存テストが破壊されないこと | ✅ 3162 tests passed |

## Test Coverage (must cases)

| TC | 内容 | カバー |
|---|---|---|
| TC-01 | slug path traversal | ✅ |
| TC-02 | slug git option injection | ✅ |
| TC-03 | slug uppercase | ✅ |
| TC-04 | slug spaces | ✅ |
| TC-05 | valid slug | ✅ |
| TC-07 | slug null → missing error | ✅ |
| TC-08 | slug empty → missing error | ✅ |
| TC-09 | baseBranch git option injection | ✅ |
| TC-10 | baseBranch leading dash | ✅ |
| TC-11 | baseBranch shell metachar | ✅ |
| TC-12 | baseBranch space | ✅ |
| TC-13 | baseBranch `main` | ✅ |
| TC-14 | baseBranch `release/v1.0` | ✅ |
| TC-15 | baseBranch `feature/foo-bar` | ✅ |
| TC-17 | baseBranch null → missing error | ✅ |
| TC-18 | SLUG_REGEX 定義は1箇所のみ | ✅ (grep 確認) |
| TC-19 | SLUG_REGEX の値が正しい | ✅ |
| TC-21 | request-new.ts が共有定数から import | ✅ |
| TC-22 | rules-new.ts が共有定数から import | ✅ |
| TC-23 | command-registry.ts が共有定数から import | ✅ |
| TC-24 | typecheck green | ✅ |
| TC-25 | test suite green | ✅ |
