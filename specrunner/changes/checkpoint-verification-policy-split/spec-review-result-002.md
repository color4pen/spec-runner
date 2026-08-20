# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 読んだファイル

- `request.md` — 背景・要求・受け入れ基準・スコープ外
- `design.md` — D1〜D5 の設計判断
- `tasks.md` — T-01〜T-04 タスク分解（spec-fixer 更新版）
- `spec.md` — 4 Requirement × 9 Scenario（spec-fixer 更新版）
- `test-cases.md` — TC-001〜TC-014（spec-fixer 更新版）
- `spec-review-result-001.md` — 前回レビューの findings（F-1〜F-3）
- `src/core/attach/verify-checkpoint.ts` — 現状実装（280 行）
- `src/core/attach/orchestrator.ts` — runAttachVerification 呼び出し元
- `src/core/resume/resolve-step.ts` — resolveResumeStep 実装詳細
- `tests/unit/architecture/arch-allowlist.ts` — allowlist 定義
- `tests/attach/verify-checkpoint.test.ts` — 既存テスト群（先頭部）

### 前回エスカレーション findings の解消確認

**F-1（TC-006 fixture 条件と resolveResumeStep 実装の不整合）**: 解消済み

- `spec.md` の Scenario: resume point unresolvable が「`null` resumePoint + `state.step` が allowed step set に無い」に更新された（resolveResumeStep の実際の throw 条件に一致）
- `tasks.md` T-03 の fixture 記述も同様に修正された（"non-null resumePoint は検証なしで passthrough されるため fixture に使わない"）

**F-2（T-03 受け入れ基準に TC-004 が含まれない）**: 部分解消

- T-01 の Acceptance Criteria に TC-004 が追加された（"corrupted journal の checkpoint で `policy.verify()` が呼ばれる前に `journal-corrupted` で throw することがテストで確認できる（TC-004）"）
- T-03 の task body では TC-004 の実装が checkbox として記述されている
- ただし T-03 自身の Acceptance Criteria には TC-004 の記載がなく、追跡上 T-01 AC と T-03 body の二箇所に分散した状態

**F-3（test-cases.md の automated カウント不整合）**: 部分解消

- Summary 行が "Automated: 14 (unit/integration: 11, gate: 3)" に更新され内訳は明確になった
- Result の YAML ブロックは `automated: 11` のままで、合計 14 件（manual: 0）との整合性がない

### アーキテクチャ観点

- `checkpoint-policy.ts` を `src/core/attach/` に置く判断（D2）は妥当。import 方向は verify-checkpoint.ts → checkpoint-policy.ts で同一モジュール内完結。新たな cross-layer import は発生しない。
- デフォルト引数 `policy = attachResumePolicy`（D1）による後方互換は正しい。orchestrator.ts（L84）は signature 変更後も無改変で動く。
- `PolicyVerificationContext { state, slug, treeFiles }` の最小公開原則（D4）は妥当。
- `verify()` が sync（D5）は現時点で正しい。将来 async が必要になれば `await policy.verify()` のワンライン変更で対応できる。
- allowlist への新エントリが不要な根拠（Risks 節の cross-layer import 分析）は筋が通っている。

### 正確性観点

- 検証順序（profile → policy.verify() → request.md → identity）は現在の実装順序（(a)(c)(d-new) が (d)(e) の前）を保存する。
- design.md D3 は「(d)(e) は generic 側に残す」と言うが policy との前後関係は明示しない。tasks.md T-02 は「profile 検証の後、request.md 存在確認（(d)）の前」と明示しており実装を正しく導く。
- TC-006 の trigger 条件は resolveResumeStep 実装と整合している（F-1 解消済み）。

### タスク網羅性観点

- T-01 → TC-010（export 確認）+ TC-004（generic → policy 実行順序 pin）✓
- T-02 → TC-001（既存 caller 無改変）+ TC-011（直接 import 消滅）✓
- T-03 → TC-002 / TC-003 / TC-004（task body）/ TC-005 / TC-006 / TC-007 ✓
- T-04 → TC-012 / TC-013 / TC-014（gate）✓

## 検証できなかった項目

- `bun run typecheck` / `bun run test` の実行結果（環境実行不可）
- `arch-allowlist.ts` の実テスト通過（実行不可）
- `resolveResumeStep` が TC-006 fixture に対して実際に throw するかのランタイム検証（静的分析のみ。F-1 修正で fixture 条件は実装と整合済み）

## Findings 詳細

### F-4: spec.md の "before invoking the supplied policy" 列挙に request.md が含まれており tasks.md と矛盾する

**spec.md Requirement（generic integrity verification）本文**:

> `verifyCheckpoint` MUST execute generic integrity checks (journal / projection integrity,
> counter reversal, profile self-consistency, **request.md presence**, identity) before invoking the
> supplied policy.

この記述は "request.md presence" が policy 呼び出し前に実行される generic check であると読める。

**tasks.md T-02 の明示**:

> 呼び出し位置: profile 検証の後、request.md 存在確認（(d)）の前

tasks は `policy.verify()` が request.md チェック (d) の**前**に呼ばれると明示する。

**現在の verify-checkpoint.ts 実行順序**（設計で保存すべき順序）:

```
(b-new) version2
(b)     journal integrity
(b-new) counter reversal
(profile) profile self-consistency
(a)     status === "awaiting-resume"    ← policy.verify() に移動
(c)     pipeline/resumePoint 解決       ← policy.verify() に移動
(d-new) reads() 入力検査               ← policy.verify() に移動
(d)     request.md 存在確認            ← policy 呼び出し後に残る
(e)     identity                       ← policy 呼び出し後に残る
```

挙動保存の観点では tasks の順序（policy → request.md）が正しい。spec の prose は "request.md presence" を policy 前の generic check として挙げており実装と乖離する。

**影響範囲**: spec は conformance step が規範とするドキュメント。"request.md presence is before policy" と読んで request.md チェックを policy の前に移動した場合、status 誤り + request.md 欠落が重なる状態で発火するエラーが `not-quiescent` から `missing-request-md` に変わり、挙動保存の前提が崩れる。

**修正**: spec.md の当該 MUST 文から "request.md presence" を除外するか、"(d) request.md は policy 呼び出し後、identity 前に検証する" と補足する。

### F-3（残存）: test-cases.md Result YAML の `automated: 11` が Summary の 14 件と不整合

Summary 行は "Automated: 14 (unit/integration: 11, gate: 3)" に修正済み。Result YAML は `automated: 11` のまま。`automated + manual = total` を期待するなら `automated: 14` が正しい。実装への影響なし。

### F-2（残存）: T-03 Acceptance Criteria に TC-004 が記載されていない

TC-004（generic 検証が policy より先に発火することの pin テスト）は T-03 の実装 checkbox に含まれるが、T-03 の Acceptance Criteria には記載がない。T-01 AC に TC-004 への言及が追加されているものの、テスト実装は T-03 が担当する `checkpoint-policy.test.ts` の中で行われる。T-03 AC が TC-004 green を明示すると自己完結する。
