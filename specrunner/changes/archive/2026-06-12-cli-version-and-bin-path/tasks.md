# Tasks: 公開 CLI の体裁 — `--version` と bin パス正規化

## T-01: version 解決 helper の追加

- [x] `src/cli/version.ts` を新設する。開始ディレクトリを受け取り、先祖方向へ最寄りの
      package.json まで遡って parse し、その `version`（string）を返す純関数を実装する。
- [x] package.json が見つからない / `version` が string でない場合は明確なエラーを throw する。
- [x] import.meta.url（`fileURLToPath` + `dirname`）から開始ディレクトリを算出し、上記純関数で
      version を返す薄い wrapper を併設する。

**Acceptance Criteria**:
- 与えた開始ディレクトリから最寄り先祖 package.json の `version` を返す。
- 先祖に package.json が無いとき throw する。
- 外部依存を追加しない（node 標準の fs / path / url のみ）。

## T-02: `specrunner --version` を CLI entrypoint に配線

- [x] `bin/specrunner.ts` の main() に、command === `"--version"` の top-level intercept を
      追加する。既存の `--help` / `-h` ブロックと同じ位置（空 command チェックと registry lookup の前）
      に置く。
- [x] T-01 の wrapper で解決した version を `"<version>\n"` として stdout に書き、exit 0 する。

**Acceptance Criteria**:
- `specrunner --version` が package version + 改行を stdout に出力し exit 0 する。
- registry dispatch は発生しない。
- `--help` / USAGE の文言・構成は変更しない。

## T-03: package.json の bin パス正規化

- [x] `bin.specrunner` を `"./dist/specrunner.js"` から `"dist/specrunner.js"` に変更する。
- [x] `exports`（`./dist/specrunner.js`）は変更しない。

**Acceptance Criteria**:
- `package.json` の `bin.specrunner` === `"dist/specrunner.js"`。
- `exports["."]` は変更されていない。

## T-04: テスト

- [x] `src/cli/version.ts` のユニットテスト: temp ディレクトリで両実行レイアウトをシミュレートする。
      (a) package.json の 1 階層下にある `dist/` 風の開始ディレクトリ（バンドル）、
      (b) package.json の 2 階層下にある `src/cli/` 風の開始ディレクトリ（ソース）。
      両者が同じ seed version を解決することを assert する。package.json が無い場合は throw を assert する。
- [x] `bin/specrunner.ts` main() 経由の統合テスト（既存 `runMain` helper パターン）:
      `--version` で stdout に実際の package.json version が含まれ exit(0) になることを assert する。
      「package.json version と一致」を固定するため、テスト内で実 package.json から version を読んで比較する。
- [x] 退行テスト: 未知 command（例 `foobar`）が従来どおり stderr に `Unknown command:` を出して
      exit 2 することを assert し、intercept 追加で未知 command 経路が変わっていないことを固定する。

**Acceptance Criteria**:
- 上記 3 テストが green。
- `bun run typecheck && bun run test` が green。

## 受け入れ基準（request 由来）の対応

- [x] `--version` が package.json version と一致する文字列を出力し exit 0 → T-02 / T-04 統合テスト
- [x] 未知 command の従来挙動（exit 2）が退行しない → T-04 退行テスト
- [x] `package.json` の bin 値が `dist/specrunner.js`（`./` なし） → T-03
- [x] `typecheck && test` が green → T-04
