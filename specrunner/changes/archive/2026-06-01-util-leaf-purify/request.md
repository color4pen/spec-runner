# util を真の leaf にする（B-4 / R4）

## Meta

- **type**: refactoring
- **slug**: util-leaf-purify
- **base-branch**: main
- **adr**: false

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

<!-- spec 変更を伴う場合: authority path (specrunner/specs/...) を編集対象として記述しないこと。delta spec path (specrunner/changes/<slug>/specs/<capability>/spec.md) で表現する -->

## 背景

`architecture/model.md` §5（R4）が「`util` を真の leaf に」を課題化している。B-4（leaf は何も import しない）の現状違反:

- `src/util/slugify.ts:6` が `core/request/store` の `checkSlugCollision` を re-export（util→core の上向き）。
- `src/util/copy-artifacts.ts:9-13` が `prompts`/`logger`/`errors`/`templates`/`state` を import（leaf が他層に依存）。

full ratchet（PR #483）が `arch-allowlist.ts` の **R4 群**（`util/copy-artifacts.ts` 複数 ＋ `util/slugify.ts`）で凍結中。本 change はこれを解消し当該エントリを削除する。

## 要件

1. `util/slugify.ts` の `core/request/store` **re-export を除去**し、`checkSlugCollision` の caller を `core/request/store` から**直接 import** に変更する（caller には `tests/unit/util/slugify.test.ts` 等の**テストも含む** —— re-export 除去後に compile error になるため）。
2. `util/copy-artifacts.ts` は `prompts`/`logger`/`state`/`templates`/`errors` に依存しており **leaf の材料でない** → 適切な上位層（例: `core` 配下の artifact 取扱い module、または composition-root）へ**移動**する。importer を更新。
3. `tests/unit/architecture/arch-allowlist.ts` の **R4（invariant B-4）エントリを全件削除**する。

## スコープ外

- 他の burn-down（R1 / R2 / R3）と surface 分の別 edge。
- `util/` の他ファイル（slugify / copy-artifacts 以外で B-4 違反が無ければ触らない）。
- **振る舞い変更**（移動と import 経路の変更のみ）。

## 受け入れ基準

- [ ] `src/util/` が他の `src/` モジュールを一切 import しない（B-4 arch test が green）
- [ ] `arch-allowlist.ts` の R4 エントリが削除され、enforcement suite が **green**
- [ ] `slugify` / artifact コピーの公開挙動が不変
- [ ] プロジェクト標準 verification（`bun run build && bun run typecheck && bun run lint && bun run test`）が green

## architect 評価済みの設計判断

- **leaf 純化**: `util` は依存グラフの底。`slugify` の re-export は単純除去、`copy-artifacts` は本質的に leaf でない（state/prompts に依存）ので **relocate が筋**。
- **ratchet が fix の完全性を機械強制**: R4 allowlist を消すと、util に上向き import が1つでも残れば B-4 test が red。半端な fix は通らない。
- **copy-artifacts の移動先**: state/prompts/templates を扱う＝pipeline の成果物配置ロジックなので domain（core）寄り。最終配置は design で確定。
