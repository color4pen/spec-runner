# Test Cases: npm-distributable-bin

## TC-001: ビルド成果物の生成確認

- **Category**: Build Output
- **Priority**: must
- **Source**: request.md 受け入れ基準 / tasks.md Task 4-1

**GIVEN** dist/ ディレクトリを削除したクリーンな状態で  
**WHEN** `bun run build` を実行する  
**THEN** `dist/bin/specrunner.js` が存在する

---

## TC-002: tests/ が build 対象から除外される

- **Category**: Build Output
- **Priority**: must
- **Source**: design.md ADR「tsconfig.build.json 分離」/ tasks.md Task 4-2

**GIVEN** クリーンビルドを実行した後  
**WHEN** `dist/tests/` の存在を確認する  
**THEN** `dist/tests/` ディレクトリが存在しない

---

## TC-003: dist/src/ 構造が生成される

- **Category**: Build Output
- **Priority**: should
- **Source**: design.md「rootDir: "." を維持 → dist/bin/, dist/src/ 構造を保持」

**GIVEN** クリーンビルドを実行した後  
**WHEN** `dist/src/` の内容を確認する  
**THEN** `dist/src/cli/` 等、src/ の構造が dist/src/ 配下にミラーされている

---

## TC-004: node での --help 実行

- **Category**: Node Execution
- **Priority**: must
- **Source**: request.md 受け入れ基準 / tasks.md Task 4-3

**GIVEN** `bun run build` でビルド済みの状態で  
**WHEN** `node ./dist/bin/specrunner.js --help` を実行する  
**THEN** USAGE (コマンド一覧・説明) が標準出力に表示され、exit code が 0 である

---

## TC-005: node 実行と bun 実行の USAGE 一致

- **Category**: Node Execution
- **Priority**: should
- **Source**: request.md 受け入れ基準「同じ USAGE を表示する」

**GIVEN** ビルド済みの状態で  
**WHEN** `node ./dist/bin/specrunner.js --help` と `bun ./bin/specrunner.ts --help` をそれぞれ実行する  
**THEN** 両者の出力が一致する

---

## TC-006: shebang が node を指す

- **Category**: Node Execution
- **Priority**: must
- **Source**: request.md 要件 1「shebang は #!/usr/bin/env node」/ design.md「tsc が保持する」

**GIVEN** ビルド済みの状態で  
**WHEN** `dist/bin/specrunner.js` の先頭行を確認する  
**THEN** `#!/usr/bin/env node` が先頭行に存在する

---

## TC-007: import パスの実行時解決

- **Category**: Node Execution
- **Priority**: must
- **Source**: request.md 要件 4「import path が build 後も解決すること」

**GIVEN** ビルド済みの状態で  
**WHEN** `node ./dist/bin/specrunner.js --help` を実行する  
**THEN** MODULE_NOT_FOUND エラーが発生せず、正常に起動する

---

## TC-008: 開発時 bun 実行の維持

- **Category**: Dev Workflow
- **Priority**: must
- **Source**: request.md 受け入れ基準 / tasks.md Task 4-4

**GIVEN** `bin/specrunner.ts` が存在する状態で  
**WHEN** `bun ./bin/specrunner.ts --help` を実行する  
**THEN** USAGE が表示され、exit code が 0 である

---

## TC-009: package.json bin field の変更

- **Category**: package.json
- **Priority**: must
- **Source**: request.md 受け入れ基準 / tasks.md Task 2

**GIVEN** 変更後の `package.json` を参照したとき  
**WHEN** `bin.specrunner` の値を確認する  
**THEN** 値が `"./dist/bin/specrunner.js"` である

---

## TC-010: package.json scripts.build の変更

- **Category**: package.json
- **Priority**: must
- **Source**: tasks.md Task 2、design.md 変更一覧

**GIVEN** 変更後の `package.json` を参照したとき  
**WHEN** `scripts.build` の値を確認する  
**THEN** 値が `"tsc -p tsconfig.build.json"` である

---

## TC-011: package.json scripts.start の削除

- **Category**: package.json
- **Priority**: must
- **Source**: request.md 受け入れ基準 / tasks.md Task 2

**GIVEN** 変更後の `package.json` を参照したとき  
**WHEN** `scripts.start` の有無を確認する  
**THEN** `scripts.start` キーが存在しない

---

## TC-012: tsconfig.build.json の存在

- **Category**: tsconfig.build.json
- **Priority**: must
- **Source**: tasks.md Task 1

**GIVEN** リポジトリルートを確認したとき  
**WHEN** `tsconfig.build.json` の存在を確認する  
**THEN** ファイルが存在する

---

## TC-013: tsconfig.build.json の extends 設定

- **Category**: tsconfig.build.json
- **Priority**: must
- **Source**: tasks.md Task 1

**GIVEN** `tsconfig.build.json` を参照したとき  
**WHEN** `extends` フィールドを確認する  
**THEN** `"./tsconfig.json"` を指している

---

## TC-014: tsconfig.build.json の noEmit 設定

- **Category**: tsconfig.build.json
- **Priority**: must
- **Source**: tasks.md Task 1

**GIVEN** `tsconfig.build.json` を参照したとき  
**WHEN** `compilerOptions.noEmit` を確認する  
**THEN** `false` である

---

## TC-015: tsconfig.build.json の include 範囲

- **Category**: tsconfig.build.json
- **Priority**: must
- **Source**: tasks.md Task 1、design.md「tests/ を除外」

**GIVEN** `tsconfig.build.json` を参照したとき  
**WHEN** `include` フィールドを確認する  
**THEN** `"src/**/*.ts"` と `"bin/**/*.ts"` のみ含まれ、`"tests/**"` が含まれない

---

## TC-016: tsconfig.build.json の rootDir 設定

- **Category**: tsconfig.build.json
- **Priority**: must
- **Source**: design.md「rootDir: "." を維持」

**GIVEN** `tsconfig.build.json` を参照したとき  
**WHEN** `compilerOptions.rootDir` を確認する  
**THEN** `"."` である

---

## TC-017: dist/ が .gitignore 済み

- **Category**: gitignore
- **Priority**: must
- **Source**: request.md 受け入れ基準 / 要件 3

**GIVEN** `.gitignore` を参照したとき  
**WHEN** `dist/` に対するエントリを確認する  
**THEN** `dist/` または `dist` が .gitignore に含まれている

---

## TC-018: typecheck が green

- **Category**: CI
- **Priority**: must
- **Source**: request.md 受け入れ基準 / tasks.md Task 4-5

**GIVEN** 変更適用後の状態で  
**WHEN** `bun run typecheck` を実行する  
**THEN** エラーなし (exit code 0) で完了する

---

## TC-019: test が green

- **Category**: CI
- **Priority**: must
- **Source**: request.md 受け入れ基準 / tasks.md Task 4-6

**GIVEN** 変更適用後の状態で  
**WHEN** `bun run test` を実行する  
**THEN** 全テストが pass し (exit code 0)、fail / skip が増加していない

---

## TC-020: ADR ファイルの存在

- **Category**: ADR
- **Priority**: must
- **Source**: tasks.md Task 3 / request.md 受け入れ基準

**GIVEN** リポジトリを参照したとき  
**WHEN** `docs/adr/001-tsconfig-build-separation.md` の存在を確認する  
**THEN** ファイルが存在する

---

## TC-021: ADR に tsconfig 分離の決定が記録されている

- **Category**: ADR
- **Priority**: must
- **Source**: request.md 受け入れ基準「ADR に…が記録される」

**GIVEN** `docs/adr/001-tsconfig-build-separation.md` を参照したとき  
**WHEN** 内容を確認する  
**THEN** 「tsconfig.build.json 分離 vs 既存 build script 流用」の決定と根拠が記述されている

---

## TC-022: ADR に bin 出力パスの決定が記録されている

- **Category**: ADR
- **Priority**: must
- **Source**: request.md 受け入れ基準「ADR に…が記録される」

**GIVEN** `docs/adr/001-tsconfig-build-separation.md` を参照したとき  
**WHEN** 内容を確認する  
**THEN** 「bin の出力パス決定 (dist/bin/ vs dist/)」の決定と却下案が記述されている

---

## TC-023: ビルド前に node 実行が失敗する

- **Category**: Node Execution
- **Priority**: could
- **Source**: 設計の健全性確認（dist/ 未生成状態での挙動）

**GIVEN** `dist/` ディレクトリが存在しない状態で  
**WHEN** `node ./dist/bin/specrunner.js --help` を実行する  
**THEN** exit code が非 0 で、「No such file」等のエラーが出力される

---

## TC-024: vitest.config.ts が dist/ に出力されない

- **Category**: Build Output
- **Priority**: should
- **Source**: design.md「不要な成果物: vitest.config.ts が dist/ に出力される」

**GIVEN** クリーンビルドを実行した後  
**WHEN** `dist/vitest.config.js` の存在を確認する  
**THEN** ファイルが存在しない
