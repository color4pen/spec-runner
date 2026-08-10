# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 1. request.md「現状コードの前提」全項目の実コード照合

- Gate 1（apply-canon gate）の位置: `src/core/command/resume.ts` 行 296-393 — 確認
- Gate 2（adopt gate）の位置: 行 398-440 — 確認
- Gate 1 の fail-closed halt（行 381-384 / 385-391）が slug なし hint のみを出力すること — 確認（`stderrWrite("Hint: Use --apply-canon to commit these changes ...")` で実 slug コマンド含まず）
- Gate 2 が `buildAdoptEscalationMessage(resolvedSlug, ...)` を呼ぶこと — 確認（行 434）
- resume エントリに `usage` フィールドが無いこと — 確認（`command-registry.ts:632-646` に `usage` キーなし）
- resume の flag 11 個（from/force/verbose/quiet/prompt/prompt-file/json/no-worktree/apply-canon/adopt-commits/detach）— 確認（行 633-645）
- `--detach` と `--json` が相互排他（行 649）、`--prompt` と `--prompt-file` が相互排他（行 674）— 確認
- slug fallback 経路が `JobStateStore.resolveId`（行 134）に至ること — 確認（行 131-143）
- `resolveId` エラー文言「Job not found: no job ID starts with '...'」— 確認（`job-catalog.ts:288`）
- `--from` の values 検証が `[...AGENT_STEP_NAMES, ...CLI_STEP_NAMES]` で行われること — 確認（行 634）

### 2. bin/specrunner.ts の `emitHelp(subDef.usage)` 実装

`usage` が undefined の時 `NO_DETAILED_HELP_USAGE` にフォールバックすること — 確認（行 15-18）。D4 の「usage フィールド追加のみで対応可能」という設計判断が成立することを確認。

### 3. 既存ピンテストの実態照合

- `TC-HELP-DISPATCH-03`（`tests/unit/cli/help-flag-dispatch.test.ts:139-142`）が "No detailed help available" の含有を pin していること — 確認
- `TC-RESUME-010`（`tests/unit/cli/resume.test.ts:357-363`）が "Job not found" の含有を pin していること — 確認
- `adopt-commits.test.ts` が `buildAdoptEscalationMessage` をインポートし TC-U5 を定義すること — ファイル構造確認（`src/core/resume/__tests__/adopt-commits.test.ts`）

### 4. `egressResolutionOptions` と `buildAdoptEscalationMessage` の実装確認

- `egressResolutionOptions(slugLabel)` が `specrunner job resume ${slugLabel} --adopt-commits` を含む 3 択文字列を返すこと — 確認（`src/errors.ts:404-413`）
- `buildAdoptEscalationMessage` が上記を呼んで slug 入り完全コマンドを出力すること — 確認（`src/core/resume/adopt-commits.ts:169-193`）

### 5. spec.md の形式適合検証（全 Requirement）

- 全 5 Requirement に `MUST` を含む本文あり — 確認
- 全 Requirement に `Given/When/Then` 形式の Scenario あり（合計 8 Scenario）— 確認
- spec 記法ルール（`### Requirement:` + `#### Scenario:`）を遵守 — 確認
- 「この統合は Gate 1 が fail-closed halt する経路にのみ適用し」が明記され、auto-quarantine 経路と Gate 2 単独経路が除外スコープとして明確 — 確認

### 6. 許可更新ファイルリストの実在確認

- `src/core/command/__tests__/resume-apply-canon.test.ts` — 存在確認
- `src/core/command/__tests__/resume-adopt-commits.test.ts` — 存在確認
- `src/core/command/__tests__/resume-partial-canon.test.ts` — 存在確認
- `tests/operator-canon-apply-on-resume-e2e.test.ts` — 存在確認
- `tests/resume-partial-canon-quarantine-e2e.test.ts` — 存在確認
- `tests/resolve-job-id.test.ts` — 存在確認

### 7. design.md の設計判断 D1-D5 の実装可能性確認

- D1: Gate 1 halt 枝は 2 箇所（行 379-384、385-391）で構造上 preflight 追加が可能 — 確認
- D2: `buildAdoptEscalationMessage` は `adopt-commits.ts` に独立して定義 — 確認（変更不要を担保）
- D3: 検出失敗分岐（exit 128 除外 / それ以外は `commitDetectionFailed=true`）が tasks に明記 — 確認（T-01, T-02 に詳述）
- D4: `emitHelp(subDef.usage)` 機構で `usage` フィールド追加のみで対応可能 — 確認
- D5: additive 文言（"Job not found" 保持）で TC-RESUME-010 の `toContain` 条件を満たせる — 確認

### 8. step-names.ts の配列定義確認

- `CLI_STEP_NAMES` に `bite-evidence` が含まれること — 確認（行 34）
- `custom-reviewers` / `regression-gate` は両配列に含まれず、動的に `buildAllowedStepSet` で追加されること — 確認（`resolve-step.ts:18-30`）

### 9. REOPEN_USAGE の書式（T-03 の参照元）確認

`[...AGENT_STEP_NAMES, ...CLI_STEP_NAMES].join(", ")` で有効値を列挙するテンプレートリテラル形式 — 確認（`command-registry.ts` 行 296）。T-03 の「REOPEN_USAGE の書式に倣う」指示の参照先が存在することを確認。

## 検証できなかった項目

1. **テストの実行結果**（実行環境なし）: `typecheck && test` の実際の pass/fail を確認していない。spec が定義するすべての acceptance criteria がテストで通るかは実行時検証に委ねる。

2. **E2E テストの halt ピン内容の詳細**: `tests/operator-canon-apply-on-resume-e2e.test.ts` と `tests/resume-partial-canon-quarantine-e2e.test.ts` の halt 回数・halt メッセージのピン箇所の詳細行番号。許可リストに含まれることは確認済みだが、更新後の期待が統合 halt に整合するかは実装時確認が必要。

3. **T-06 の新規テスト mock 整合性の詳細**: 「dirty canon + 未知 commit 併存」シナリオで、Gate 1 halt 直前の `detectUnadoptedCommits` 呼び出しを mock する構造が既存 harness と整合するか詳細検証していない（既存 mock 構造は apply-canon + adopt-commits mock の組み合わせで原理上可能と判断）。

## Findings 詳細

### F-01 [Low, Fixable]: T-02 が渡すべき slug 変数を特定していない

**対象**: `specrunner/changes/resume-operator-guidance/tasks.md` T-02

`buildAdoptionHaltMessage` 呼び出し元となる T-02 は「`buildAdoptionHaltMessage` を呼び」と記すが、`slug` 引数に何を渡すかを明示していない。Gate 1 halt の文脈では 2 変数が共存する:

- `this.slug`: ユーザー入力値（short Job ID prefix の可能性がある）
- `resolvedSlug`: `getJobSlug(state)` の正規 slug（Gate 1 条件 `resolvedSlug !== null` で non-null 保証済み）

Gate 2（行 434）は `buildAdoptEscalationMessage(resolvedSlug, ...)` で `resolvedSlug` を使用しており、統合 halt でも同変数を使わなければコピペ可能なコマンドに不正な識別子が入る可能性がある。実装者が `this.slug` を誤用するリスクがある。

**修正案**: tasks.md T-02 の `buildAdoptionHaltMessage` 呼び出し記述に「`resolvedSlug`（Gate 1 条件で non-null 保証済みの正規 slug）を `slug` 引数に渡す」を追記する。

---

### F-02 [Low, Decision-needed]: `bite-evidence` が --from ヘルプに表示される

**対象**: `specrunner/changes/resume-operator-guidance/tasks.md` T-03

T-03 は `[...AGENT_STEP_NAMES, ...CLI_STEP_NAMES]` を `--from` 有効値として列挙するよう指示している。実コードの `CLI_STEP_NAMES`（`step-names.ts:32-36`）には `bite-evidence` が含まれており、通常の operator が `--from bite-evidence` を使う場面は想定しにくい内部ステップがヘルプに列挙される。

spec と tasks は「全ステップを完全列挙」を明示しており、現状では仕様通りの挙動。ただし operator 向けヘルプの明瞭さを優先する場合、`bite-evidence` に注記を添えるか、または確認なしに現仕様のまま実装するかの判断が望ましい。

---

### F-03 [Low] (観測): help-flag-dispatch.test.ts 更新の許可リスト外について

**対象**: `specrunner/changes/resume-operator-guidance/design.md` Risks セクション / request.md 許可リスト

T-05 は `tests/unit/cli/help-flag-dispatch.test.ts`（TC-HELP-DISPATCH-03）を更新するが、request.md の許可リストは「halt メッセージ・halt 回数を pin している既存テスト」に限定しており同ファイルは明示されていない。

design.md の Risks セクションにおいて「カテゴリが異なる（help dispatch であって halt メッセージではない）ため許容リストの射程外だが、要件 4 が上位で mandate する」と明記されており、設計判断として記録済みである。acceptance criteria「`NO_DETAILED_HELP_USAGE` ではなく詳細ヘルプを表示」が反転を mandate しているため、この更新は要件上不可避。設計の正当化は妥当と判断する。実装上の問題はなし（情報として記録）。
