# Design: adapter baseBranch fallback sourced from request.md

## Context

3 つの agent runner adapter は `StepContext` 構築時に `request.baseBranch` を `"main"` でハードコードしている。

- `src/adapter/claude-code/agent-runner.ts:151`
- `src/adapter/codex/agent-runner.ts:128`
- `src/adapter/managed-agent/agent-runner.ts:542`

一方、request.md は `base-branch` フィールドを必須として持ち、`parseRequestMd`（`src/parser/request-md.ts`）が `ParsedRequest.baseBranch: string` に読み取る。pipeline 実行時、`StepExecutor`（`src/core/step/executor.ts`）は `PipelineDeps`（`StepContext` を継承し `request: ParsedRequest` を持つ）を受け取るため、実行コンテキストに `deps.request.baseBranch` が存在している。

adapter は `AgentRunContext` だけを受け取り、`PipelineDeps` 全体には触れない設計（runtime-neutral 境界）。adapter に渡る `AgentRunInput` は `requestContent` / `requestAdr?` / `dynamicContext?` / `projectContext?` のみで、`baseBranch` は含まれない。そのため adapter は `request.baseBranch` を `"main"` に固定するしかない状態になっている。

結果として `master` / `develop` 等を default branch とするプロジェクトでは、StepContext を経由する処理（dynamic context の `git log/diff baseBranch..HEAD`、各 step prompt が参照する base branch 等）が黙って `main` を向き、誤った base に対する diff/比較になる。

## Goals / Non-Goals

**Goals**:

- 3 つの adapter runner が StepContext の `request.baseBranch` を request.md の `base-branch` 値で構築する。
- adapter 境界（`AgentRunInput`）を最小拡張し、`requestAdr` と同一のパターンで値を伝搬する。
- `requestBaseBranch` が未供給（旧 state からの resume 等）の場合は `"main"` に後方互換 fallback する。

**Non-Goals**:

- request.md の `base-branch` フィールド仕様の変更（既に必須として存在）。
- CLI 層（`run` / `archive`）の baseBranch 読み取りロジックの変更（既に正しい）。
- adapter 内の他の `"main"` 参照や、PR create 時の base branch 経路（別経路で `ParsedRequest.baseBranch` から渡されている）。
- `JobState.RequestInfo` スキーマの変更。

## Decisions

### D1: `AgentRunInput` に `requestBaseBranch?: string` を追加し、`requestAdr` と同一パターンで伝搬する

`src/core/port/agent-runner.ts` の `AgentRunInput` に optional フィールド `requestBaseBranch?: string` を追加する。`StepExecutor`（`src/core/step/executor.ts`）が `ctx.input` を組み立てる箇所で `requestBaseBranch: deps.request.baseBranch` を埋める（`requestAdr: deps.request.adr` の直下）。各 adapter は StepContext 構築時に `baseBranch: ctx.input.requestBaseBranch ?? "main"` を使う。

- **Rationale**: `requestAdr` が既に「`ParsedRequest` の 1 フィールドを adapter 境界に運ぶ」確立済みの最小パターンで、これと完全に対称な構造にすることで、新しい概念・型・配線を導入しない。adapter の runtime-neutral 境界（`AgentRunContext` のみ受け取る）を壊さずに値を届けられる。optional にすることで既存 test / 旧 state との互換を維持する。
- **Alternatives considered**:
  - adapter に `PipelineDeps` 全体や `ParsedRequest` を渡す → runtime-neutral 境界を破壊し、adapter が core 型へ依存する。却下。
  - `AgentRunContext` のトップレベルに `baseBranch` を追加する → `AgentRunContext.branch`（作業ブランチ）と紛らわしく、input group（prompt に注入されるリクエスト由来情報）という意味的分類とも合わない。`requestAdr` と同じく `input` group が正しい所属。却下。
  - `JobState.RequestInfo` に `baseBranch` を持たせて adapter が state から読む → スキーマ変更・migration を誘発し、Non-Goals に反する。却下。

### D2: fallback `"main"` を後方互換として残す

`requestBaseBranch` が `undefined` の場合のみ `"main"` に fallback する（`ctx.input.requestBaseBranch ?? "main"`）。

- **Rationale**: optional フィールドであり、(a) 旧 state から resume したケース、(b) `executor.ts` 経由でない経路で adapter を直接呼ぶ既存 test、で `undefined` が渡り得る。現行のハードコード値 `"main"` を fallback に据えることで、これらの経路の振る舞いを不変に保ち regression を出さない。
- **Alternatives considered**:
  - fallback を撤廃して必須化する → 旧 state resume と既存 test が壊れ、後方互換要件に反する。却下。
  - fallback で例外を投げる → resume の正常系を破壊する。却下。

### D3: 伝搬と fallback をテストで二重に固定する

各 adapter について、(1) `requestBaseBranch: "develop"` 供給時に StepContext の `request.baseBranch` が `"develop"` になること、(2) `requestBaseBranch` 省略時に `"main"` になること、を検証する。検証は既存テストの確立済みパターン（`buildMessage` を `vi.fn()` にし、`buildMessage.mock.calls[0][1]`（= StepContext）の `request.baseBranch` を assert する）を踏襲する。

- **Rationale**: 3 adapter が独立に同じハードコードを持っていた事実から、回帰は「ある adapter だけ直し忘れる」形で起き得る。adapter 単位で伝搬と fallback の両方を固定すると、将来の同型回帰を局所で検出できる。`buildMessage` 経由の StepContext 捕捉は既存 codex test（`tests/adapter/codex/agent-runner.test.ts` の enrichContext 検証）で実証済みのため、新しいテスト機構を持ち込まない。
- **Alternatives considered**:
  - `StepExecutor` 結合レベルだけで検証する → adapter 個別の取り違えを捕捉しにくい。adapter 単位検証を主とする。却下。

## Risks / Trade-offs

- [Risk] adapter 直接呼び出しの既存 test が `requestBaseBranch` を渡さず、意図せず挙動が変わる → D2 の `?? "main"` fallback により、未供給時の振る舞いは現行と同一に保たれる。
- [Risk] 3 箇所のうち 1 箇所を直し忘れる → D3 で adapter 単位の伝搬テストを 3 つとも追加し、抜けを CI で検出する。
- [Trade-off] `AgentRunInput` に optional フィールドが 1 つ増える（境界の表面積が微増）→ `requestAdr` と同型で意味的にも整合し、認知負荷の増分は最小。

## Open Questions

なし。architect 評価済みの設計判断（`AgentRunInput.requestBaseBranch?`、`executor.ts` で `deps.request.baseBranch` を充填、adapter は `?? "main"`、`RequestInfo` 不変）に沿う。
