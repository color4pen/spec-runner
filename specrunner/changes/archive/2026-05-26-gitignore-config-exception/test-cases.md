# Test Cases: gitignore-config-exception

Source: request.md 受け入れ基準 / tasks.md Task 1〜8 / design.md D1〜D3

---

## TC-GI-NEW-01: 新規 .gitignore に 2 行追加

- **Category**: UNIT
- **Priority**: must
- **Source**: 受け入れ基準 1 / Task 1

**GIVEN** `.gitignore` が存在しない repo root  
**WHEN** `ensureDotSpecrunnerGitignore(repoRoot)` を呼ぶ  
**THEN** `.gitignore` が作成され、`.specrunner/*` 行と `!.specrunner/config.json` 行の両方を含む

---

## TC-GI-NEW-02: 空の .gitignore に 2 行追加

- **Category**: UNIT
- **Priority**: must
- **Source**: 受け入れ基準 1 / Task 2 (TC-GI-04 更新)

**GIVEN** 空の `.gitignore` が存在する repo root  
**WHEN** `ensureDotSpecrunnerGitignore(repoRoot)` を呼ぶ  
**THEN** `.gitignore` に `.specrunner/*` と `!.specrunner/config.json` の 2 行が追加される

---

## TC-GI-NEW-03: 既存エントリなしの .gitignore に 2 行追加

- **Category**: UNIT
- **Priority**: must
- **Source**: 受け入れ基準 1 / Task 2 (TC-GI-01 更新)

**GIVEN** `node_modules/\ndist/\n` を含む `.gitignore` が存在し、specrunner 関連エントリは無い  
**WHEN** `ensureDotSpecrunnerGitignore(repoRoot)` を呼ぶ  
**THEN** `.gitignore` に `.specrunner/*` 行と `!.specrunner/config.json` 行が追加される  
**AND** 既存の `node_modules/` `dist/` 行は保持される

---

## TC-GI-NEW-04: 旧形式 `.specrunner/` を新形式 2 行に migrate

- **Category**: UNIT
- **Priority**: must
- **Source**: 受け入れ基準 2 / Task 3 (migration ケース) / design.md D2

**GIVEN** `.gitignore` に `node_modules/\n.specrunner/\ndist/\n` が含まれる (旧形式)  
**WHEN** `ensureDotSpecrunnerGitignore(repoRoot)` を呼ぶ  
**THEN** `.specrunner/` 行が `.specrunner/*` に置換される  
**AND** `!.specrunner/config.json` 行が `.specrunner/*` の直後に追加される  
**AND** `dist/` 等の他の行は保持される  
**AND** 旧形式の `.specrunner/` 行は残らない

---

## TC-GI-NEW-05: 新形式 2 行が既に存在 → 何も変更しない (idempotent)

- **Category**: UNIT
- **Priority**: must
- **Source**: 受け入れ基準 3 / Task 3 (idempotent ケース)

**GIVEN** `.gitignore` に `.specrunner/*\n!.specrunner/config.json\n` が含まれる (新形式)  
**WHEN** `ensureDotSpecrunnerGitignore(repoRoot)` を呼ぶ  
**THEN** `.gitignore` の内容が一切変更されない  
**AND** `.specrunner/*` 行が重複しない  
**AND** `!.specrunner/config.json` 行が重複しない

---

## TC-GI-NEW-06: `.specrunner/*` のみ存在 → `!.specrunner/config.json` を追加

- **Category**: UNIT
- **Priority**: must
- **Source**: 受け入れ基準 4 / Task 3 (partial ケース)

**GIVEN** `.gitignore` に `.specrunner/*` のみ存在し、`!.specrunner/config.json` 行が無い  
**WHEN** `ensureDotSpecrunnerGitignore(repoRoot)` を呼ぶ  
**THEN** `!.specrunner/config.json` 行が `.specrunner/*` の直後に追加される  
**AND** `.specrunner/*` 行は重複しない

---

## TC-GI-NEW-07: `!.specrunner/config.json` のみ存在 → `.specrunner/*` をその直前に挿入

- **Category**: UNIT
- **Priority**: must
- **Source**: 受け入れ基準 4 / Task 3 (partial ケース) / tasks.md Task 3 仕様

**GIVEN** `.gitignore` に `!.specrunner/config.json` のみ存在し、`.specrunner/*` 行が無い  
**WHEN** `ensureDotSpecrunnerGitignore(repoRoot)` を呼ぶ  
**THEN** `.specrunner/*` 行が `!.specrunner/config.json` の直前に挿入される  
**AND** 結果として `.specrunner/*` が `!.specrunner/config.json` より前に並ぶ

---

## TC-GI-NEW-08: 旧形式の重複行が複数存在 → 新形式 2 行に正規化

- **Category**: UNIT
- **Priority**: should
- **Source**: request.md 要件 1 (旧形式複数行) / Task 3 (重複ケース)

**GIVEN** `.gitignore` に `.specrunner/` が 2 行以上重複して存在する  
**WHEN** `ensureDotSpecrunnerGitignore(repoRoot)` を呼ぶ  
**THEN** 結果として `.specrunner/*` 行が 1 行、`!.specrunner/config.json` 行が 1 行存在する  
**AND** 旧形式 `.specrunner/` の行は残らない

---

## TC-GI-NEW-09: コメント行を正しく無視 → 実エントリなしと判定して追加

- **Category**: UNIT
- **Priority**: must
- **Source**: Task 2 (TC-GI-05 更新)

**GIVEN** `.gitignore` に `# .specrunner/\nnode_modules/\n` が含まれる (コメント行のみ)  
**WHEN** `ensureDotSpecrunnerGitignore(repoRoot)` を呼ぶ  
**THEN** コメント行はスキップされ、`.specrunner/*` と `!.specrunner/config.json` の 2 行が追加される  
**AND** 既存のコメント行は保持される

---

## TC-GI-NEW-10: 末尾改行なしのファイルに正しく追記

- **Category**: UNIT
- **Priority**: must
- **Source**: Task 2 (TC-GI-06 更新)

**GIVEN** `.gitignore` が `node_modules/` (末尾改行なし) の内容  
**WHEN** `ensureDotSpecrunnerGitignore(repoRoot)` を呼ぶ  
**THEN** 改行が適切に補完され `.specrunner/*` と `!.specrunner/config.json` の 2 行が追加される  
**AND** 既存の `node_modules/` は独立した行として保持される

---

## TC-GI-NEW-11: 既存コメント（Machine-generated...）が保持される

- **Category**: UNIT
- **Priority**: should
- **Source**: request.md 要件 1「コメントは保持する」/ Task 1

**GIVEN** `.gitignore` に `# Machine-generated specrunner state (jobs, verbose logs)\n.specrunner/\n` が含まれる  
**WHEN** `ensureDotSpecrunnerGitignore(repoRoot)` を呼ぶ  
**THEN** `# Machine-generated specrunner state (jobs, verbose logs)` コメント行が保持される  
**AND** `.specrunner/*` と `!.specrunner/config.json` の 2 行が正しく追加・置換される

---

## TC-GI-NEW-12: 既存コンテンツが保持される（回帰）

- **Category**: UNIT
- **Priority**: must
- **Source**: Task 2 (`preserves existing content` 更新)

**GIVEN** `.gitignore` に `node_modules/\ndist/\n.env\n` が含まれ、specrunner エントリは無い  
**WHEN** `ensureDotSpecrunnerGitignore(repoRoot)` を呼ぶ  
**THEN** `node_modules/`, `dist/`, `.env` の行がすべて保持される  
**AND** `.specrunner/*` と `!.specrunner/config.json` の 2 行が追加される

---

## TC-REPO-01: spec-runner repo 自身の .gitignore が新形式に更新されている

- **Category**: INTEGRATION
- **Priority**: must
- **Source**: 受け入れ基準 7 / Task 4

**GIVEN** spec-runner repo の `<repo-root>/.gitignore`  
**WHEN** PR diff を確認する  
**THEN** `.specrunner/` 行が `.specrunner/*` に置換されている  
**AND** `!.specrunner/config.json` 行が追加されている  
**AND** 既存コメント行（`# Machine-generated specrunner state` 等）は保持されている

---

## TC-DOGFOOD-01: `.specrunner/config.json` が tracked file として認識される

- **Category**: INTEGRATION
- **Priority**: must
- **Source**: 受け入れ基準 8

**GIVEN** spec-runner repo の `.gitignore` が新形式（`.specrunner/*` + `!.specrunner/config.json`）に更新済み  
**WHEN** `<repo-root>/.specrunner/config.json` を作成して `git status` を実行する  
**THEN** `.specrunner/config.json` が untracked または staged file として `git status` に表示される（= ignored ではない）

---

## TC-DOGFOOD-02: `.specrunner/jobs/<jobId>.json` が ignored のまま

- **Category**: INTEGRATION
- **Priority**: must
- **Source**: 受け入れ基準 9

**GIVEN** spec-runner repo の `.gitignore` が新形式（`.specrunner/*` + `!.specrunner/config.json`）に更新済み  
**WHEN** `<repo-root>/.specrunner/jobs/test.json` を作成して `git status` を実行する  
**THEN** `.specrunner/jobs/test.json` が `git status` に表示されない（= ignored のまま）

---

## TC-BUILD-01: typecheck が green

- **Category**: BUILD
- **Priority**: must
- **Source**: 受け入れ基準 10

**GIVEN** 実装変更後のコードベース  
**WHEN** `bun run typecheck` を実行する  
**THEN** 型エラーがゼロで終了する

---

## TC-BUILD-02: 全ユニットテストが green

- **Category**: BUILD
- **Priority**: must
- **Source**: 受け入れ基準 10 / Task 2・3

**GIVEN** 実装変更後のコードベース  
**WHEN** `bun run test` を実行する  
**THEN** TC-GI-01〜06 (更新後) および新規追加ケースを含む全テストが pass する

---

## TC-DOC-01: specrunner/project.md に team 共有設計の段落が追加される

- **Category**: DOC
- **Priority**: must
- **Source**: 受け入れ基準 11 / Task 5

**GIVEN** `specrunner/project.md` の設定セクション  
**WHEN** ファイルを参照する  
**THEN** `.specrunner/config.json` のみ commit・team 共有される設計が 1 段落説明されている  
**AND** `.specrunner/*` で全要素 ignore + `!.specrunner/config.json` で例外という仕組みに言及している  
**AND** `jobs/` `logs/` 等の machine-generated state は ignore 維持である旨が含まれている

---

## TC-DOC-02: README.md の Configuration セクションに note が追加される

- **Category**: DOC
- **Priority**: must
- **Source**: 受け入れ基準 11 / Task 6

**GIVEN** `README.md` の Configuration セクション  
**WHEN** ファイルを参照する  
**THEN** `.specrunner/config.json` が git commit 可能であり team 共有に使える旨の note が 1〜2 行追記されている  
**AND** `.specrunner/` 配下は基本 ignore だが `config.json` のみ例外である旨が明記されている

---

## TC-SPEC-01: delta spec cli-commands が 2 行構成に更新されている

- **Category**: SPEC
- **Priority**: should
- **Source**: Task 7 / design.md Affected Specs

**GIVEN** `specrunner/changes/gitignore-config-exception/specs/cli-commands/spec.md`  
**WHEN** ファイルを参照する  
**THEN** `specrunner init` の .gitignore 関連 requirement が `.specrunner/*` + `!.specrunner/config.json` の 2 行構成に更新されている  
**AND** scenario の assert 文字列が新形式を反映している
