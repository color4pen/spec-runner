## Context

build-fixer は verification 失敗時に呼び出される agent step で、verification-result.md の findingsPath を初期メッセージに含めて「そのファイルを読め」と指示する。agent は自力でファイルを開いて構造を理解する必要があり、ターンを消費する。

verification の StepExecutor は verification-result.md の全文を `fileContent` として `StepRun.outcome` に保存している（`src/core/step/executor.ts:287-316`）。この既存データを活用すれば、型定義を変更せずに build-fixer の初期メッセージに失敗情報を直接埋め込める。

verification-result.md のフォーマットは `src/core/verification/runner.ts:91-134` の `writeVerificationResult()` が生成しており、このプロジェクトが所有している。フォーマットは以下の構造:

```
## Phase: <name>

```
<stdout + stderr>
```
```

各フェーズのステータスは Phase Results テーブルに `passed | failed | skipped` で記録される。

## Goals / Non-Goals

**Goals:**

- verification-result.md の内容から失敗フェーズとエラー出力を抽出するパースヘルパーを追加する
- build-fixer の buildMessage() で失敗情報を初期メッセージに直接含める
- fileContent が未保存の場合は現行の挙動を維持する（後方互換）
- system prompt に Verification Failure セクションの優先確認指示を追加する

**Non-Goals:**

- verification-result.md のフォーマット変更
- verification のフェーズ構成の変更
- StepResult / StepRun / StepOutcome の型定義変更
- code-review への verification 結果の注入

## Decisions

### D1: パースヘルパーの配置と設計

`src/core/verification/parse-result.ts` に純粋関数として配置する。

```typescript
interface VerificationFailure {
  phase: string;
  exitCode: number;
  output: string;  // stdout + stderr の結合テキスト
}

function extractVerificationFailures(content: string): VerificationFailure[];
```

**パースロジック**: Phase Results テーブルの各行から `failed` ステータスのフェーズ名と exit code を抽出し、対応する `## Phase: <name>` セクションのコードブロック内容を `output` として取得する。

**理由**: verification-result.md のフォーマットは `writeVerificationResult()` が生成しており安定している。正規表現パースで十分。verification ドメイン配下に置くことで凝集度を維持する。

### D2: buildMessage の分岐ロジック

`getLatestStepResult(state, "verification")` が返す `StepResult.fileContent` の有無で分岐する。

1. `fileContent` が存在する場合: `extractVerificationFailures(fileContent)` を呼び、失敗フェーズごとに `## Verification Failure` セクションを初期メッセージに埋め込む。`findingsPath` への参照も維持する（agent が追加情報を読む場合に備える）
2. `fileContent` が null/undefined の場合: 現行の挙動を維持（findingsPath のみを渡す）

**理由**: `fileContent` は verification の StepExecutor が保存するが、resume 時に state が不完全な場合や古い state ファイルでは未保存の可能性がある。フォールバックで後方互換を維持する。

### D3: 初期メッセージのフォーマット

失敗フェーズが存在する場合、以下のセクションを初期メッセージに追加する:

```
## Verification Failures

### Phase: typecheck (exit code: 1)

```
src/core/step/propose.ts:42 - error TS2345: ...
```

### Phase: test (exit code: 1)

```
FAIL tests/unit/foo.test.ts > ...
```
```

複数フェーズが失敗した場合（fail-fast により通常は1つだが、将来のフォーマット変更に備える）はすべて含める。

**理由**: build-fixer の agent がファイルを開く前に失敗の全体像を把握できる。フォーマットは markdown で、agent の読解に最適。

### D4: system prompt の追加内容

`src/prompts/build-fixer-system.ts` の修正手順セクションに以下を追加:

```
0. 初期メッセージに「Verification Failures」セクションがある場合、そのエラー出力を最初に確認する（verification-result.md を読む前に）
```

**理由**: agent が初期メッセージ内の失敗情報を見落とさないための明示的な指示。既存の修正手順の前に挿入する。

## Risks / Trade-offs

- [Risk] verification-result.md のフォーマットが変更された場合、パースが壊れる → フォーマットは `writeVerificationResult()` が生成しており同一プロジェクト内。変更時にパーサーも更新する。テストでフォーマットとパーサーの整合を検証する
- [Risk] `fileContent` が非常に大きい場合（長大なテスト出力等）、初期メッセージが肥大化する → 現時点では制限しない。実運用で問題が出た場合にトランケーション（出力の末尾 N 行のみ等）を検討する
- [Trade-off] findingsPath 参照を残すか削除するか → 残す。agent が全文を確認したい場合のフォールバックとして有用
