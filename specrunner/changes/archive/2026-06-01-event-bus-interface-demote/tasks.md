# Tasks: event-bus-interface-demote

## T-01: `src/kernel/event-bus.ts` を新設し `IEventBus` interface を定義

- [x] `src/kernel/event-bus.ts` を作成
- [x] 最小 `IEventBus` interface を定義: `on(event: string, handler: (payload: any) => void): void` の 1 メソッド
- [x] JSDoc で「shared-kernel 層の subscriber が domain の concrete EventBus に依存せず subscribe するための最小契約」であることを記述

**Acceptance Criteria**:
- `src/kernel/event-bus.ts` が `IEventBus` interface を export する
- ファイル内に他モジュールへの import が存在しない（kernel の「import ゼロ」原則）
- `bun run typecheck` が green

## T-02: `pipeline-logger.ts` の import を `IEventBus` に切替

- [x] `src/logger/pipeline-logger.ts` の `import type { EventBus } from "../core/event/event-bus.js"` を `import type { IEventBus } from "../kernel/event-bus.js"` に変更
- [x] `subscribe(events: EventBus)` のパラメータ型を `subscribe(events: IEventBus)` に変更

**Acceptance Criteria**:
- `src/logger/pipeline-logger.ts` に `core/` を import する行が存在しない（`grep "core/" src/logger/pipeline-logger.ts` が空）
- `subscribe` メソッドが `IEventBus` 型を受け取る
- `bun run typecheck` が green

## T-03: `arch-allowlist.ts` の `B3-logger` エントリを削除

- [x] `tests/unit/architecture/arch-allowlist.ts` から tracking `"B3-logger"` の 1 エントリを削除
- [x] `B3-logger` に言及するコメント行（`// B3-logger: logger/ → core/event/event-bus`）を削除
- [x] B-3 カテゴリのコメントブロック内で burn-down 完了を反映（B3-logger を DONE に追加、または行を削除）
- [x] ARCH_ALLOWLIST 配列に B-3 invariant のエントリが残っていないことを確認

**Acceptance Criteria**:
- `arch-allowlist.ts` に `B3-logger` / `B-3` の allowlist エントリが存在しない
- B-1 の allowed-edge 記録（R2-local-adapter 等）は残っている
- `bun run typecheck` が green

## T-04: T-04 suppression-demo テストを合成エントリ方式にリファクタ

- [x] `core-invariants.test.ts` の `"does not flag violations that are correctly allowlisted (B-3 allowlist suppression)"` テスト（現在 L504-519）を書き換え
- [x] テスト内にローカル定義の合成 `AllowlistEntry[]` を作成（hypothetical なファイルパス・パターン・invariant "B-3"）
- [x] 合成エントリに合致する `GrepMatch[]` を作成し、`filterViolations` に渡して結果が空であることを assert
- [x] テスト名を合成方式であることが分かる名前に更新（例: `"does not flag violations that are correctly allowlisted (B-3 suppression mechanism — synthetic entry)"`）
- [x] `expect(true).toBe(true)` のような no-op にしていないことを確認

**Acceptance Criteria**:
- suppression-demo テストが `filterViolations` の suppression 機構を検証している（合成エントリ + 合致する GrepMatch → violations が空）
- テストが `ARCH_ALLOWLIST` の実エントリ内容に依存していない
- `bun run test` の T-04 regression guard suite が green

## T-05: 全体検証

- [x] `bun run build && bun run typecheck && bun run lint && bun run test` が green
- [x] `grep -r "core/" src/logger/pipeline-logger.ts` が空であることを確認（B-3 上向き依存の解消）
- [x] `grep "B3-logger\|B-3" tests/unit/architecture/arch-allowlist.ts` に allowlist エントリが存在しないことを確認

**Acceptance Criteria**:
- 全 4 コマンドが exit code 0
- `src/logger/` が `src/core/` を import しない
- `arch-allowlist.ts` の実違反エントリがゼロ（B-1 の allowed-edge 記録のみ残存）
- T-04 suppression-demo が有効に動作している
