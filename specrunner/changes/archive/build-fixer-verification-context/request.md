# build-fixer に verification の失敗フェーズとエラー出力を明示的に渡す

## Meta

- **type**: spec-change
- **slug**: build-fixer-verification-context

## 背景

verification ステップは 5 フェーズ（build / typecheck / test / lint / security）を実行し、`verification-result.md` にフェーズ別の status、stdout/stderr、exit code を記録している（`src/core/verification/runner.ts:91-134`）。

build-fixer の `buildMessage()`（`src/core/step/build-fixer.ts:63-97`）は `verificationResult.findingsPath` だけを渡し、agent に「そのファイルを読め」と指示している。agent は verification-result.md を自力で開いて構造を理解する必要があり、どのフェーズで何が失敗したかの把握にターンを消費する。

`verificationResult.fileContent` には verification-result.md の全文が既に保存されている（`StepRun.outcome.fileContent`、`src/state/schema.ts:91`）。この既存フィールドから失敗フェーズとエラー出力を抽出し、build-fixer の初期メッセージに直接含めれば、agent は初手から修正に着手できる。

## 要件

### 1. verification-result.md パースヘルパーの追加

1. `src/core/verification/parse-result.ts` に、verification-result.md の内容から失敗フェーズ名とエラー出力を抽出するヘルパー関数を追加する

```typescript
interface VerificationFailure {
  phase: string;
  exitCode: number;
  output: string;  // stdout + stderr の結合
}

function extractVerificationFailures(content: string): VerificationFailure[];
```

2. verification-result.md のフォーマット（`## Phase: <name>` + コードブロック）を正規表現でパースする。フォーマットは `src/core/verification/runner.ts` が生成しており、このプロジェクトが所有している

### 2. build-fixer の buildMessage 改善

3. `src/core/step/build-fixer.ts` の `buildMessage()` で `verificationResult.fileContent` から `extractVerificationFailures()` を呼び、失敗フェーズとエラー出力を初期メッセージに含める

```
## Verification Failure

- **Failed phase**: typecheck
- **Exit code**: 1

### Error output
```
src/core/step/propose.ts:42 - error TS2345: Argument of type ...
```
```

4. `fileContent` が未保存の場合（resume 等で state が不完全な場合）は現行の挙動を維持する（findingsPath を渡して agent に読ませる）

### 3. build-fixer の system prompt 改善

5. `src/prompts/build-fixer-system.ts` に「初期メッセージに Verification Failure セクションがある場合はそのエラー出力を最初に確認せよ」を追加する

### 4. テスト

6. `extractVerificationFailures()` が verification-result.md から失敗フェーズを正しく抽出すること
7. build-fixer の buildMessage が fileContent ありの場合に失敗フェーズとエラー出力を含むこと
8. fileContent が null/undefined の場合に現行の挙動（findingsPath 参照）が維持されること

## スコープ外

- verification のフェーズ構成の変更
- verification-result.md のフォーマット変更
- code-review への verification 結果の注入
- StepResult / StepRun の型定義変更（既存の fileContent で実現する）

## 受け入れ基準

- [ ] build-fixer の初期メッセージに失敗フェーズ名とエラー出力が含まれる
- [ ] fileContent が未保存の場合に既存の挙動が維持される
- [ ] 型定義（state/schema.ts, step/types.ts）に変更がない
- [ ] `bun run typecheck && bun run test` が green


---

> **Note**: This request was archived before the change-folder format was introduced.
> Only `request.md` is preserved; design / tasks / delta-specs are not available.
> Migrated from `specrunner/requests/merged/build-fixer-verification-context.md` by `merged-to-archive-consolidation`.
