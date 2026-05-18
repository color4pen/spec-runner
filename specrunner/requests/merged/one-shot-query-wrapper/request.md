# one-shot query() の共通ラッパーを抽出する

## Meta

- **type**: spec-change
- **slug**: one-shot-query-wrapper
- **base-branch**: main
- **adr**: true
- **date**: 2026-05-18
- **author**: color4pen
- **issue**: #224

## 背景

`request-review` の `executeReview()` で query() 呼び出しの boilerplate (= config 解決 → maxTurns/timeout → AbortController → for await → result パース) を手書きしている。これは `agent-runner.ts` のパターンとほぼ同じ。

今後 one-shot コマンド (= watch のリスク評価、`specrunner request create` の generator 等) を追加するたびに同じコードが増える。

## 設計判断

### 1. queryOneShot ラッパー

```ts
// src/adapter/claude-code/query-one-shot.ts (= 配置候補、実装時に判断)
export interface QueryOneShotOptions {
  systemPrompt: string;
  allowedTools?: string[];
  prompt: string;
  maxTurns?: number;
  timeoutMs?: number;
  // config 解決は内部で行う
}

export interface QueryOneShotResult {
  text: string;             // assistant の最終 text response (= raw output、構造化 parse は caller)
  sessionId?: string;       // managed runtime の session ID (= local runtime では undefined)
  turnCount?: number;       // 実消費 turn 数 (= debugging 用)
  stopReason?: string;      // 完了理由 (= "end_turn" / "max_turns" / "abort" など raw)
}

export async function queryOneShot(
  opts: QueryOneShotOptions,
): Promise<QueryOneShotResult>;
```

- config 解決 (= model / maxTurns / timeoutMs の解決)
- AbortController 構築 + timeout 連動
- for await loop で result 取得
- 完了判定 (= 既存 reviewer.ts と同等の SSE break ルール)

result は **raw text 中心** (= 構造化 parse は呼び出し側、e.g. `parseReviewOutput` は reviewer 内に残す)。理由: queryOneShot は use case 非依存の薄いラッパー、汎用化のため structured result は持ち込まない。

### 2. agent-runner との関係

`agent-runner.ts` (= `AgentRunner` port 実装) は **pipeline step lifecycle 用** (= step / state / branch / slug / requestContent / emit 等の AgentRunContext を持つ)。`queryOneShot` は **単発 one-shot 用** (= request create / review / watch 等、step 非依存)。両者は orthogonal な関心事で context shape が根本的に異なるため統合しない。

ただし両者で重複する config 解決 / AbortController 構築は共通 helper (= `src/adapter/claude-code/query-helpers.ts` 等) に抽出可能。

= 既存 spec authority `agent-runner-port` (= pipeline step lifecycle 仕様) は **本 request の対象外**。one-shot query は **新規 capability** `one-shot-query` として spec 化する。

### 3. 既存 request-review の置き換え

`request-review` の `executeReview()` を `queryOneShot` 経由に置き換える。boilerplate 削減 + 一貫性確保。

### 4. test 戦略

- `queryOneShot` の test (= 既存 query() を mock した integration)
- 既存 request-review test (= queryOneShot 置き換え後の振る舞い保証)

## 要件

### 1. queryOneShot 関数の実装

`src/adapter/claude-code/query-one-shot.ts` を新規作成:

- `QueryOneShotOptions` interface 定義 (= 設計判断 1 参照)
- `QueryOneShotResult` interface 定義 (= 設計判断 1 参照、`text: string` を MUST、`sessionId?` / `turnCount?` / `stopReason?` を optional)
- 関数本体実装:
  - config 解決 (= 既存 request-review と同等経路: model / maxTurns / timeoutMs の決定)
  - AbortController + timeout 設定
  - for await loop で result 取得
  - 完了判定 + result 返却 (= raw text を `text` field に集約、structured parse は caller)

### 2. config 解決経路の整理

既存 request-review の config 解決 (= maxTurns / timeout / model の決定経路) を `queryOneShot` 内部に集約する。直接の query() 呼び出し側は `QueryOneShotOptions` の値が config と異なる場合のみ override する。

### 3. request-review の置き換え

`executeReview()` を `queryOneShot` 経由に置き換える。

- 振る舞いは同等 (= 既存 test が green のまま通る)
- boilerplate (= AbortController / for await / config 解決) は削除
- review 固有 logic (= prompt 構成 / findings parse) は `executeReview()` 側に残す

### 4. queryOneShot の test

`tests/unit/adapter/claude-code/query-one-shot.test.ts` (= 新規):

- TC-OSQ-01: 正常な query() result を受け取って QueryOneShotResult を返す (= `text` field に最終 assistant text が集約される)
- TC-OSQ-02: timeout で AbortError を throw する
- TC-OSQ-03: config 解決 (= maxTurns / timeoutMs) が正しく行われる
- TC-OSQ-04: Claude Code SDK の result message に session_id が含まれる場合に `sessionId` field が result に伝播する (= `src/adapter/claude-code/` 内の SDK result から取得、managed runtime 経由の場合の挙動は本 request スコープ外、当該 adapter に同様の wrapper を追加する場合の対称配置は別 PR で対応)

### 5. spec authority への反映

delta spec として `specrunner/changes/<slug>/specs/one-shot-query/spec.md` を **新規 capability** として作成し、`## ADDED Requirements` セクションで Requirement を記述する (= finish 時に spec-merge が baseline `specrunner/specs/one-shot-query/spec.md` を新規作成する経路。baseline は本 PR で直接作成しない、`AUTHORITY_SPEC_GUARD_RULE` 準拠):

- Purpose: pipeline step 非依存の one-shot query (= request create / review / watch 等) で共通の query() 呼び出し基盤を提供する
- Requirement:
  - `QueryOneShotOptions` は systemPrompt / prompt を必須、allowedTools / maxTurns / timeoutMs を optional として持つ
  - `QueryOneShotResult` は `text: string` を必須、`sessionId?` / `turnCount?` / `stopReason?` を optional として持つ
  - `queryOneShot` 関数は config 解決 / AbortController / for await loop / 完了判定を内包する
  - request-review (= `executeReview`) は `queryOneShot` 経由で query() を呼び出す
  - 既存 `agent-runner-port` (= pipeline step lifecycle) とは別 entry point として共存する

= 既存 spec authority `agent-runner-port` への MODIFIED は **行わない** (= 対象 orthogonal)。

## スコープ外

- agent-runner.ts (= pipeline step loop 実行用) との統合 (= use case が異なるため別ライフサイクル)
- watch コマンドのリスク評価実装 (= 別 request)
- request create の generator への適用 (= 別 PR、本 request では request-review のみ置き換え)
- middleware / interceptor pattern (= 過剰抽象化、現状 use case 2 件で導入しない)

## 受け入れ基準

- [ ] `src/adapter/claude-code/query-one-shot.ts` で `queryOneShot` 関数が実装されている
- [ ] `QueryOneShotOptions` interface が定義されている (= systemPrompt / prompt MUST、allowedTools / maxTurns / timeoutMs optional)
- [ ] `QueryOneShotResult` interface が定義されている (= `text: string` MUST、sessionId / turnCount / stopReason optional)
- [ ] 既存 `request-review` の `executeReview()` が `queryOneShot` 経由に置き換えられている
- [ ] 既存 request-review test の regression なし (= 振る舞い同等)
- [ ] `tests/unit/adapter/claude-code/query-one-shot.test.ts` が追加され green
- [ ] `bun run typecheck && bun run test` が green
- [ ] delta spec `specrunner/changes/<slug>/specs/one-shot-query/spec.md` が `## ADDED Requirements` を持つ形で新規作成されている (= baseline は spec-merge 経由で finish 時に新規作成、本 PR では作らない)

## Workflow Options

- enabled: []
