# ADR-20260601b: EventBus 上向き依存の解消 — kernel への最小 interface 抽出

**Date**: 2026-06-01
**Status**: accepted

## Context

B-3 不変条件（shared-kernel / leaf は domain を import しない）の最後の実違反が 1 件残っていた:

- `src/logger/pipeline-logger.ts:20` — `import type { EventBus } from "../core/event/event-bus.js"`

logger（shared-kernel）→ `core/event`（domain）の上向き依存であり、`arch-allowlist.ts` の `B3-logger` エントリで凍結中だった。この 1 件を解消すると B-3 の実違反エントリがゼロになり、ratchet allowlist から「実違反」カテゴリが消える。

先行事例 R1（`ParsedRequest` → `parser/`）、R3（`step-names` → `kernel/`）、`port-types-kernel-demote`（`ModelUsage` / `BaseReportResult` → `kernel/`）はいずれも**純粋データ型（interface / string literal）**の kernel 降格だった。`EventBus` はメソッド（`on` / `emit` / `off`）を持つ**振る舞い付きクラス**であるため、クラス全体を kernel に移すと kernel → domain の上向き import が新たに発生し、kernel の「import ゼロ」原則を壊す。したがって型の単純移動ではなく **interface の抽出**という異なるアプローチが必要になった。

2 つの解決策を評価した:

1. **kernel に最小 interface を新設**（`IEventBus`）: logger は kernel の interface を import（下向き ✓）。concrete `EventBus` は structural typing で自動的に interface を満たす。
2. **typed subscribe 関数の注入**: logger は `EventBus` を import せず、caller が `events.on.bind(events)` を渡す。

## Decision

### D1: `src/kernel/event-bus.ts` に `IEventBus` interface を新設（ADR の核心）

**選択**: kernel に最小 structural interface を置き、logger はそれを import する。

```ts
// src/kernel/event-bus.ts
export interface IEventBus {
  on(event: string, handler: (payload: any) => void): void;
}
```

- interface は logger が実際に使う `on()` 1 メソッドのみ（最小契約の原則）。
- `payload: any` は意図的。event payload の具体型（`EventPayloadMap`）は domain 層（`core/event/types.ts`）で定義されており、kernel から見えてはならない。logger は payload フィールドを opaque に `write()` へ転送するだけであり、型安全性の実質的な低下はない。
- concrete `EventBus` class は TypeScript structural typing により `IEventBus` を自動的に満たす。`implements IEventBus` の明示は不要（core → kernel の不要な import を追加しない）。
- `src/kernel/event-bus.ts` は他モジュールを import しない（kernel の「import ゼロ」原則を遵守）。

### D2: `pipeline-logger.ts` の import を `IEventBus` に切替

```diff
- import type { EventBus } from "../core/event/event-bus.js";
+ import type { IEventBus } from "../kernel/event-bus.js";
```

`subscribe(events: EventBus)` → `subscribe(events: IEventBus)` に変更。

### D3: `arch-allowlist.ts` の `B3-logger` エントリを削除

B-3 category の実違反エントリがゼロになる（残存は B-1 の allowed-edge 記録のみ）。

### D4: T-04 suppression-demo テストを合成エントリ方式にリファクタ

`B3-logger` 削除後も `filterViolations` の suppression 機構が動作することを検証するため、テスト内にローカル定義の合成 `AllowlistEntry[]` を用いる方式に書き換える。実 allowlist の増減と非結合になり、allowlist が今後さらに縮んでもテストは壊れない。

## Alternatives Considered

### Alternative 1: `EventBus` クラスごと kernel に移動

- **Pros**: logger から `EventBus` を直接 import できる。型安全性を完全に維持。
- **Cons**: `DomainEvent` / `EventPayloadMap` / `Payload` 型が `JobState`（`state/`）に依存する。kernel に移すと kernel → state の上向き import が発生し、kernel の「import ゼロ」原則を壊す。全依存型を kernel に降格すると kernel が domain 概念で肥大化する。
- **Why not**: kernel の原則（import ゼロ）に根本的に抵触する。却下。

### Alternative 2: typed subscribe 関数の注入

```ts
// logger が EventBus の interface を import しない
subscribe(on: (event: string, handler: (payload: unknown) => void) => void): void
```

- **Pros**: EventBus への型依存を完全に消せる。
- **Cons**: `subscribe` メソッドのシグネチャ変更 + 呼び出し元で `events.on.bind(events)` のアダプテーションが必要。interface 抽出と本質的に同じ効果だが、TypeScript の慣用表現として不自然。テストの書き方も変わり、concrete `EventBus` を直接渡せなくなる。
- **Why not**: interface 抽出の方がシンプルで TypeScript 的に自然。却下。

### Alternative 3: `EventBus` に `implements IEventBus` を明示

- **Pros**: interface との適合を明示的に宣言できる。
- **Cons**: core → kernel の import を追加する必要がある（allowed だが不必要な結合）。structural typing で implicit に満たされるので明示する意義がない。
- **Why not**: 不必要な依存追加。却下。

## Consequences

### Positive

- B-3 実違反エントリがゼロになる。ratchet allowlist の「実違反」カテゴリが消える。
- `src/kernel/` に hexagonal な role の template が確立された: 「振る舞い付き domain object への lower-layer アクセスが必要な場合、interface のみを kernel に抽出する」。今後同様の依存解消が必要な場合に参照できる。
- `arch-allowlist.ts` が allowlist-as-debt-register として純化される（残存は B-1 の allowed-edge 記録のみ）。
- T-04 が実 allowlist の状態に非結合になり、将来の allowlist 縮小で壊れない。

### Negative

- logger の `subscribe` メソッドでイベント名・payload の型チェックが効かなくなる（`any` payload）。ただし logger は passive subscriber であり、emitter 側（domain）で型チェック済みのイベントを受け取るだけであるため、実質的なリスクは低い。
- `IEventBus` と `EventBus` の interface 乖離が起きた場合、TypeScript は compile error ではなく型不一致として報告する（`on` シグネチャの変化のみが検出対象）。ただし typecheck + test が CI で常に走るため regression はすぐ検出される。

### Known Debt

なし。

## References

- Request: `specrunner/changes/event-bus-interface-demote/request.md`
- Design: `specrunner/changes/event-bus-interface-demote/design.md`
- Implementation: `src/kernel/event-bus.ts`・`src/logger/pipeline-logger.ts`・`tests/unit/architecture/arch-allowlist.ts`
- 先行 ADR: `2026-06-01-arch-invariant-enforcement-vitest-ratchet.md`（ratchet 機構の確立）
- 先行 ADR: `2026-05-31-structure-rulings.md`（B-3 burn-down 計画）
