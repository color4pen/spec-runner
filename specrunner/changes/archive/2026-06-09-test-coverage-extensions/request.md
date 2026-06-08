# test-coverage のファイル拡張子フィルタを拡張する

## Meta

- **type**: spec-change
- **slug**: test-coverage-extensions
- **base-branch**: main
- **adr**: false

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

## 背景

`src/core/verification/test-coverage.ts` の `collectProjectTestFiles()` が `*.test.ts` / `*.spec.ts` のみをスキャンする。JavaScript プロジェクト（`*.test.js` / `*.spec.js`）や React/JSX プロジェクト（`*.test.tsx` / `*.spec.tsx`）のテストファイルが収集されず、TC ID の coverage check が 0/0 で素通りする。

## 要件

1. `collectProjectTestFiles()` のファイル拡張子フィルタに `*.test.js` / `*.spec.js` / `*.test.tsx` / `*.spec.tsx` / `*.test.jsx` / `*.spec.jsx` / `*.test.mts` / `*.spec.mts` / `*.test.mjs` / `*.spec.mjs` を追加する。
2. 拡張子リストをハードコードの配列として定義し、`collectProjectTestFiles()` が参照する形にする（config 化は不要）。

## スコープ外

- 非 JS/TS の test file 拡張子（`_test.go` / `_test.py` / `_test.rs` 等）。これらは TC ID の grep 対象としてそもそもフォーマットが異なるため、JS/TS 拡張内に留める。
- `SKIP_DIRS` の拡張（`build` / `out` / `target` 等の追加は別件）。

## 受け入れ基準

- [ ] 要件 1 に記載の全 10 拡張子（`.test.js` / `.spec.js` / `.test.tsx` / `.spec.tsx` / `.test.jsx` / `.spec.jsx` / `.test.mts` / `.spec.mts` / `.test.mjs` / `.spec.mjs`）が収集対象に含まれる
- [ ] `*.test.ts` / `*.spec.ts` が引き続き収集される（後方互換）
- [ ] 拡張子リストが定数として定義されている
- [ ] テストケースが追加されている
- [ ] `typecheck && test` が green
- [ ] `lint` が green

## architect 評価済みの設計判断

- 拡張子リストは `const TEST_FILE_EXTENSIONS = [".test.ts", ".spec.ts", ".test.js", ".spec.js", ".test.tsx", ".spec.tsx", ".test.jsx", ".spec.jsx", ".test.mts", ".spec.mts", ".test.mjs", ".spec.mjs"]` のような定数配列で持つ。`endsWith` チェックを配列の `some()` に変更する。
- config 化は不要（JS/TS エコシステム内の拡張子は実質固定。非 JS は別の仕組みが要る）。
