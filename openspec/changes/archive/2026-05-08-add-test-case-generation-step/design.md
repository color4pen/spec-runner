## Context

spec-runner の pipeline は propose → spec-review → implementer → verification → code-review → pr-create の流れで動く。code-review の system prompt（`src/prompts/code-review-system.ts:38`）と code-review step のメッセージ（`src/core/step/code-review.ts:80`）は `openspec/changes/<slug>/test-cases.md` を参照して must シナリオの実装率（Scenario Coverage）を評価する。しかし test-cases.md を生成するステップが存在しないため、code-review は存在しないファイルを基準に評価しようとしている。

openspec-workflow では test-case-generator agent が design.md と tasks.md からテストシナリオを導出し test-cases.md を生成する。これを spec-runner のパイプラインにも組み込む。

既存ステップのパターン: AgentStep は kind/name/agent/toolHandlers/buildMessage/resultFilePath/parseResult で構成される。completionVerdict を設定すると resultFilePath が null でもセッション完了時にその verdict が使われる（implementer, propose と同じパターン）。

## Goals / Non-Goals

**Goals:**

- spec-review:approved 後に test-case-gen ステップを実行する
- design.md と tasks.md からテストシナリオ（must/should/could）を導出し test-cases.md を生成する
- test-case-gen 完了後に implementer が実行される
- エラー時は escalation で終了する（fixer ループなし）

**Non-Goals:**

- test-cases.md の品質レビューループ（品質問題は code-review で検出される）
- spec-fixer による test-cases.md の修正
- test-case-gen の fixer ループ（完走 = 成功）
- dynamicContext の利用（設計ドキュメントのみ参照するため不要）

## Decisions

### D1: TestCaseGenStep の設計パターン

implementer / propose と同じ「completionVerdict 型」の AgentStep を採用する。

- `completionVerdict: "success"` — セッション完走 = 成功。result file による verdict 判定は行わない
- `resultFilePath: null` — test-cases.md はエージェントが直接 commit/push するが、pipeline 側での verdict パースは不要
- `parseResult: NULL_PARSE_RESULT` — 同上
- `requiresCommit: false`（省略）— test-cases.md の生成漏れは code-review の Scenario Coverage で検出される。requiresCommit guard はこのステップでは過剰

**理由**: test-case-gen は設計の読解タスクであり、成功/失敗の二値で十分。中間的な verdict（needs-fix 等）は不要。生成物の品質は下流の code-review で担保される。

### D2: model 選択

`claude-sonnet-4-6` を使用する。

**理由**: テストケース導出は design.md / tasks.md の構造化された読解であり、Opus は過剰。既存の implementer / code-fixer / build-fixer / spec-fixer と同じ Sonnet で十分。

### D3: system prompt の構造

`src/prompts/test-case-gen-system.ts` に以下を定義する:

- `TEST_CASE_GEN_SYSTEM_PROMPT`: system prompt 本文
- `buildTestCaseGenInitialMessage(opts)`: user message 組み立て関数

system prompt はパイプライン上の位置づけ、出力フォーマット（must/should/could × GIVEN/WHEN/THEN）、制約（テストコードは書かない）を指示する。

出力先は `openspec/changes/<slug>/test-cases.md` 固定（iteration なし）。test-case-gen はリトライループを持たないため、iteration-based naming は不要。

### D4: 遷移テーブルの変更

STANDARD_TRANSITIONS の `spec-review:approved → implementer` を以下に置換する:

```
spec-review:approved → test-case-gen
test-case-gen:success → implementer
test-case-gen:error   → escalate
```

test-case-gen は fixer ループを持たない。エラー時は escalation で停止し、ユーザーに判断を仰ぐ。

### D5: buildMessage の設計

buildMessage は以下の情報を user message に含める:

- slug（change folder パスの構築に必要）
- branch（commit/push 先）
- request.md の内容（テストケース導出の文脈理解に必要）

dynamicContext は不要。test-case-gen は design.md / tasks.md のみを読み、ブランチ上のコード差分は参照しない。

branch が未設定の場合は branchNotSetError を投げる（implementer と同じガード）。

### D6: maxTurns

15 を設定する。

**理由**: test-case-gen は design.md と tasks.md を読み、test-cases.md を書き、commit/push するだけ。spec-review と同等の 15 turns で十分。

## Risks / Trade-offs

- [Risk] test-case-gen がファイルを生成せずに完了した場合 — completionVerdict: "success" なので pipeline は implementer に進む。code-review が test-cases.md を参照できず Scenario Coverage が LOW になるが、pipeline 自体は止まらない。これは設計上の意図（request の記述通り、品質問題は code-review で検出される）
- [Trade-off] requiresCommit: false — test-cases.md の commit 漏れを検出しない。実装を軽量に保つ代わりに、code-review での検出に委ねる
- [Risk] pipeline 全体の所要時間が 1 ステップ分増える — Sonnet × 15 turns は数分程度。設計読解のみなので実際の消費 turns は 5 前後の見込み
