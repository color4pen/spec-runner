# context/ の dead orphan（request-patterns）を除去する

## Meta

- **type**: refactoring
- **slug**: remove-context-orphan
- **base-branch**: main
- **adr**: false

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

<!-- spec 変更を伴う場合: authority path (specrunner/specs/...) を編集対象として記述しないこと。delta spec path (specrunner/changes/<slug>/specs/<capability>/spec.md) で表現する -->

## 背景

2026-05-31 のアーキテクチャ網羅性監査で、`src/context/` が `architecture/model.md` §2 層 mapping 表・§3 closure 行列の**双方から漏れた唯一の `src/*` dir** であることが判明した。中身は `request-patterns.ts` 1 ファイルのみで、**production importer は 0 件**（参照は `tests/unit/context/request-patterns.test.ts` のみ）= dead orphan。

このファイルは #124 で few-shot context 注入のために追加され、archive design.md（`2026-05-08-request-command-redesign/design.md:108`）が「将来のコンテキスト注入で再利用する可能性を考慮し意図的に残す。dead code 警告は許容」と **retain を決定**している。本 change はその retain 決定を以下の根拠で覆す:

- 本来の consumer（create REPL）は #137 で**意図的に廃止済み**。
- 後継の `request-generate`（`src/core/request/generator.ts` + `src/prompts/request-generate-system.ts`）は **`collectRequestPatterns` / few-shot を採用しない設計で確定**しており、別経路を選んでいる。配線先は空いたまま放置されている状態であり、archive few-shot を復活させる意図は無い。

層 ledger に dead orphan を 1 行足して固定するより、源で除去する方が「層表にあるものは実在し使われている」という契約を保ち、minimal-ceremony に整合する。

## 要件

1. `src/context/` を dir ごと削除する（`request-patterns.ts`）。
2. `tests/unit/context/request-patterns.test.ts` を削除する。
3. `collectRequestPatterns` / `RequestPattern` / `request-patterns` を参照する production code が削除後に存在しないことを確認する（現状 0 件）。

## スコープ外

- `architecture/model.md` §2 層表・§3 closure 行列への `context/` 追記（= 除去するため不要。これは out-of-loop 文書で別 channel）。
- `request-generate` の挙動変更・few-shot 機能の再実装。
- 歯（arch test）の core 全体拡張（= E1。本 change は orphan 除去に集中）。

## 受け入れ基準

- [ ] `src/context/` と `tests/unit/context/` が削除されている
- [ ] `collectRequestPatterns` / `RequestPattern` を参照する production code が無い（grep で確認）
- [ ] プロジェクト標準 verification（`bun run build && bun run typecheck && bun run lint && bun run test`）が green

## architect 評価済みの設計判断

- **dead orphan は層 ledger に載せず除去する**: アーキ監査が「未使用 module が層台帳をすり抜けた」構造シグナルとして検出。表に固定すると「表にあるものは実在し使われている」契約が崩れる。後継 `request-generate` が別経路で確定済みゆえ、archive few-shot 復活の前提自体が消えている。
- **E1（歯の core 全体／src 全体拡張）の gate を 1 つ畳む**: 先に除去すれば、E1 が `context/` の層分類を判断する必要が消える（`context/` は `src/core` 外のため現行 §5 の core 全体拡張では blocking ではないが、src 全体へ広げる際の死角を先に潰す）。
