# Test Cases: npm-package-setup

## TC-01: package.json — name フィールド

- **Category**: package.json metadata
- **Priority**: must
- **Source**: T-01 / 受け入れ基準

**GIVEN** package.json が編集済みである  
**WHEN** `name` フィールドを確認する  
**THEN** 値が `@color4pen/specrunner` である

---

## TC-02: package.json — private フィールド削除

- **Category**: package.json metadata
- **Priority**: must
- **Source**: T-01 / 受け入れ基準

**GIVEN** package.json が編集済みである  
**WHEN** `private` フィールドの有無を確認する  
**THEN** `private` フィールドが存在しない

---

## TC-03: package.json — publishConfig

- **Category**: package.json metadata
- **Priority**: must
- **Source**: T-01 / 受け入れ基準

**GIVEN** package.json が編集済みである  
**WHEN** `publishConfig` フィールドを確認する  
**THEN** `publishConfig.registry` が `https://npm.pkg.github.com` である

---

## TC-04: package.json — files ホワイトリスト

- **Category**: package.json metadata
- **Priority**: must
- **Source**: T-01 / 受け入れ基準

**GIVEN** package.json が編集済みである  
**WHEN** `files` フィールドを確認する  
**THEN** `dist/`, `README.md`, `LICENSE` の 3 エントリのみ含まれる

---

## TC-05: package.json — exports エントリポイント

- **Category**: package.json metadata
- **Priority**: must
- **Source**: T-01 / 受け入れ基準

**GIVEN** package.json が編集済みである  
**WHEN** `exports` フィールドを確認する  
**THEN** `exports["."]` が `./dist/bin/specrunner.js` である

---

## TC-06: package.json — engines に node を追加

- **Category**: package.json metadata
- **Priority**: must
- **Source**: T-01 / 受け入れ基準

**GIVEN** package.json が編集済みである  
**WHEN** `engines` フィールドを確認する  
**THEN** `engines.node` が `>=20` であり、`engines.bun` が `>=1.0.0` のまま維持されている

---

## TC-07: package.json — license フィールド

- **Category**: package.json metadata
- **Priority**: must
- **Source**: T-01 / 受け入れ基準

**GIVEN** package.json が編集済みである  
**WHEN** `license` フィールドを確認する  
**THEN** 値が `MIT` である

---

## TC-08: package.json — repository フィールド

- **Category**: package.json metadata
- **Priority**: must
- **Source**: T-01 / 受け入れ基準

**GIVEN** package.json が編集済みである  
**WHEN** `repository` フィールドを確認する  
**THEN** `repository.type` が `git`、`repository.url` が `https://github.com/color4pen/spec-runner` である

---

## TC-09: tsconfig.build.json — exclude に tests 追加

- **Category**: tsconfig
- **Priority**: must
- **Source**: T-02 / 受け入れ基準

**GIVEN** tsconfig.build.json が編集済みである  
**WHEN** `exclude` 配列を確認する  
**THEN** `tests` が含まれる

---

## TC-10: tsconfig.build.json — exclude に vitest.config.ts 追加

- **Category**: tsconfig
- **Priority**: must
- **Source**: T-02 / 受け入れ基準

**GIVEN** tsconfig.build.json が編集済みである  
**WHEN** `exclude` 配列を確認する  
**THEN** `vitest.config.ts` が含まれる

---

## TC-11: tsconfig.build.json — rootDir 維持

- **Category**: tsconfig
- **Priority**: must
- **Source**: T-02 / design.md D2

**GIVEN** tsconfig.build.json が編集済みである  
**WHEN** `compilerOptions.rootDir` を確認する  
**THEN** 値が `.` のまま変更されていない

---

## TC-12: ビルド後 dist に tests/ が混入しない

- **Category**: build output
- **Priority**: must
- **Source**: T-02 / T-05 / 受け入れ基準

**GIVEN** tsconfig.build.json の exclude が更新済みである  
**WHEN** `bun run build` を実行する  
**THEN** `dist/tests/` ディレクトリが存在しない

---

## TC-13: ビルド後 dist に vitest.config.js が混入しない

- **Category**: build output
- **Priority**: must
- **Source**: T-02 / T-05 / 受け入れ基準

**GIVEN** tsconfig.build.json の exclude が更新済みである  
**WHEN** `bun run build` を実行する  
**THEN** `dist/vitest.config.js` が存在しない

---

## TC-14: ビルドが成功する

- **Category**: build output
- **Priority**: must
- **Source**: T-02 / T-05 / 受け入れ基準

**GIVEN** すべてのファイル変更が適用済みである  
**WHEN** `bun run build` を実行する  
**THEN** ゼロ終了コードで完了する

---

## TC-15: LICENSE ファイルの存在

- **Category**: LICENSE
- **Priority**: must
- **Source**: T-03 / 受け入れ基準

**GIVEN** リポジトリルートの変更が適用済みである  
**WHEN** リポジトリルートの `LICENSE` ファイルを確認する  
**THEN** ファイルが存在する

---

## TC-16: LICENSE ファイルの内容が MIT

- **Category**: LICENSE
- **Priority**: must
- **Source**: T-03 / 受け入れ基準

**GIVEN** `LICENSE` ファイルが作成済みである  
**WHEN** ファイルの内容を確認する  
**THEN** `MIT License` の標準文面（"Permission is hereby granted" 等）が含まれ、著作権者が `color4pen`、年が `2025` である

---

## TC-17: publish.yml の存在

- **Category**: CI workflow
- **Priority**: must
- **Source**: T-04 / 受け入れ基準

**GIVEN** GitHub Actions ワークフローが作成済みである  
**WHEN** `.github/workflows/publish.yml` を確認する  
**THEN** ファイルが存在する

---

## TC-18: publish.yml — トリガーが v* タグ push

- **Category**: CI workflow
- **Priority**: must
- **Source**: T-04 / 受け入れ基準

**GIVEN** publish.yml が作成済みである  
**WHEN** `on` セクションを確認する  
**THEN** `push.tags` に `v*` パターンが定義されている

---

## TC-19: publish.yml — ステップの実行順序

- **Category**: CI workflow
- **Priority**: must
- **Source**: T-04 / 受け入れ基準

**GIVEN** publish.yml が作成済みである  
**WHEN** `jobs.publish.steps` の順序を確認する  
**THEN** `bun install` → `bun run build` → `bun run typecheck` → `bun run test` → `npm publish` の順で並んでいる

---

## TC-20: publish.yml — NODE_AUTH_TOKEN

- **Category**: CI workflow
- **Priority**: must
- **Source**: T-04 / 受け入れ基準

**GIVEN** publish.yml が作成済みである  
**WHEN** `npm publish` ステップの `env` を確認する  
**THEN** `NODE_AUTH_TOKEN` が `${{ secrets.GITHUB_TOKEN }}` である

---

## TC-21: publish.yml — packages: write パーミッション

- **Category**: CI workflow
- **Priority**: must
- **Source**: T-04 / design.md D4

**GIVEN** publish.yml が作成済みである  
**WHEN** `jobs.publish.permissions` を確認する  
**THEN** `packages: write` が設定されている

---

## TC-22: publish.yml — setup-node の registry-url

- **Category**: CI workflow
- **Priority**: must
- **Source**: T-04 / design.md D4

**GIVEN** publish.yml が作成済みである  
**WHEN** `actions/setup-node` ステップの `with` を確認する  
**THEN** `registry-url` が `https://npm.pkg.github.com` である

---

## TC-23: npm pack --dry-run — 期待ファイルが含まれる

- **Category**: publish artifact
- **Priority**: must
- **Source**: T-05 / 受け入れ基準

**GIVEN** すべての変更が適用済みで `bun run build` 完了後である  
**WHEN** `npm pack --dry-run` を実行する  
**THEN** 出力に `dist/`、`README.md`、`LICENSE` が含まれる

---

## TC-24: npm pack --dry-run — 不要ファイルが含まれない

- **Category**: publish artifact
- **Priority**: must
- **Source**: T-05 / 受け入れ基準

**GIVEN** すべての変更が適用済みで `bun run build` 完了後である  
**WHEN** `npm pack --dry-run` を実行する  
**THEN** 出力に `tests/`、`src/`、`vitest.config.*`、`tsconfig.*` が含まれない

---

## TC-25: typecheck が green

- **Category**: quality gate
- **Priority**: must
- **Source**: T-05 / 受け入れ基準

**GIVEN** すべての変更が適用済みである  
**WHEN** `bun run typecheck` を実行する  
**THEN** ゼロ終了コードで完了する

---

## TC-26: test が green

- **Category**: quality gate
- **Priority**: must
- **Source**: T-05 / 受け入れ基準

**GIVEN** すべての変更が適用済みである  
**WHEN** `bun run test` を実行する  
**THEN** ゼロ終了コードで完了し、失敗テストがゼロである

---

## TC-27: publish.yml — --frozen-lockfile による lockfile 整合性

- **Category**: CI workflow
- **Priority**: should
- **Source**: T-04 / design.md D4

**GIVEN** publish.yml が作成済みである  
**WHEN** `bun install` ステップのコマンドを確認する  
**THEN** `--frozen-lockfile` オプションが付与されている

---

## TC-28: publish.yml — setup-bun のセットアップ

- **Category**: CI workflow
- **Priority**: should
- **Source**: T-04 / design.md D4

**GIVEN** publish.yml が作成済みである  
**WHEN** steps を確認する  
**THEN** `oven-sh/setup-bun` ステップが `bun install` より前に存在する

---

## TC-29: package.json — bun install の lockfile 整合性

- **Category**: package.json metadata
- **Priority**: should
- **Source**: T-01

**GIVEN** package.json の name と publishConfig が変更済みである  
**WHEN** `bun install` を実行する  
**THEN** ゼロ終了コードで完了し、lockfile の整合性エラーが出ない

---

## TC-30: publish.yml — npmjs.com には publish しない

- **Category**: CI workflow
- **Priority**: could
- **Source**: request.md スコープ外

**GIVEN** publish.yml が作成済みである  
**WHEN** workflow の registry 設定を確認する  
**THEN** `registry.npmjs.org` へのアクセスや `--registry` オプションが含まれず、GitHub Packages のみが対象である
