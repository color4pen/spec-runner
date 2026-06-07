# Tasks: `specrunner request review` に `--model` フラグを追加する

## T-01: queryOneShot に `modelOverride` を追加し解決チェーン通過後に適用する

- [x] `src/core/port/one-shot-query-client.ts` の `OneShotQueryOptions` interface に
      `modelOverride?: string` を追加する（JSDoc: 「指定時、config 解決チェーンの結果より優先して
      使うモデル。未指定時は解決チェーンの結果を使う」）。
- [x] `src/adapter/claude-code/query-one-shot.ts` の `QueryOneShotOptions` interface に
      同じ `modelOverride?: string` を追加する（port と同一セマンティクス）。
- [x] `queryOneShot()` 内（`getStepExecutionConfig` で `resolvedConfig` を算出した直後、
      SDK query options を組み立てる前）で `const effectiveModel = opts.modelOverride ?? resolvedConfig.model;`
      を導出する。
- [x] SDK query options の `model` に `resolvedConfig.model` ではなく `effectiveModel` を渡す
      （`query-one-shot.ts:123` の `model: resolvedConfig.model` を置換）。
- [x] `getStepExecutionConfig` および `src/config/step-config.ts` には一切変更を加えない（スコープ外）。

**Acceptance Criteria**:
- `modelOverride` 指定時、SDK query options の `model` が `modelOverride` の値になる
  （config に request-review.model があってもそれより優先される）。
- `modelOverride` 未指定（`undefined`）時、SDK query options の `model` は従来どおり
  `resolvedConfig.model` になる。
- `src/config/step-config.ts` に diff が無い。
- `bun run typecheck` が green。

## T-02: runReview / executeReview に `modelOverride` を透過する

- [x] `src/core/request/reviewer.ts` の `runReview` に第 4 引数 `modelOverride?: string` を追加し、
      `client.run({ ... })` の options に `modelOverride` を渡す。
- [x] `runReview` 内の `model: "claude-opus-4-5"`（stepDefaults）は変更しない（D3）。
- [x] `src/core/command/request-review.ts` の `executeReview` の `opts` 引数型に `model?: string` を追加し
      （`opts: { json: boolean; model?: string }`）、`runReview(content, process.cwd(), client, opts.model)`
      の形で透過する。
- [x] 透過のみ行い、値の加工・分岐・検証は加えない。

**Acceptance Criteria**:
- `executeReview` に `model` を渡すと `runReview` を経由して `client.run` の options の
  `modelOverride` に届く。
- `executeReview` の `opts.model` 未指定時、`client.run` には `modelOverride: undefined` が渡る
  （= 既存挙動を維持）。
- `runReview` の `model: "claude-opus-4-5"` stepDefaults が不変。
- `bun run typecheck` が green。

## T-03: CLI `request review` に `--model` フラグを配線する

- [x] `src/cli/command-registry.ts` の `request.subcommands.review.flags` に
      `model: { type: "string" }` を追加する（enum 制約なし）。
- [x] handler で `--model` の値を取得し、空文字 / 空白のみは未指定に正規化する（D4）:
      `const modelFlag = parsed.flags["model"]; const model = typeof modelFlag === "string" && modelFlag.trim() !== "" ? modelFlag : undefined;`
- [x] `executeReview(filePath, { json: !!parsed.flags["json"], model }, client, resolvedSlug)` の形で
      正規化済みの `model` を opts に渡す。
- [x] `src/cli/command-registry.ts` の `USAGE` 文字列の `request review` 行に `--model` の言及を追記する
      （例: `request review <slug|file>   architect agent によるレビュー（--model でモデル上書き可）`）。

**Acceptance Criteria**:
- `specrunner request review --model <name> <slug>` / `--model=<name>` のいずれの記法でも
  `Unknown flag` にならない。
- `--model claude-opus-4-8[1m]` のような `[`/`]` を含む値が string フラグとして正しく取得される。
- `--model ""`（空文字）は未指定として扱われ、`executeReview` の `opts.model` が `undefined` になる。
- `--model` 未指定時、`executeReview` の `opts.model` が `undefined` になる。
- `bun run typecheck` が green。

## T-04: テストを追加・更新する

- [x] `tests/unit/adapter/claude-code/query-one-shot.test.ts` に modelOverride のケースを追加する
      （既存 TC-OSQ-01〜06 は維持）。
  - [x] `modelOverride` 指定 + config に `steps["request-review"].model` あり →
        SDK query options の `model` が `modelOverride` の値になる（config より優先）ことを
        captured options で assert する。
  - [x] `modelOverride` 未指定 + config に `steps["request-review"].model` あり →
        SDK query options の `model` が config の値（resolvedConfig.model）になることを assert する。
  - [x] config も modelOverride も無い → SDK query options の `model` が stepDefaults（`opts.model`）に
        フォールバックすることを assert する。
- [x] `tests/unit/core/request/reviewer.test.ts` の `runReview` テスト（TC-RVR-011 系）に
      modelOverride 透過の検証を追加する。
  - [x] `runReview(content, cwd, mockClient, "claude-opus-4-8[1m]")` 呼び出し時、
        `mockClient.run` が `modelOverride: "claude-opus-4-8[1m]"` を含む options で呼ばれることを assert。
  - [x] `modelOverride` 引数なしで `runReview` を呼ぶと `mockClient.run` の options の
        `modelOverride` が `undefined` であることを assert。
- [x] CLI レベルで `request review --model` の配線を検証するテストを追加する
      （`parseFlags` + normalizeModel ヘルパーを直接テストする方式。Vitest forks pool + Vite ESM では
      `vi.mock()` が `command-registry.ts` の静的 import を intercept できないため）。
  - [x] `--model claude-opus-4-8[1m]` が `parseFlags` で正しく取得される（TC-RVW-MDL-001）。
  - [x] `--model` なしで `parseFlags` が `undefined` を返す（TC-RVW-MDL-002）。
  - [x] `--model ""`（空文字）・空白のみは `normalizeModel` で `undefined` に正規化される（TC-RVW-MDL-003）。
  - [x] `--model` フラグが `FlagParseError` を出さず、フラグ定義に `{ type: "string" }` がある（TC-RVW-MDL-004）。
- [x] すべて決定的・LLM 不要（mock query fn / mock client / parseFlags 直接テスト）。

**Acceptance Criteria**:
- 「config あり + modelOverride で上書き」「config あり + modelOverride 未指定で config 採用」
  「config なしで stepDefaults フォールバック」の 3 ケースが queryOneShot レベルで検証されている。
- `runReview` の modelOverride 透過（指定あり / なし）が検証されている。
- CLI の `--model` 受理・透過・空値正規化が検証されている。
- `bun run test` が green。

## T-05: 受け入れ基準と不変条件を確認し検証ゲートを通す

- [x] `specrunner request review --model claude-opus-4-8[1m] <slug>` 経路で `modelOverride` が
      SDK query options の `model` まで届くことを（T-04 のテストで）担保する。
- [x] `--model` 未指定時に config 解決チェーンで決まるモデルが使われる（回帰なし）ことを確認する。
- [x] `src/config/step-config.ts`（解決チェーン本体）に変更が無いことを確認する。
- [x] `runReview` の stepDefaults `claude-opus-4-5` が不変であることを確認する。
- [x] `bun run typecheck && bun run test` を実行する。

**Acceptance Criteria**:
- `bun run typecheck && bun run test` が green。
- 解決チェーン本体（`getStepExecutionConfig` / `step-config.ts`）と stepDefaults が baseline から不変。
- `--model` 指定時は最優先、未指定時は既存挙動という両方の受け入れ基準が満たされている。
