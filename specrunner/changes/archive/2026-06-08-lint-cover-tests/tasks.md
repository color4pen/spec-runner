# Tasks: eslint covers tests/

## T-01: lint 対象に tests/ を含める

- [x] `package.json` の `scripts.lint` を `eslint ./src --max-warnings 0` → `eslint ./src ./tests --max-warnings 0` に変更する
- [x] `eslint.config.js` の `ignores` から `tests/**` / `**/*.test.ts` / `**/__tests__/**` の 3 globs を除去する（`dist/**` / `node_modules/**` は残す）
- [x] この時点で `bun run lint` がテストコードを走査し、違反が表面化することを確認する

**Acceptance Criteria**:
- `eslint.config.js` の `ignores` に test 用 3 globs が含まれない
- `lint` スクリプトのターゲットが `./src ./tests` である
- `bun run lint` 実行で `tests/` 配下のファイルが解析対象になる

## T-02: 表面化した違反をテストコード側で解消する

- [x] `@typescript-eslint/no-unused-vars`（63 件）: 真に未使用の import / ローカル変数は削除する。意図的に未使用な fixture 引数・変数は `_` prefix にリネームする（既存ルールの `argsIgnorePattern: "^_"` / `varsIgnorePattern: "^_"` で吸収される）
- [x] `prefer-const`（6 件）: 再代入のない `let` を `const` に変更する
- [x] `@typescript-eslint/no-non-null-asserted-optional-chain`（2 件, `tests/state/helpers.test.ts:243-244`）: `?.x!` 形を解体し、optional chain の結果を中間 const に取り出してから assert する等で回避する
- [x] `@typescript-eslint/no-explicit-any`（2 件, `tests/error-codes.test.ts:117,191`）: `as any` を `as unknown as <Type>` の型付きキャストへ置換する（既定。T-03 の override 対象とする場合を除く）
- [x] unused eslint-disable directive（1 件, `tests/unit/core/pipeline/pipeline.crash-state.test.ts:158`）: stale な `// eslint-disable-line no-throw-literal` コメントを削除する
- [x] 修正は style / 未使用シンボルの解消に限定し、テストの assertion・期待値・件数を変更しない

**Acceptance Criteria**:
- 上記 5 カテゴリの違反がすべて解消されている
- テストの挙動・件数に変更がない（assertion / `it` / `describe` の追加削除なし）

## T-03: （条件付き）tests スコープの override を追加する

- [x] 残った違反のうち、コード修正では正当なテスト記法を歪める（不自然になる）ものがある場合のみ、`eslint.config.js` に override config object を追加する
- [x] override の `files` を `["tests/**", "**/*.test.ts", "**/__tests__/**"]` に限定し、緩めるルールを最小限に絞る
- [x] 緩めた各ルールに、範囲と理由を述べる inline コメントを付す
- [x] ルールをグローバルに無効化しない。`src` に適用されるルール強度を変更しない
- [x] 全件がコード修正で解消できた場合は override を追加しない

**Acceptance Criteria**:
- override を追加した場合、`files` が test globs に限定され、緩めた各ルールに理由コメントがある
- `src` のみを対象とした lint が引き続き green（ルール強度が `src` 側で不変）
- override 不要なら config に loosening が存在しない

## T-04: ゲートを検証する

- [x] `bun run lint`（`--max-warnings 0`）が `src` + `tests` 全体で green（error 0 / warning 0）であることを確認する
- [x] `bun run typecheck` が green であることを確認する
- [x] `bun run test` が green で、テスト件数が変更前と一致する（skip / 削除なし）ことを確認する

**Acceptance Criteria**:
- `bun run lint` が exit 0
- `bun run typecheck` が exit 0
- `bun run test` が exit 0 かつ実行テスト件数に回帰がない
- request の受け入れ基準 4 項目をすべて満たす
