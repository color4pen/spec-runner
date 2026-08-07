# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 読んだファイル

- `specrunner/changes/dead-code-core/request.md`
- `specrunner/changes/dead-code-core/design.md`
- `specrunner/changes/dead-code-core/tasks.md`
- `specrunner/changes/dead-code-core/spec.md`

### アーキテクチャ検証

**D1（ファイル削除 vs symbol 削除の判断基準）**: 一貫している。ファイル内の全 export が死コードなら削除、一部のみなら symbol 単位で削除。`FinishFs`・`list` 等の残存 export を正しく区別している。

**D2（ERROR_CODES 残存判断）**: 確認済み。`ERROR_CODES.STATE_FILE_INVALID` は `src/core/finish/job-state-update.ts:70` と `src/store/job-location-resolver.ts:43,57` で実際に使用されている。`ERROR_CODES.BRANCH_NOT_REGISTERED` は `run.ts:124` のコメント参照のみだが設計判断として明示的に残留。`ERROR_CODES.STEP_INPUT_MISSING` は `src/core/runtime/local.ts:1414,1481` で直接使用されている。

**D3（core/tools/ 削除と agent-runner.test.ts TC-016）**: TC-016 は 2 つの `it` ブロックを持つ。1 つ目（`adapter/managed-agent/tools/` の確認）と 2 つ目（`src/core/tools/` の確認）が共存する。tasks.md T-07 は 2 つ目のみを削除対象として正しく特定している。TC-017（src 内の import を確認）は残存するため観測空白は生じない。

**D4（core/validation/ 削除と shim repoint）**: `src/parser/validation/` の実体の存在を確認。`src/core/validation/registry.ts` と `types.ts` が shim（5 行 re-export）であることを確認。shim 経由でなく `src/parser/validation/` に直接 repoint するのは依存方向として正しい。

**D5（core/doctor/index.ts 削除と next-steps.test.ts）**: `tests/unit/doctor/next-steps.test.ts:15-30` に try/catch fallback が存在することを確認。index.js の動的 import が失敗すると自動的に `next-steps.js` を直接 import する。`src/cli/doctor.ts:14` は既に submodule を直接 import しており、index.ts の本番利用はゼロ。

**D6（derive-usage.ts 削除）**: `src/core/finish/derive-usage.ts:20-29` を確認。`{ok: true, skipped: true}` を即時返し、副作用ゼロ。`orchestrator.ts:238-249` の try/catch block が唯一の呼び出し元であることを確認。3 つのテストファイルに `vi.mock` が存在することを確認済み。

### 正当性検証

**死コードの根拠確認**:
- `resolveTarget`・`fetchPrViewWithRetry`: `src/` 内の呼び出しゼロ（各自の定義ファイルと専用 test のみ）
- 7 factory 関数: `src/` 内の呼び出しゼロ（`errors.ts` 定義外の参照なし）
- 7 ERROR_CODES エントリ: `src/` 内での参照ゼロ（定義外）
- `state/reconcile.ts`・`util/slugify.ts`: `src/` 内の import ゼロ
- barrel/tombstone 4 ファイル: import 文が src/ tests/ にゼロ
- `core/tools/` と `core/validation/`: src/ 内の import ゼロ（parser/validation の comment のみ）
- `core/port/index.ts`: src/ tests/ の import ゼロ
- 3 prompt wrapper/re-export: 各定義ファイル以外の本番参照ゼロ
- 3 tool-types.ts symbol: 定義ファイル外の参照ゼロ

**FinishFs 残存確認**: `src/core/archive/orchestrator.ts:20` と `src/core/archive/post-merge-cleanup.ts:11` から import されていることを確認。`types.ts` から削除対象 4 interface のみ除去し `FinishFs` を残す設計は正しい。

**DoctorContext const vs interface 区別**: `types.ts:90` に `export const DoctorContext: undefined = undefined` が存在し、`export interface DoctorContext` と共存している。const のみ削除・interface 残存という T-09 の指示は正しい。

**T-04 error-codes.test.ts 修正の境界**: `branchNotRegisteredError`・`stateFileInvalidError` の factory assertion を削除し、`ERROR_CODES.BRANCH_NOT_REGISTERED`・`ERROR_CODES.STATE_FILE_INVALID` の assertion は残す。この粒度は tests/error-codes.test.ts の構造に対して適切。

### タスク分解の網羅性

全 14 タスク（T-01〜T-14）が request.md 要件 1〜5 を網羅している。T-14 が integration gate として typecheck + test の green を確認する。

## 検証できなかった項目

**agent-runner.test.ts の正確な行番号**: T-07 では「259-264」と記載されているが、実際に確認すると TC-016 describe 内の 2 番目 `it` ブロックが対象であり、行番号は環境差でずれる可能性がある。削除対象を行番号でなくテスト説明文（"register_branch does NOT exist in src/core/tools/"）で特定することを推奨するが、機能的リスクは低い。

**spec.md の残存 symbol シナリオ**: `ERROR_CODES.BRANCH_NOT_REGISTERED`・`ERROR_CODES.STATE_FILE_INVALID` を grep で確認するシナリオが spec.md にない（STEP_INPUT_MISSING・FinishFs・CustomToolContext のみ明示）。T-14 の grep 確認で実質的には担保される。

## Findings 詳細

### F-01: T-09 tasks.md — doctor-cli.test.ts の vi.mock 削除範囲が不明確

`tasks.md T-09` の「`tests/core/doctor/doctor-cli.test.ts` で `allChecks` を mock しているブロックを削除し」という指示は、`vi.mock("...checks/index.js", () => ({ allChecks: [], commonChecks: [], managedChecks: [], localChecks: [] }))` という 1 つの vi.mock ブロックを指している。

このブロックには `allChecks: []` に加えて `commonChecks: []`・`managedChecks: []`・`localChecks: []` が含まれる。`src/cli/doctor.ts:215-216` がこれら 3 つを使用しているため、ブロック全体を削除すると実体実装が使われることになる。ただし `runChecks` は別途 `vi.fn()` でモック済みであり、`commonChecks` 等の実値は test 結果に影響しないため、全体削除でも test は green を維持する。

**影響**: 実装者が全体削除しても test は通るが、意図（`allChecks: []` 1 行の削除）と実装が乖離する可能性がある。task 文言を「`allChecks: []` の行のみを削除」と明確化することが望ましい。

### F-02: Design D5 と request.md 要件 4 の記述差異

`request.md` 要件 4 は「`tests/unit/doctor/next-steps.test.ts:17` の動的 import を `next-steps.js` 直接に repoint する」と記載している。

`design.md D5` と `tasks.md T-09` は「try/catch fallback が存在するため test 修正は不要」と判断を変更している。fallback の動作を実際のコード（lines 15-31）で確認し、技術的に正しいことを検証した。

ただし、削除後も test file 内に「Module does not exist yet — dynamic import defers the failure to test execution (RED until implementation)」というコメント（line 14）が残る。このコメントは `index.ts` 削除後に実態と乖離する stale コメントになる。tasks.md がこのコメント修正を指示していない点が軽微な見落とし。

**影響**: stale コメントが残る。機能的影響なし。コメント 1 行の修正を T-09 に追加することを推奨。
