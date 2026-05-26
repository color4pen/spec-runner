## Phase 1: ensureDotSpecrunnerGitignore の更新

### Task 1: ensureDotSpecrunnerGitignore を 2 行構成に書き換え

- [x] `src/util/gitignore.ts`: `ensureDotSpecrunnerGitignore()` を以下のロジックに書き換え:
  1. `.gitignore` を行単位で parse
  2. 旧形式行（uncommented `.specrunner/`）があれば `.specrunner/*` に置換
  3. `.specrunner/*` 行の有無をチェック、無ければ: `.gitignore` 内に `!.specrunner/config.json` 行が既に存在するなら**その直前に挿入**、存在しないなら末尾に追加
  4. `!.specrunner/config.json` 行の有無をチェック、無ければ `.specrunner/*` 行の直後に追加
  5. 既に 2 行とも存在 → 何もしない（idempotent）
  6. コメント行は保持
- [x] JSDoc コメントを新しい挙動に合わせて更新

**Dep**: なし

## Phase 2: Test 更新

### Task 2: 既存 TC-GI-01〜06 を新フォーマットに更新

- [x] `tests/unit/util/gitignore.test.ts`:
  - TC-GI-01: assert を `.specrunner/*` + `!.specrunner/config.json` の 2 行存在に更新
  - TC-GI-02: 初期状態を旧形式 `.specrunner/` → 新形式 2 行に migration される assert に変更（または新形式で idempotent を assert）
  - TC-GI-03: 新規作成時に 2 行書き込まれることを assert
  - TC-GI-04: 空 .gitignore に 2 行追加を assert
  - TC-GI-05: コメント行のみ存在時に 2 行追加を assert
  - TC-GI-06: newline なし末尾に 2 行追加を assert
  - `preserves existing content`: 2 行の存在を assert

**Dep**: Task 1

### Task 3: migration / partial / idempotent の新規テストケース追加

- [x] `tests/unit/util/gitignore.test.ts` に以下を追加:
  - 旧形式 `.specrunner/` 単独存在 → `.specrunner/*` + `!.specrunner/config.json` の 2 行に migrate
  - 既に新形式 2 行が存在 → ファイル内容が変更されない（idempotent）
  - `.specrunner/*` のみ存在（`!` 行なし） → `!.specrunner/config.json` を追加
  - `!.specrunner/config.json` のみ存在（`*` 行なし） → `.specrunner/*` を `!.specrunner/config.json` の**直前に挿入**（結果として `.specrunner/*` が `!.specrunner/config.json` より前に現れること）
  - 旧形式の重複行（`.specrunner/` が複数） → 新形式 2 行に正規化

**Dep**: Task 1

## Phase 3: repo 自身の .gitignore 更新

### Task 4: spec-runner repo の `.gitignore` を新形式に migrate

- [x] `<repo-root>/.gitignore`: `.specrunner/` 行を以下の 2 行に書き換え:
  ```
  .specrunner/*
  !.specrunner/config.json
  ```
  既存コメント（`# Machine-generated specrunner state (jobs, verbose logs)`）は保持

**Dep**: なし

## Phase 4: Doc 更新

### Task 5: specrunner/project.md に team 共有設計の段落を追加

- [x] `specrunner/project.md`: 「設定」セクション内の Config ファイル（2 層）の記述の近くに、`.specrunner/config.json` のみ git commit される設計を 1 段落追加
  - `.specrunner/*` で全要素 ignore + `!.specrunner/config.json` で例外
  - `jobs/` `logs/` 等の machine-generated state は ignore 維持
  - `specrunner init` が .gitignore を自動設定

**Dep**: なし

### Task 6: README.md の Configuration セクションに note 追加

- [x] `README.md`: 「Project local config」セクションの説明に、`.specrunner/config.json` が git commit 可能な設計である旨を 1〜2 行追記
  - `.specrunner/` 配下は基本 ignore だが `config.json` のみ例外で team 共有可能

**Dep**: なし

## Phase 5: Delta Spec

### Task 7: delta spec — cli-commands

- [x] `specrunner/changes/gitignore-config-exception/specs/cli-commands/spec.md` を作成
  - `specrunner init` の .gitignore 関連 requirement を 2 行構成（`.specrunner/*` + `!.specrunner/config.json`）に更新
  - `specrunner run` の .gitignore 確保 requirement も同様に更新
  - scenario の assert 文字列を新形式に更新

**Dep**: なし

## Phase 6: 最終検証

### Task 8: 全体検証

- [x] `bun run typecheck` が green
- [x] `bun run test` が green (265 files, 2963 tests)
- [x] `<repo-root>/.specrunner/config.json` を作成 → `git status` で tracked として認識される（dogfood 検証済み）
- [x] `<repo-root>/.specrunner/jobs/test.json` を作成 → `git status` で ignored のまま（dogfood 検証済み）
