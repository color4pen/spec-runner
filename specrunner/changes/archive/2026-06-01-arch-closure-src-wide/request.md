# §3 DSM closure を src 全体に compile し、未スキャン層（adapter/ kernel/）を歯にする

## Meta

- **type**: refactoring
- **slug**: arch-closure-src-wide
- **base-branch**: main
- **adr**: true

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

## 背景

現状の arch test（`tests/unit/architecture/core-invariants.test.ts`）は **invariant 別 grep** で、スキャン対象が core/ に偏る:

- B-1 / B-2 / B-6 / B-8: `src/core` のみ
- B-3: 列挙した shared-kernel dir（parser/config/state/git/prompts/logger/templates）+ store
- B-4: `src/util` のみ
- B-7: `src/core` + `src/cli`

→ **`adapter/` は一切スキャンされず**、`event-bus-interface-demote`（#491）で新設した **`src/kernel/`（「import ゼロ」原則）にも歯が無い**。

一方 `architecture/model.md` §3 の **DSM matrix（55–62 行）は全層（comp-root / domain / ports / adapters / persist / kernel / leaf / ext-SDK）の許可 edge を完備**している。その大半が test に compile されていない。model.md §6（113 行）はこれを **「目標の歯」（§3 の表と §4 を arch test の core 全体拡張に compile）**と明記している。

本 change は **§3 DSM を src 全体の closure 検査に拡張**する。新ルールの発明ではなく、既に在る §3 を test 化する作業。

## 要件

1. §3 DSM matrix（`architecture/model.md` §3）を基準に、「**許可 edge 以外の import は divergence**」とする closure 検査を `core-invariants.test.ts` に **追加**する（新規 `describe` として足す。**既存 B-1〜B-9 invariant 別 test は無改変で維持**）。
2. 最低限カバーする未スキャン層:
   - **`adapter/`**: §3 行「adapters → comp-root ✗ / domain ✗ / persist ✗」を検出（adapters が許可されるのは ports / shared-kernel / leaf / ext-SDK のみ）。
   - **`src/kernel/`**: import ゼロ（leaf 相当）を検出。
     - ※ 注意: §3 の "kernel" **列**は shared-kernel（config/state/git/parser/prompts/logger/templates/errors）を指し、`event-bus-interface-demote`（#491）で新設した**物理ディレクトリ `src/kernel/` とは別概念**。`src/kernel/` は `model.md` §2/§3 に未分類の新層で、その file 自身が「import ゼロ」原則を宣言している。本 change では `src/kernel/` を **leaf 相当（import ゼロ）として扱う**。`src/kernel/` を `model.md` §2 の層表に正式分類するのは authority doc の人間 gate 作業（本 change のスコープ外）。
   - 可能なら src/ 全層の import edge を §3 whitelist と突合し、未知 edge を divergence とする。
3. 現状の divergence を **grep authoritative に全件 scan** し `arch-allowlist.ts` に grandfather（実装者が scan で確定。私の列挙に依存しない）。各エントリに file + invariant 名 + tracking + comment。
4. ratchet 規約を継承: allowlist は**削除のみ**、**§3 whitelist に無い新規 edge を足すと red**（regression guard を実テストで実証）。

## スコープ外

- 既存 B-1〜B-9 invariant 別 test の**書き換え・統合**。本 change は既存 test を一切改変せず**新規 `describe` の追加のみ**とする（B-9 test 等の既存領域に触れないことで、他の並行 change が走る場合の 3-way merge 衝突リスクを下げる）。
- `architecture/model.md`（§3 / §4 / §5）本体の編集（authority doc は人間 gate。本 change は test 側のみ）。
- **divergence の修正そのもの**（歯を立てて現状を凍結するまで。解消は後続 burn-down）。
- 振る舞い変更。

## 受け入れ基準

- [ ] `adapter/` と `src/kernel/` を含む src 全体の closure 検査が存在し、現状 divergence を allowlist で凍結して suite が green
- [ ] §3 whitelist に無い新規 edge を足すと suite が red（regression guard を実テストで実証）
- [ ] divergence が **grep authoritative に全件列挙**されている（実装者が scan で確定）
- [ ] 既存 B-1〜B-9 test が**無改変で green のまま**
- [ ] プロジェクト標準 verification（`bun run build && bun run typecheck && bun run lint && bun run test`）が green

## architect 評価済みの設計判断

- **model.md §6（113 行）の「目標の歯」を実装**: §3 の DSM 完備表を test に compile し、core 偏重スキャンを src 全体に広げる。§3 が既に全層の許可 edge を定義済みなので、本 change は新ルールを発明せず enforcement を追従させるだけ。
- **追加のみ scope（並行非干渉）**: 本 change は既存 B-1〜B-9 test を書き換えず新規 `describe` を足すだけにする。既存領域に触れないことで、他の change が同じ ratchet ファイルを並行編集しても 3-way merge を衝突最小化できる（event-bus 先例: 別領域なら clean merge）。
- **adr: true**: 「edge whitelist 突合」という、既存の invariant 別 grep とは異なる新しい closure 検査機構を導入する構造的設計判断のため。
