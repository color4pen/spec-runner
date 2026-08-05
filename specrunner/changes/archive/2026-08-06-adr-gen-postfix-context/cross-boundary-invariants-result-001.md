# Cross-Boundary Invariants Review — iteration 001

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した新経路

この変更が導入する新しい実行経路を列挙し、各経路で隣接機構の前提が保たれるかを確認した。

### 経路 A: `AdrGenStep.prepareRoundContext` → `derivePostFixContext` → `listCommitChangedFiles`

`buildStepContext`（`step-context-builder.ts:152-160`）が best-effort try/catch で `prepareRoundContext` を呼び出す既存経路に乗せる。

確認した前提:
- `step-context-builder.ts:153`：`if (step.prepareRoundContext && dynamicContext)` の条件。`dynamicContext` が falsy な場合、`prepareRoundContext` は呼ばれない（= postFixContext は注入されず、adr-gen は従来挙動に縮退）。`collectDynamicContext` は throw しない設計で常にオブジェクトを返すため、この条件が偽になるのはテスト環境など意図的な場合のみ。**前提保持 ✓**
- `step-context-builder.ts:155-156`：`let dynamicContext = deps.dynamicContext;` → `dynamicContext = { ...dynamicContext, ...extra };` の spread-merge はローカル変数の再代入。`deps.dynamicContext`（全 step 共有）は書き換えない。後続ステップ（pr-create 等）へ `postFixContext` が漏れない。**前提保持 ✓**
- `command/runner.ts:216`：`collectDynamicContext` は pipeline 起動時に1回だけ呼ばれ `deps.dynamicContext` に格納される。per-step で再呼び出しされない。`postFixContext` が `collectDynamicContext` によって設定されないことを `src/git/dynamic-context.ts` で確認（TC-023 が機械固定）。**前提保持 ✓**
- `derivePostFixContext` のcatch: 内部で全例外を捕捉し null を返す（never-throw）。外側の best-effort try/catch が二重に守る。`prior-round-context.ts` の縮退規律と完全に一致。**前提保持 ✓**

### 経路 B: `enrichContext` との ordering

`step-types.ts:243-245` に「`enrichContext` は `{ ...dynamicContext, ...newFields }` で返し、`prepareRoundContext` が設定したフィールドを落とさない」不変条件が文書化されている。

確認: `AdrGenStep` に `enrichContext` は定義されていない（`adr-gen.ts` 全体を精読）。この不変条件が破れる経路はない。**前提保持 ✓**

### 経路 C: `findFindingsBeforeTimestamp` による findings 選択

全 step の `StepRun` を走査し `endedAt < timestamp` の最大を選ぶ。

確認した前提:
- spec-review の findings が code-fixer round 直前の「最新」になる可能性: pipeline 順序上、code-review は spec-review phase 完了後にのみ走り、code-fixer は code-review（または custom reviewer / conformance）の `needs-fix` 後にのみ走る。code-review は spec-review より常に `endedAt` が新しい。よって spec-review findings が最新になることはない。**前提保持 ✓**
- `Object.values(steps)` の走査順: max-endedAt を求める操作のため、走査順は結果に影響しない。**前提保持 ✓**
- `endedAt` 文字列比較: ISO 8601 UTC 形式（末尾 Z）のみが使われる（テスト fixture・pipeline 実装とも同形式）。辞書順が時刻順と一致する。**前提保持 ✓**
- `findings` のみ空配列（`findings: []`）で `needs-fix` を出すレビュワーが存在した場合: その run は `if (!findings || findings.length === 0) continue;` でスキップされ、より古い findings-bearing run が選ばれる可能性がある。これは D4 の既知 trade-off（設計文書 § D4 Risks に明記）であり、本 change が新たに作った経路ではない。**既知トレードオフ、新規違反なし ✓**

### 経路 D: `resolveCodeFixerRounds` の宣言順

`state.steps?.[STEP_NAMES.CODE_FIXER]` は pipeline が逐次実行で push する配列。attempt 順（= 時刻順）が宣言順と一致する前提で走査。

確認: `StepRun.attempt` が 1-origin で付番され、配列への push は step 完了時に逐次行われる（`state/schema/operations.ts` の pushStepRun パターン）。明示的なソートは不要。**前提保持 ✓**

### 経路 E: `commitOid` 記録タイミングと adr-gen の実行タイミング

design.md に「adr-gen は review loop 収束後にのみ走り、以後 fixer は走らない」と明記されており、pipeline 遷移テーブル（`types.ts:270,277-280`）が conformance:approved → adr-gen → pr-create の順序を保証する。`prepareRoundContext` が読む `state.steps[CODE_FIXER]` は adr-gen 起動時点で全 fixer round が完了済みの状態であり、在途 commitOid が混入することはない。**前提保持 ✓**

### 経路 F: 管理ランタイム（managed runtime）の縮退

`listCommitChangedFiles` は managed runtime で常に `unavailable` を返すか、メソッド自体が省略される（`port/runtime-strategy.ts:651` の Optional 宣言）。`derivePostFixContext:235` の `if (!runtimeStrategy?.listCommitChangedFiles) return null;` がこれを確実に捕捉し null 縮退する。**前提保持 ✓**

## 確認できなかった項目

- code-fixer が `commitOid` なしで完了する実際の失敗ケース（稀なエッジケース）。ただし `resolveCodeFixerRounds` が commitOid 欠落 run をスキップし、全 round に commitOid がなければ null 縮退するため、安全に degrade する。
- 並行 custom reviewer（code-review + custom reviewer が同時完了）のとき `endedAt` が同一 ms になるケース。実際には逐次実行のため起きないが、仮に起きても max 比較の一方が勝ち、ADR 文脈が部分的に欠けるだけで機能は止まらない。

## Findings

なし（具体的な不変条件違反シナリオを構成できなかった）。

## Observations

下記は informational 記録。verdict には影響しない。

### OBS-1: `findFindingsBeforeTimestamp` の spec-fixer phase finding 混入は理論上可能

spec-fixer が複数回走り code-review より直前に `endedAt` が来ることは pipeline 順序上あり得ないが、state を手動改ざんするか、新たに spec-fixer を pipeline loop に再投入する設計変更が起きた場合、このガードは機械的ではなく「順序前提」のみで守られている。現状のパイプライン設計では問題なし。

### OBS-2: `deps.dynamicContext` が undefined の場合の silent degrade

`buildStepContext:153` の `if (step.prepareRoundContext && dynamicContext)` において `dynamicContext` が undefined の場合、`prepareRoundContext` は呼ばれず post-fix block は一切注入されない（silent degrade）。`collectDynamicContext` は throw しないため本番で起きることはないが、テスト環境での意図せぬ degrade はエラーメッセージなしに発生する。`priorRoundContext` でも同じ degrade 経路が存在し、今回の変更で新たに追加されたリスクではない。
