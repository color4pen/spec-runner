# プロジェクトのテスト配置規約を config で宣言し、生成テストの配置を決定的にする

## Meta

- **type**: new-feature
- **slug**: test-placement-convention
- **base-branch**: main
- **adr**: false

## 背景

specrunner を他プロジェクト（例: pnpm monorepo の gamesmith）で使うと、implementer が生成するテストファイルがリポジトリルート直下の `tests/<slug>/` に置かれ、ホストプロジェクトの vitest include パターンに一致せず、どの test runner からも実行されない「死んだテストファイル」になる（issue #565 の実例）。テストは生成されるが一度も走らないため、失敗が無音で、毎回の run で同じ場所に再発する。

## 現状コードの前提

- テスト配置のハードコードはコード側に存在しない。`src/core/verification/test-coverage.ts:5-8` は TC ID を「プロジェクト全域の `*.test.*` / `*.spec.*` から探す」配置非依存の設計で、CLI はどこに置かれても検出できる。
- 配置を指示する prompt も存在しない。`src/prompts/test-case-gen-system.ts:133` は「must TC ごとにテストファイルを作る」とだけ述べ、`src/prompts/implementer-system.ts` にも配置規約の注入点がない。
- したがって配置は implementer LLM の自由判断であり、LLM の既定の癖（`tests/<slug>/`）がホストプロジェクトの規約と食い違うのが根本原因。issue #565 本文の「ハードコードが原因」という記述は実コードと不一致（grep 済み）。
- プロジェクト固有規律の注入機構としては `specrunner/changes/<slug>/rules.md`（`src/prompts/rules.ts`、run 開始時にコピー）と per-step rules（`src/core/step/rules-resolve.ts`）が存在する。

## 要件

1. プロジェクト設定にテスト配置規約を宣言できる項目を追加する（例: `tests.placement` — 「対象ファイルと同階層に `*.test.ts`」「`tests/` 配下にミラー構造」等を表現できる形式。形式の確定は design に委ねるが、自由 prose ではなく実装側でテンプレート展開できる構造を優先する）。
2. 宣言された配置規約を implementer の prompt context に決定的に注入する（agent の自由判断を config 由来の指示に置き換える）。test-case-gen には TC 段階で配置に言及させない（配置はコード化時の関心事）。
3. 未設定時は現挙動（agent 判断）を維持し、既存プロジェクトの run 結果を変えない。
4. config schema 検証に新項目を組み込み、不正値は load 時に弾く（既存 `src/config/schema.ts` の検証パターンに従う）。

## スコープ外

- vitest / jest 等の設定ファイルを読んで include パターンを自動推定すること（設定ファイルの評価は実行系依存で fragile、minimal-deps 方針に反する）
- テスト生成を「scenario のみ生成しコード化をプロジェクトに委ねる」方向へ切り替えること（issue #565 検討事項の第 3 案、別 issue で議論）
- test-coverage 検証ロジックの変更（既に配置非依存のため不要）

## 受け入れ基準

- [ ] `tests.placement`（名称は design 確定）を設定したプロジェクトで、implementer への system / user message に配置規約の指示が含まれることをテストで固定する
- [ ] 未設定プロジェクトで prompt 内容が現状と不変であることをテストで固定する
- [ ] 不正な設定値が config load 時に検証エラーになることをテストで固定する
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **採用**: config 宣言 + prompt への決定的注入。「format / path は tool / CLI が決める、agent は semantic content のみ」（rules.md 思想原則）に従い、agent の判断点を消す。
- **却下: vitest config の自動読取** — vitest.config.ts の評価は TS 実行環境とバンドラ依存を持ち込み、依存極小方針と衝突する。推定の誤りは無音で再発する。
- **却下: per-step rules（specrunner/rules/）での運用回避** — 機構としては書けるが、out-of-the-box では誰も書かないため無音の死亡が既定挙動のまま残る。第一級の config にして init / docs で見えるようにする。
