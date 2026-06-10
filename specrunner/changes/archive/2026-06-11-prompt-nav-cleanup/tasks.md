# Tasks: prompt-nav-cleanup

## T-01: code-review-system.ts のナビゲーション文を削除する

- [x] `src/prompts/code-review-system.ts` の `## Pipeline Rules` セクション直下にある行 `(See Pipeline Rules section below for severity definitions, categories, findings format, scoring, and verdict definitions.)` を削除する
- [x] 前後の空行が自然に繋がっていることを確認する（セクション見出し → 空行 → 次のセクション見出し）

**Acceptance Criteria**:
- `src/prompts/code-review-system.ts` に `(See Pipeline Rules section below` を含む文字列が存在しない
- `## Pipeline Rules` セクション見出しが残っている
- `## Review Process` セクションが続いている

## T-02: spec-review-system.ts のナビゲーション文を削除する

- [x] `src/prompts/spec-review-system.ts` の `## Pipeline Rules` セクション直下にある行 `(See Pipeline Rules section below for severity definitions, categories, findings format, scoring, and verdict definitions.)` を削除する
- [x] 前後の空行が自然に繋がっていることを確認する（セクション見出し → 空行 → 次のセクション見出し）

**Acceptance Criteria**:
- `src/prompts/spec-review-system.ts` に `(See Pipeline Rules section below` を含む文字列が存在しない
- `## Pipeline Rules` セクション見出しが残っている
- `## Your Output` セクションが続いている

## T-03: typecheck && test を通す

- [x] `bun run typecheck` が green であることを確認する
- [x] `bun run test` が green であることを確認する

**Acceptance Criteria**:
- `bun run typecheck && bun run test` が 0 exit で完了する
