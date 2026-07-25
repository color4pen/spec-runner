# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### コードアサーション（全 7 件）

1. **`src/core/runtime/local.ts:1317-1333`** — test-coverage ブランチが `evaluateTestCoverage` を呼び、失敗時に `[...result.missingTcIds, ...result.assertionlessTcIds]` を `violations` の `detail` に格納することを確認。行番号・内容ともに request 記載と一致。

2. **`src/core/step/step-halt.ts:257-292`** — `makeOutputGateHalt` の `violationPaths` 生成（263-268 行）が `tasks-complete` / `content-format` のみ detail を描画し、`test-coverage` が `v.path` のまま fall-through することを確認。

3. **`src/core/step/output-verify.ts:134-189`** — `buildOutputFollowUpPrompt` が `tasks-complete` / `produced` / `content-format` の 3 節のみ持ち、`test-coverage` 節が存在しないことを確認。

4. **`src/core/step/step-context-builder.ts:108-122`** — policy `"follow-up"` の契約を絞り込み、`detect` / `maxAttempts` / `buildPrompt` から成る `outputVerification` を組み立てるループが実装済みであることを確認。

5. **`src/core/step/executor.ts:406-422`** — 全契約の最終ゲートチェックで `partitionByPolicy` により `followUp` に残存した違反も `makeOutputGateHalt` に合流することを確認。

6. **`src/core/step/test-materialize.ts:87-97`** — `outputContracts()` で返す test-coverage 契約の `policy` が `"halt"` であることを確認。

7. **`src/core/verification/test-coverage.ts`** — `evaluateTestCoverage` が `missingTcIds` と `assertionlessTcIds` を独立したフィールドで返す `TestCoverageResult` 型を確認。`status === "failed"` 条件（両配列の OR）も確認。

### 関連構造の確認

- `src/core/port/output-contract.ts` — `OutputViolation.detail: string[]` の型定義と、コメント「union of missingTcIds and assertionlessTcIds」を確認。要件 4（区別可能形式）の実装ではこのコメントと local.ts:1331 の生成コードの両方を更新する必要がある。
- `src/core/runtime/managed.ts:482-487` — managed runtime は test-coverage を skip（ローカル fs 不在のため）であることを確認。本 request のスコープ外かつ設計済み。
- `src/adapter/claude-code/agent-runner.ts:936-979` — follow-up 修復ループが in-session で動作することを確認。policy を `"follow-up"` に変えるだけでループが起動する。

### 受け入れ基準のテスト可能性

すべての基準が純粋関数（`makeOutputGateHalt` / `buildOutputFollowUpPrompt`）またはモック可能なインターフェース境界でのユニットテストとして記述可能であることを確認。

## 検証できなかった項目

None — request 記載の全コードアサーションを実ソースで確認した。

## Findings 詳細

None — blocking / decision-needed の指摘なし。

### Observation（アクション不要）

`src/core/port/output-contract.ts:101-102` のコメント "union of missingTcIds and assertionlessTcIds" と `src/core/runtime/local.ts:1331` のフラット配列生成（`[...result.missingTcIds, ...result.assertionlessTcIds]`）は、要件 4 の実装でどちらも更新対象になる。design step が区別フォーマット（文字列プレフィックス方式 `"missing:TC-064"` 等か、別フィールド追加か）を明示すると実装者が一貫した変更を行いやすい。
