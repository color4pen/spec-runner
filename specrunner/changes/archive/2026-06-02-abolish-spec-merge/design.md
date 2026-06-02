# Design: abolish-spec-merge

## Context

`job finish` Phase 1 は `mergeSpecsForChange` で各 change の delta spec を baseline spec に書き込む。この経路は pipeline が自身の振る舞い authority を書き換える唯一の閉ループである。

実測では baseline は下流（implementer / code-review / verification）に消費されず、振る舞いの真実は test suite と構造の歯（B-1〜B-10 / §3 DSM closure）が担う。ADR-20260602（spec-model）D3 に基づき、この閉ループを断つ。

**撤去対象のコード:**

| ファイル | 理由 |
|----------|------|
| `src/core/finish/spec-merge.ts` | merge ロジック本体（~785 行） |
| `src/core/finish/baseline-headers.ts` | `normalizeRequirementHeader`。spec-merge.ts のみが import |
| orchestrator.ts の `mergeSpecsForChange` 呼び出し（L272-273） | Phase 1 内の merge 実行点 |
| `tests/finish-spec-merge.test.ts` | spec-merge テスト |
| `tests/unit/core/finish/spec-merge-baseline-check.test.ts` | baseline header check テスト |

**更新対象の prompt / ルール / テスト:**

| ファイル | 箇所 |
|----------|------|
| `src/prompts/spec-fixer-system.ts` | `**Critical（spec-merge が parse に依存するフォーマット）:**` → rationale 更新 |
| `src/prompts/code-fixer-system.ts` | 同上 |
| `src/prompts/request-review-system.ts` | `authority specs are auto-updated by \`specrunner finish\` spec-merge` → 撤去 |
| `src/prompts/rules.ts` | `mergeSpecsForChange が自動実行する` → 更新 |
| `src/core/finish/commit-archive.ts` | コメント内の `mergeSpecsForChange` 参照 |
| `src/core/spec/rules/no-authority-spec-direct-edit.ts` | コメント内の `spec-merge` 参照 |
| `tests/finish-orchestrator.test.ts` | `spec-merge can parse type` コメント |
| `tests/unit/command/request-review.test.ts` | `spec-merge` 文字列アサーション |

## Goals / Non-Goals

**Goals**:

- `job finish` から delta→baseline 反映経路を除去する
- spec-merge 実装・テスト・prompt 内 rationale を残置参照なしで撤去する
- finish の request type 別 delta spec 有無ガードを廃止する

**Non-Goals**:

- baseline corpus のディレクトリ構造整理（ADR D4 / baseline-capability-consolidation）
- architecture/ 配下の構造ドキュメント同期
- `specrunner/specs/spec-merge/spec.md`（baseline spec ファイル自体）の削除 — baseline corpus の整理はスコープ外

## Decisions

**D1: orchestrator から mergeSpecsForChange 呼び出しを削除し、import を除去する**

Phase 1 の `runPhase1Archive` から L272-273 の呼び出しを削除する。archive → usage derive → commit の流れは維持。

Rationale: merge が消えるため import は dead code になる。呼び出し削除だけでは import lint が通らない。

**D2: spec-merge.ts / baseline-headers.ts を丸ごと削除する**

コード量が大きく（~810 行）、内部型・関数は他モジュールから参照されていない（`normalizeRequirementHeader` は spec-merge.ts のみが import）。段階的 deprecation は不要。

Alternative: 関数を残して `@deprecated` を付ける → 消費者ゼロなので意味がない。却下。

**D3: prompt の delta spec フォーマット規約は維持し、rationale のみ更新する**

`## Removed` リスト形式、`### Requirement:` header 一致等のフォーマット規約はそのまま残す。`spec-merge が parse に依存」という rationale 部分だけを「delta-spec-validation が parse に依存」に差し替える。

Rationale: delta spec format の規約は spec-review / delta-spec-validation で引き続き有効。規約の存在理由を正確に記述する。

**D4: request-review prompt の authority path 直接編集ガード文言を更新する**

`authority specs are auto-updated by \`specrunner finish\` spec-merge from the delta` を「baseline は PR merge で自動更新されない。delta spec に書き、test で振る舞いを検証する」趣旨に置換する。baseline が read-only である理由が spec-merge から「設計方針」に変わる。

**D5: rules.ts の spec authority lifecycle 説明を更新する**

`mergeSpecsForChange が自動実行する。PR 内で baseline を更新する経路は存在しない` → `baseline は pipeline / finish のいずれでも更新されない。振る舞いの authority は test suite が担う` に更新。

**D6: finish の type 別 delta spec ガードは廃止しない — orchestrator 側で除去するだけ**

`mergeSpecsForChange` 内にある `SPEC_REQUIRED_TYPES` / `SPEC_OPTIONAL_TYPES` のガードロジックは、ファイルごと削除されるため自動的に消える。orchestrator 側に代替ガードは追加しない。delta spec 有無のバリデーションは pipeline の `delta-spec-validation` step が担う。

**D7: commit-archive.ts のコメントを更新する**

`mergeSpecsForChange + archiveChangeFolder` → `archiveChangeFolder` に更新。ファイルヘッダとインラインコメントのみ。

**D8: テストの更新方針**

- `tests/finish-spec-merge.test.ts` — 丸ごと削除
- `tests/unit/core/finish/spec-merge-baseline-check.test.ts` — 丸ごと削除
- `tests/finish-orchestrator.test.ts` — `spec-merge can parse type` コメント更新。orchestrator テストは merge 呼び出しを stub しているだけなので、stub 削除で済む
- `tests/unit/command/request-review.test.ts` — `spec-merge` 文字列アサーション削除・更新

## Risks / Trade-offs

**[Risk] baseline が陳腐化する** → baseline は既に下流で消費されていない。ADR D3 で明示的に source-of-truth の役割を剥奪済み。将来 baseline を再び利用する場合は別途設計する。

**[Risk] delta spec format 規約の根拠が弱まる** → D3 で rationale を delta-spec-validation に差し替えることで規約の根拠を維持する。

## Open Questions

なし
