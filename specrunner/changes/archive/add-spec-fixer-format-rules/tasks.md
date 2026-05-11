# Tasks: add-spec-fixer-format-rules

## Task 1: [x] spec-fixer-system.ts に Delta Spec Format Rules セクションを追加

**ファイル**: `src/prompts/spec-fixer-system.ts`

**操作**: `SPEC_FIXER_SYSTEM_PROMPT` の文字列リテラル内、`## 修正手順` セクションの後（`## 修正不能な findings の扱い` の前）に以下のセクションを挿入する。

**挿入内容**:

```markdown
## Delta Spec Format Rules

delta spec ファイル（`specs/**/*.md`）を修正する際、以下のフォーマット規約に従うこと。

### 使用するセクションヘッダー

- `## ADDED Requirements` — 新規 Requirement を追加する場合
- `## MODIFIED Requirements` — 既存 Requirement を変更する場合
- `## REMOVED Requirements` — 既存 Requirement を削除する場合
- `## RENAMED Requirements` — Requirement header を変更する場合（MODIFIED と併記必須）

### ルール

1. **各 Requirement は `### Requirement:` で始まる header を持つこと**
2. **各 Requirement は少なくとも 1 つの `#### Scenario:` を含むこと**（scenario なしは validation error）
   - **MODIFIED Requirements にも最低 1 つの Scenario が必須である。** Scenario は「差分の説明文」や「変更概要」ではなく、変更後のシステムの振る舞いを Given/When/Then 形式で具体的に記述すること。
3. **`## MODIFIED Requirements` 配下の `### Requirement:` header は、変更前の元の header と完全一致すること**。header を変えたい場合は `## RENAMED Requirements` を併記し FROM / TO を明示する。
4. **`## Changed Requirement:` や `## Updated:` などの独自フォーマットは禁止**。認識されるのは `## ADDED/MODIFIED/REMOVED/RENAMED Requirements` のみ。
5. **Requirement 本文（header 直後〜最初の Scenario の間）に英語の `SHALL` または `MUST` を少なくとも 1 つ含めること**（normative keyword なしは validation error）
6. **`### Requirement:` header と最初の `#### Scenario:` の間にコードブロック（``` ）を挟まないこと**（コードブロックが入るとシナリオ紐付けが失敗する）

### ファイル配置

- delta spec は `specs/<capability-name>/spec.md` に配置すること
- `specs/<name>.delta.md` 等のフラットファイルは禁止
- `<capability-name>` は design.md で宣言した名前を使用すること
```

**注意事項**:
- propose-system.ts のテンプレートリテラル変数 `${_changesDir}` は使用しない。spec-fixer は既存ファイルを修正する文脈で動作するため、相対パス `specs/**/*.md` で十分
- propose-system.ts の Self-review checklist は含めない（fixer は findings ベースで修正するため不要）

## Task 2: [x] 検証

- `bun run typecheck` が pass すること
- `bun run test` が pass すること
