# Design: event-bus-interface-demote

## Context

B-3（shared-kernel / leaf は domain を import しない）の最後の実違反が 1 件残っている:

- `src/logger/pipeline-logger.ts:20` — `import type { EventBus } from "../core/event/event-bus.js"`

logger（shared-kernel）→ core/event（domain）の上向き依存。`arch-allowlist.ts` の `B3-logger` エントリで凍結中。

`EventBus` の利用箇所（本体 import、テスト除外）:

| ファイル | 層 | import 種別 | 修正要否 |
|---|---|---|---|
| `src/logger/pipeline-logger.ts` | shared-kernel | `import type { EventBus }` | **YES — B-3 違反** |
| `src/cli/progress.ts` | composition-root | `import type { EventBus }` | NO（comp-root→domain ✓） |
| `src/cli/run.ts` | composition-root | `import { EventBus }` | NO |
| `src/cli/resume.ts` | composition-root | `import { EventBus }` | NO |
| `src/core/pipeline/*.ts` | domain | 内部参照 | NO |
| `src/core/step/*.ts` | domain | 内部参照 | NO |
| `src/core/command/*.ts` | domain | 内部参照 | NO |

修正対象は `pipeline-logger.ts` の 1 箇所のみ。

先行事例: R1（ParsedRequest → parser/）、R3（step-names → kernel/）、port-types-kernel-demote（ModelUsage / BaseReportResult → kernel/）で型を kernel に降格済み。`src/kernel/` ディレクトリは R3 で作成済み。

ただし過去の事例はすべて**純粋データ型（interface / string literal）**の移動だった。EventBus は `on()` / `emit()` / `off()` メソッドを持つ**振る舞い付きクラス**であり、クラス本体を kernel に移すと kernel が `DomainEvent` / `Payload` 型（`state/schema.ts` の `JobState` に依存）を import する必要が生じ、kernel の「import ゼロ」原則を壊す。したがって、型の移動ではなく **interface の抽出**が必要。

## Goals / Non-Goals

**Goals**:

- `src/logger/pipeline-logger.ts` の `core/event` への上向き依存を解消し、B-3 の実違反をゼロにする
- `arch-allowlist.ts` の `B3-logger` エントリを削除する
- T-04 suppression-demo テストを合成エントリ方式にリファクタし、実 allowlist の中身に依存しない形にする
- EventBus の publish/subscribe 挙動は不変に保つ

**Non-Goals**:

- `EventBus` クラス本体の移動（`core/event/event-bus.ts` に留まる）
- `DomainEvent` / `EventPayloadMap` / `Payload` 型の移動
- `EventBus` の振る舞い変更（subscribe/emit の挙動は不変）
- `cli/progress.ts` の import 変更（composition-root→domain は合法）
- 他 invariant（B-7 / single-mutator）

## Decisions

### D1: `src/kernel/event-bus.ts` に最小 `IEventBus` interface を新設（ADR 対象）

**選択**: kernel に **構造的 interface**（minimal structural interface）を置き、logger はそれを import する。

```ts
// src/kernel/event-bus.ts
export interface IEventBus {
  on(event: string, handler: (payload: any) => void): void;
}
```

concrete `EventBus`（`core/event/event-bus.ts`）は TypeScript の structural typing により `IEventBus` を自動的に満たす。`implements IEventBus` の明示は不要。

**Rationale**: R1/R3/port-types-kernel-demote と同じ「kernel に型を置き、上向き依存を反転する」パターン。ただし EventBus は振る舞い付きクラスのため、クラス全体ではなく最小 interface のみを抽出する。interface は `on()` 1 メソッドのみ（logger が使うのは `on` だけ）。

**Alternatives considered**:

1. **EventBus クラスごと kernel に移動** — `DomainEvent` / `Payload` 型が `JobState`（state/）と `BaseReportResult`（kernel/）に依存する。kernel に移すと kernel → state の上向き import が発生し、kernel の「import ゼロ」原則を壊す。型を全部 kernel に降格すると kernel が肥大化し、domain の概念が kernel に漏れる。却下。

2. **typed subscribe 関数の注入**（`subscribe(on: (event: string, handler: ...) => void)`）— logger の subscribe メソッドのシグネチャ変更 + 呼び出し元で `events.on.bind(events)` のアダプテーション。interface 抽出と本質的に同じだが、呼び出し規約が複雑化し、テストの書き方も変わる。interface の方が TypeScript の慣用表現として自然。却下。

3. **`EventBus` に `implements IEventBus` を明示** — structural typing で不要。core → kernel の import を追加する意味がない（allowed だが不必要な結合）。却下。

### D2: `pipeline-logger.ts` の import を `IEventBus` に切替

```diff
- import type { EventBus } from "../core/event/event-bus.js";
+ import type { IEventBus } from "../kernel/event-bus.js";
```

`subscribe(events: EventBus)` → `subscribe(events: IEventBus)` に変更。

logger 内の `events.on(...)` 呼び出しは `IEventBus` の `on` シグネチャで型解決される。payload が `any` になるが、logger は payload フィールドをオブジェクトリテラルとして `write()` に渡すだけであり、型安全性の実質的な低下はない。

### D3: `arch-allowlist.ts` の `B3-logger` エントリを削除

tracking `"B3-logger"` の 1 エントリと関連コメントを削除。これにより B-3 category の実違反エントリがゼロになる（残るのは B-1 の allowed-edge 記録のみ）。

### D4: T-04 suppression-demo テストを合成エントリ方式にリファクタ

現在の `"does not flag violations that are correctly allowlisted (B-3 allowlist suppression)"` テスト（L504-519）は `B3-logger` エントリを前提としている。B3-logger 削除後も `filterViolations` の suppression 機構が動作することを検証するため、テスト内にローカル定義の**合成 `AllowlistEntry`** を用いる方式に書き換える。

```ts
// 合成エントリ — 実 allowlist に依存しない
const syntheticAllowlist: AllowlistEntry[] = [
  {
    file: "src/hypothetical/foo.ts",
    pattern: "core/bar.js",
    invariant: "B-3",
    tracking: "SYNTH-001",
  },
];
```

合成エントリに合致する `GrepMatch` を渡して `filterViolations` が空を返すことを assert。実 allowlist の増減に影響されない。

## Risks / Trade-offs

- [Risk] logger の `subscribe` メソッドで event 名・payload の型チェックが効かなくなる（`any` payload） → **Mitigation**: logger は passive subscriber であり、payload を `write()` に転送するだけ。event 名は string literal で記述されており、emitter 側（domain）で型チェック済み。テストファイル（`pipeline-logger.test.ts`）は B-3 対象外なので concrete `EventBus` を引き続き import して型安全にテスト可能。
- [Risk] 合成エントリ方式にすると、実 allowlist のエントリに対する suppression テストがなくなる → **Mitigation**: T-04 の目的は `filterViolations` **機構**の検証であり、実エントリの正しさは B-1〜B-3 の live grep テスト（T-02）が担保する。実 allowlist に誤りがあれば live test が fail する。

## Open Questions

なし。
