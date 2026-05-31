# Tasks: remove-context-orphan

## T-01: src/context/ を削除する

- [x] `src/context/request-patterns.ts` を削除する
- [x] `src/context/` ディレクトリが空になっていることを確認し、ディレクトリごと削除する

**Acceptance Criteria**:
- `src/context/` が存在しない

## T-02: tests/unit/context/ を削除する

- [x] `tests/unit/context/request-patterns.test.ts` を削除する
- [x] `tests/unit/context/` ディレクトリごと削除する

**Acceptance Criteria**:
- `tests/unit/context/` が存在しない

## T-03: 参照残留がないことを grep で検証する

- [x] `collectRequestPatterns` で production code を grep → 0 件
- [x] `RequestPattern` で production code を grep → 0 件
- [x] `request-patterns` で `src/` 配下を grep → 0 件（削除済みのため）

**Acceptance Criteria**:
- 上記 3 パターンいずれも削除対象外のファイルにヒットしない

## T-04: プロジェクト標準 verification を実行する

- [x] `bun run build` が成功する
- [x] `bun run typecheck` が成功する
- [x] `bun run lint` が成功する
- [x] `bun run test` が成功する

**Acceptance Criteria**:
- 4 コマンドすべてが exit code 0 で完了する
