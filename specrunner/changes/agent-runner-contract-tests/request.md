# AgentRunner の共有コントラクトテストを導入し、adapter 間の暗黙契約の欠落を構造的に防ぐ

## Meta

- **type**: chore
- **slug**: agent-runner-contract-tests
- **base-branch**: main
- **adr**: false

## 背景

2026-06-12 の codex 移行実測で、codex adapter に 3 つの機能欠落が運用中に発覚した: ①transient retry（#659 で実装）②completion report の main turn 契約と診断（#670 / #673）③resumePrompt の注入（#674）。3 つはすべて同じ構造 — **claude-code adapter だけが満たしていた振る舞い契約が、port の型シグネチャ（`run(ctx) → result`）に現れないため、第二の実装が黙って破った**。型は通るがふるまいが欠ける、という欠落は現状テストでは adapter 個別のテストに依存しており、実装者が知らない契約は書かれない。

## 現状コードの前提

- `src/core/port/agent-runner.ts` — AgentRunner port。契約は jsdoc 記述のみで、実装横断の検証はない
- `tests/unit/contract/golden-cases.test.ts` — 契約テストの置き場と先例が既に存在する
- 検証可能な振る舞い契約の実例（すべて mock SDK で再現可能なテストが adapter 個別には存在する）: transient エラーの retry と step:retry emit（claude: #656、codex: #659 のテスト）、reportTool 結果の回収と follow-up retry（#670）、`ctx.session.resumePrompt` の prompt への包含（claude のみ、codex は #674 で追加予定）、`ctx.session.logPath` 指定時の JSONL 出力、postWorkPrompts の実行
- adapter は現在 2 実装（claude-code / codex）+ managed-agent

## 要件

1. AgentRunner 実装が満たすべき振る舞い契約を共有テストスイートとして定義し、全 local adapter（claude-code / codex）に同一のテストを適用する。対象契約は最低限: resumePrompt の prompt 包含 / reportTool 結果の回収（素 JSON）/ transient retry の発火と step:retry emit / logPath 指定時の出力 / postWorkPrompts の実行
2. スイートは adapter ごとの SDK mock を差し込める構造とし、新 adapter 追加時にテスト追加が強制される形（登録漏れが検出される仕組み）にする
3. managed-agent runner の扱い（適用するか、契約のサブセットか）は design で判断し、除外する場合は理由を記録する

## スコープ外

- adapter 実装本体の変更（テストが落ちる場合は本 request ではなく該当 adapter の修正 request で対処）
- port インターフェースの型変更

## 受け入れ基準

- [ ] 共有契約スイートが claude-code / codex の両 adapter に対して実行され green であることをテストで固定する
- [ ] 契約スイートに登録されていない AgentRunner 実装が検出される仕組みをテストで固定する
- [ ] `typecheck && test` が green

## 関連

- 実測: 2026-06-12 に同型の契約欠落が 3 件連続で運用中に発覚（#659 / #673 / #674）
- **#673 / #674 の取り込み後に着手すること**（resumePrompt 契約は #674 が入るまで codex で red になるため）
