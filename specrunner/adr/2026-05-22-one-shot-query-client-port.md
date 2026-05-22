# OneShotQueryClient port 新設と core レイヤー境界の強制

**Date**: 2026-05-22
**Status**: accepted

## Context

`module-boundary/spec.md` は「core MUST NOT import from adapter or cli」「SDK access SHALL be mediated by port interfaces」を規定しているが、コードが 3 箇所で違反していた。

1. **core → cli**: `src/core/command/runner.ts` が `src/cli/progress.ts` の `ProgressDisplay` を直 import
2. **core → adapter**: `src/core/request/reviewer.ts` / `manager.ts` が `src/adapter/claude-code/query-one-shot.ts` の `queryOneShot` / `QueryFn` を直 import
3. **core → SDK**: `src/core/request/manager.ts` / `generator.ts` が `@anthropic-ai/claude-agent-sdk` の `query` を直 import

さらに `one-shot-query/spec.md` が「reviewer は adapter の `queryOneShot` を直 import する」と規定しており、`module-boundary` spec と正面から矛盾していた（2 つの baseline spec が自己矛盾）。

2026-05-18 の `one-shot-query-wrapper` ADR は `queryOneShot` を adapter 内の standalone 関数として配置することを決定したが、core から直接呼び出す形になっており、レイヤー境界を貫通する抽象化は行われなかった。本 ADR はその次のステップとして port interface による抽象化を記録する。

既存の `SessionClient` / `AgentRunner` port と同じ hexagonal-lite パターンを one-shot query に適用することが自然な選択だった。

## Decision

### D1: `OneShotQueryClient` interface を `core/port/` に新設する

`src/core/port/one-shot-query-client.ts` に以下の interface を定義する。

```typescript
export interface OneShotQueryClient {
  run(opts: OneShotQueryOptions): Promise<OneShotQueryResult>;
}
```

`reviewer.ts` / `manager.ts` / `generator.ts` は具象型への参照を持たず、この port に依存する。具象実装 `ClaudeCodeOneShotQueryClient` は `src/adapter/claude-code/one-shot-query-client.ts` に配置し、既存の `queryOneShot()` 関数に委譲する。

### D2: EventBus をコンストラクタ注入にし ProgressDisplay 配線を cli 層に移す

`CommandRunner.execute()` 内で `new EventBus()` + `new ProgressDisplay(events, ...)` していた。`EventBus` は core 純正なので追い出さない。違反は `ProgressDisplay`（cli 層）の import のみ。

`EventBus` を `CommandRunner` のコンストラクタ引数として受け取り（`runtime` と同じ seam）、`ProgressDisplay` の生成・subscribe は cli 層に移す。`run.ts` / `resume.ts` の両経路に重複なく適用するため、cli 層に `wireProgressDisplay(events, opts)` factory 関数を用意する。

### D3: composition point を確立し default fallback を削除する

`runReview()` は `queryFn` なしで呼ばれ、`manager.review()` 内で `queryFn ?? query`（SDK の `query` を default）にフォールバックしていた。この暗黙 fallback が境界違反の温床だった。

`executeReview()` / `executeCreate()` を composition point として確立し、`ClaudeCodeOneShotQueryClient` を生成して `runReview()` / `manager.create()` / `manager.review()` に注入する。default fallback 引数（`queryFn?: ...`, `queryFn: typeof query = query`）をすべて削除し、注入必須にする。

### D4: `one-shot-query` spec の矛盾を delta で解消する

`one-shot-query/spec.md` の「reviewer は queryOneShot を直 import する」Requirement を「reviewer / manager / generator は OneShotQueryClient port に依存する」に更新する delta spec を `specrunner/changes/core-layer-boundary-fix/specs/one-shot-query/spec.md` に配置する。`queryOneShot` 関数自体（adapter 側の実行基盤）の Requirement は residual として残す。

### D5: code-level regression test で恒久ガードする

`grep adapter/ src/core = 0` は baseline scenario で担保されるが、「cli 逆参照」「SDK 直結」は spec scenario がない。`tests/unit/architecture/module-boundary.test.ts` を追加し、これらを code-level で恒久ガードする。スコープは `core/request/` に限定し、`core/runtime/` の pre-existing 違反は別途追跡する旨をファイル冒頭に明記する。

## Alternatives Considered

### Alternative 1: 生の `QueryFn` 型をそのまま port にする

```typescript
// 不採用案
export type QueryFn = (params: SDKParams) => AsyncGenerator<SDKMessage>;
```

- **Pros**: 変更範囲が小さい。既存の `mockQueryFn`（AsyncGenerator）をテストでそのまま使える
- **Cons**: `AsyncGenerator<SDKMessage>` の形状が SDK 固有。`SDKMessage` 型を core 層が import することになり「SDK access SHALL be mediated by port」要件に再び抵触する。`core/port/` に SDK 型が漏れる
- **Why not**: port の目的は SDK を隠蔽することであり、SDK 型を露出した型を port にしても意味がない

### Alternative 2: `PrepareResult` 経由で EventBus を返す

- **Pros**: `prepare()` が EventBus を生成・返却し、runner が受け取る形。constructor injection を避けられる
- **Cons**: `prepare()` は「実行前準備」の責務のはずが「infra 配線」責務まで担うことになり SRP 違反。`PrepareResult` 型が infra 依存の型を持つことになる
- **Why not**: constructor injection の方が明示的で `runtime` 注入と同型パターンになる

### Alternative 3: default fallback を残したまま adapter import だけ除去する

- **Pros**: 変更箇所を最小化できる
- **Cons**: `core` から SDK default に暗黙フォールバックする経路が残る限り、テストで差し替え忘れが invisible になる。`spawn` / `storeFactory` で意図的に排除した「leaky default」パターンの再導入になる
- **Why not**: 境界違反の温床を残す。composition point の目的は「依存を注入された具象にのみ限定する」ことであり、default は設計意図に反する

### Alternative 4: `AgentRunner` に one-shot 呼び出しを統合する

- **Pros**: 既存 port を再利用でき、新規 interface 追加が不要
- **Cons**: `AgentRunContext`（step / state / branch / emit 等の pipeline ライフサイクル情報）が one-shot query には存在しない。one-shot 用に optional field を大量追加すると port の型安全性が劣化する。`agent-runner-port` ADR（2026-05-05）が明示的に「context shape が根本的に異なる」として分離を選択済み
- **Why not**: 既存 ADR の決定に反し、port の責務が拡散する

## Consequences

### Positive

- `grep -rE "from ['\"](\.\./)*adapter/" src/core/` の `core/request/` 配下が 0 件（baseline scenario pass）
- `core` 層が `@anthropic-ai/claude-agent-sdk` に依存しなくなり、module-boundary invariant を維持
- `OneShotQueryClient` port により、テストが AsyncGenerator mock から `{ run: vi.fn().mockResolvedValue(...) }` へシンプルに移行し可読性向上
- `one-shot-query` / `module-boundary` の 2 baseline spec 間の矛盾が解消される
- `executeReview` / `executeCreate` が明示的な composition point になり、依存グラフが追跡可能になる
- `run.ts` / `resume.ts` の両経路で ProgressDisplay が統一配線され、resume 経路の表示劣化が解消される

### Negative

- `runReview(content, config, cwd, queryFn?)` のシグネチャが `runReview(content, cwd, client: OneShotQueryClient)` に変わり、呼び出しサイト（`executeReview` / テスト）の変更が必要
- `reviewer` / `manager` / `generator` のテストが `mockQueryFn`（AsyncGenerator）から `OneShotQueryClient` mock に書き換え必須
- `ClaudeCodeOneShotQueryClient` が新ファイルとして追加され、`queryOneShot` 関数の間接参照が 1 層増える

### Known Debt

- `core/runtime/local.ts` の SDK 直 import は `module-boundary` 違反だが、spec の grep pattern が `claude-agent-sdk` を捕捉できないため scenario が pass している。本 change のスコープ外とし、別途 spec-change（package 名修正）と合わせて是正する
- `core/runtime/factory.ts` の cli/ コメント行が `grep -rn "cli/" src/core` にヒットする（import 依存ではないため実害なし）。regression test は `src/core/request/` で 0 件を確認する形に限定した

## References

- Request: `specrunner/changes/core-layer-boundary-fix/request.md`
- Design: `specrunner/changes/core-layer-boundary-fix/design.md`
- Delta spec: `specrunner/changes/core-layer-boundary-fix/specs/one-shot-query/spec.md`
- Related: `specrunner/adr/2026-05-18-one-shot-query-wrapper.md`（queryOneShot 関数の導入）
- Related: `specrunner/adr/2026-05-05-agent-runner-port-and-local-runtime.md`（AgentRunner port 確立・hexagonal-lite パターンの原型）
- Related: `specrunner/adr/2026-04-29-module-architecture-style.md`（module-boundary 原則）
- Related: `specrunner/adr/2026-05-22-job-state-store-di.md`（leaky default 排除方針）
