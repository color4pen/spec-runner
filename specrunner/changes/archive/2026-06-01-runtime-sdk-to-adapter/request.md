# core/runtime の生 SDK import を adapter へ追い出す（B-2 / R2）

## Meta

- **type**: refactoring
- **slug**: runtime-sdk-to-adapter
- **base-branch**: main
- **adr**: true

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

<!-- spec 変更を伴う場合: authority path (specrunner/specs/...) を編集対象として記述しないこと。delta spec path (specrunner/changes/<slug>/specs/<capability>/spec.md) で表現する -->

## 背景

`architecture/model.md` §5（R2）と B-2（external SDK 型は adapters の外＝domain/ports/comp-root に漏らさない）の現状違反:

- `src/core/runtime/local.ts:17` が `@anthropic-ai/claude-agent-sdk` の生 `query` を直 import（`import { query as sdkQuery } from "@anthropic-ai/claude-agent-sdk"`）。

`core/runtime` は composition-root（structure-rulings D2）だが、**生 SDK 型を持たない**ことは D2 で明示維持。full ratchet（PR #483）が `arch-allowlist.ts` の **R2（B-2）エントリ**で凍結中。本 change はこれを解消し当該エントリを削除する。

## 要件

1. `local.ts` の生 SDK `query` import を **adapter 層へ追い出す**（`adapter/claude-code/` の既存 seam を使うか、`query` をラップする adapter を切る）。`core/runtime` は port / seam 経由で agent 実行を呼ぶ構成にする。**`local.ts` の `queryFn` 注入口はテスト用 seam として残す** —— 生 SDK の default 値（`sdkQuery`）だけを adapter 側へ移し、注入インターフェースは維持する。
2. SDK 型が `core/runtime`（および domain / ports）に漏れないことを保つ（B-2）。RuntimeStrategy の `query`（将来 dialog 用）が adapter 実装に delegate する形に。
3. `tests/unit/architecture/arch-allowlist.ts` の **R2（invariant B-2）エントリを削除**する。

## スコープ外

- 他の burn-down（R1 / R3 / R4）と surface 分。
- managed runtime 側（既に adapter 経由なら変更不要）。
- **振る舞い変更**（local runtime の agent 実行挙動は不変。SDK 呼び出しの経路だけ adapter 越しにする）。

## 受け入れ基準

- [ ] `src/core/`（runtime 含む）に `@anthropic-ai/*` の直 import が無い（B-2 arch test が green）
- [ ] `arch-allowlist.ts` の R2 エントリが削除され、enforcement suite が **green**
- [ ] local / managed runtime の agent 実行挙動が不変
- [ ] プロジェクト標準 verification（`bun run build && bun run typecheck && bun run lint && bun run test`）が green

## architect 評価済みの設計判断

- **B-2 封じ込めを完成**: SDK breaking change の影響を adapters に閉じる。runtime=comp-root でも生 SDK を持たないのが D2 の確定事項。
- **adapter seam を切る（adr:true）**: `query` のラップを既存 `adapter/claude-code` に寄せるか新規 seam にするかは設計選択 → ADR に残す。
- **ratchet が fix の完全性を機械強制**: R2 allowlist を消すと core に SDK import が残れば B-2 test が red。
