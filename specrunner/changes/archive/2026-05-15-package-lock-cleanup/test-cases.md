# Test Cases: package-lock-cleanup

## TC-01: package-lock.json が git から削除されている

- **Category**: Lockfile Cleanup
- **Priority**: must
- **Source**: Task 1 / 受け入れ基準

**GIVEN** PR のブランチがチェックアウトされている  
**WHEN** `git ls-files package-lock.json` を実行する  
**THEN** 出力が空（exit 0、標準出力なし）であること

---

## TC-02: package-lock.json がワーキングツリーに残っていない

- **Category**: Lockfile Cleanup
- **Priority**: must
- **Source**: Task 1

**GIVEN** PR のブランチがチェックアウトされている  
**WHEN** `ls package-lock.json` を実行する  
**THEN** ファイルが存在しない（exit 非 0）こと

---

## TC-03: bun.lock が引き続き tracked されている

- **Category**: Lockfile Cleanup
- **Priority**: must
- **Source**: 設計判断「bun.lock を単一の真偽源とする」

**GIVEN** PR のブランチがチェックアウトされている  
**WHEN** `git ls-files bun.lock` を実行する  
**THEN** `bun.lock` が出力されること（tracked 状態が維持されていること）

---

## TC-04: .gitignore に package-lock.json が追加されている

- **Category**: .gitignore Protection
- **Priority**: must
- **Source**: Task 2 / 受け入れ基準

**GIVEN** PR のブランチがチェックアウトされている  
**WHEN** `grep package-lock.json .gitignore` を実行する  
**THEN** マッチ行が 1 行以上出力されること

---

## TC-05: npm install 後に package-lock.json が git status に出ない

- **Category**: .gitignore Protection
- **Priority**: must
- **Source**: Task 2 / 要件 3「npm install を誤って実行しても tracked にならないように」

**GIVEN** PR のブランチがチェックアウトされたクリーンな状態  
**WHEN** `npm install` を実行し、その後 `git status --porcelain` を確認する  
**THEN** `package-lock.json` が untracked ファイルとして表示されないこと（.gitignore により抑制）

---

## TC-06: .gitignore に yarn.lock が追加されている

- **Category**: .gitignore Protection
- **Priority**: should
- **Source**: Task 2 / design.md「yarn.lock は pnpm-lock.yaml と同列で追加」

**GIVEN** PR のブランチがチェックアウトされている  
**WHEN** `grep yarn.lock .gitignore` を実行する  
**THEN** マッチ行が 1 行以上出力されること

---

## TC-07: .gitignore のコメントが意図を説明している

- **Category**: .gitignore Protection
- **Priority**: should
- **Source**: Task 2 / tasks.md コメント指示

**GIVEN** `.gitignore` を確認する  
**WHEN** `package-lock.json` エントリの前後を読む  
**THEN** `# npm (not used — bun.lock is the single lockfile)` などのコメントが存在し、既存の `pnpm` セクションと同じスタイルでグルーピングされていること

---

## TC-08: package.json に engines.bun が追加されている

- **Category**: package.json Engines
- **Priority**: must
- **Source**: Task 3 / 受け入れ基準

**GIVEN** PR のブランチがチェックアウトされている  
**WHEN** `package.json` の `engines` フィールドを確認する  
**THEN** `"bun": ">=1.0.0"` が存在すること

---

## TC-09: package.json の engines に npm 関連フィールドが含まれない

- **Category**: package.json Engines
- **Priority**: should
- **Source**: 要件 8「engines.npm 等の npm 関連 field が残っていれば削除する」

**GIVEN** PR のブランチがチェックアウトされている  
**WHEN** `package.json` の `engines` フィールドを確認する  
**THEN** `npm` や `node` の制約フィールドが存在しないこと

---

## TC-10: bun install が正常終了する

- **Category**: Dependency Installation
- **Priority**: must
- **Source**: 受け入れ基準「bun install で依存が再現可能」

**GIVEN** PR のブランチがチェックアウトされ、`node_modules` が削除されている  
**WHEN** `bun install` を実行する  
**THEN** exit 0 で完了し、`node_modules` が再生成されること

---

## TC-11: bun run typecheck が green

- **Category**: Build Verification
- **Priority**: must
- **Source**: 受け入れ基準「bun run typecheck && bun run test が green」

**GIVEN** `bun install` 済みの状態  
**WHEN** `bun run typecheck` を実行する  
**THEN** 型エラーなし、exit 0 で完了すること

---

## TC-12: bun run test が green

- **Category**: Build Verification
- **Priority**: must
- **Source**: 受け入れ基準「bun run typecheck && bun run test が green」

**GIVEN** `bun install` 済みの状態  
**WHEN** `bun run test` を実行する  
**THEN** テストがすべてパスし、exit 0 で完了すること

---

## TC-13: CI workflows に npm 呼び出しが残っていない

- **Category**: CI Verification
- **Priority**: should
- **Source**: 要件 5 / design.md「CI workflows: ディレクトリ自体が存在しないため変更なし」

**GIVEN** PR のブランチがチェックアウトされている  
**WHEN** `.github/workflows/` ディレクトリの存在と内容を確認する  
**THEN** ディレクトリが存在しないか、存在する場合 `npm install` / `npm ci` / `npm run` の呼び出しが含まれないこと

---

## TC-14: docs/ 内の npm install 言及が変更されていない

- **Category**: Regression
- **Priority**: could
- **Source**: design.md「docs/ 内の npm install 言及: Managed Agents 環境での話であり変更不要」

**GIVEN** PR のブランチがチェックアウトされている  
**WHEN** `git diff main -- docs/` を確認する  
**THEN** `docs/` 配下に差分がないこと（スコープ外）

---

## TC-15: src/ のコードに変更がない

- **Category**: Regression
- **Priority**: must
- **Source**: design.md「src/ — コード変更なし」

**GIVEN** PR のブランチがチェックアウトされている  
**WHEN** `git diff main -- src/` を確認する  
**THEN** `src/` 配下に差分がないこと

---

## TC-16: 変更対象ファイルが設計の範囲内に収まっている

- **Category**: Regression
- **Priority**: must
- **Source**: design.md「変更対象ファイル」

**GIVEN** PR のブランチがチェックアウトされている  
**WHEN** `git diff --name-only main` を確認する  
**THEN** 変更されたファイルが以下のいずれかに限定されること: `package-lock.json`（deleted）、`.gitignore`、`package.json`、および `specrunner/changes/package-lock-cleanup/` 配下のアーティファクト
