# Tasks: round-operational-gaps

## T-01: `pipelineManagedPaths` に `prCreateResultPath` を追加する

対象ファイル: `src/core/pipeline/round-git-scope.ts`

- [x] import 文に `prCreateResultPath` を追加する（`biteEvidenceResultPath` と同一 import 元 `../../util/paths.js`）
- [x] `pipelineManagedPaths(slug)` の返り値配列に `prCreateResultPath(slug)` を追加する（5 要素になる）
- [x] JSDoc に `prCreateResultPath` (#898 fix, T-01) の説明を追加する（biteEvidenceResultPath の注記と同型で）

**Acceptance Criteria**:
- `pipelineManagedPaths("test-slug")` が `specrunner/changes/test-slug/pr-create-result.md` を含む
- 返り値の長さが 5 になる
- `biteEvidenceResultPath` 等の既存要素は変更されない

---

## T-02: 既存 `pipelineManagedPaths` テストを更新する

対象ファイル: `src/core/pipeline/__tests__/round-git-scope.test.ts`

- [x] ファイル先頭の Constants セクションに `PR_CREATE_RESULT` 定数を追加する（`BITE_EVIDENCE` と同様のパターン）
- [x] `describe("pipelineManagedPaths")` 内の第 1 テスト（"returns state.json, events.jsonl, usage.json, bite-evidence-result.md for the given slug"）を更新する:
  - [x] テスト説明文を "… bite-evidence-result.md, pr-create-result.md …" を含む形に更新する
  - [x] `expect(paths).toContain(PR_CREATE_RESULT)` を追加する
  - [x] `expect(paths).toHaveLength(4)` を `expect(paths).toHaveLength(5)` に更新する

定数の形:
```typescript
const PR_CREATE_RESULT = `specrunner/changes/${SLUG}/pr-create-result.md`;
```

**Acceptance Criteria**:
- 既存の `toContain(STATE_JSON)`, `toContain(EVENTS_JSONL)`, `toContain(USAGE_JSON)`, `toContain(BITE_EVIDENCE)` assertion は無改変で残る
- 新たに `toContain(PR_CREATE_RESULT)` が追加されている
- `toHaveLength(5)` になっている
- `pipelineManagedPaths` の second test ("uses the slug to build paths") は無改変

---

## T-03: pr-create-result.md の回帰テストを追加する

対象ファイル: `src/core/pipeline/__tests__/round-git-scope.test.ts`

#888 の bite-evidence 回帰テストと同型で、`pr-create-result.md` 専用の回帰テスト group を追加する。

- [x] `describe("partitionRoundChanges — pipeline-managed paths in changed")` ブロック内に新しい `it` を追加する:
  ```
  "pr-create-result.md in changed → excluded from BOTH offending AND toStage"
  ```
  - `changed: [DECLARED_A, PR_CREATE_RESULT]`, `declared: [DECLARED_A]`, `slug: SLUG` で `partitionRoundChanges` を呼ぶ
  - `toStage` が `[DECLARED_A]` であることを assert する
  - `offending` に `PR_CREATE_RESULT` が含まれないことを assert する
  - `offending` が空であることを assert する

- [x] `describe("pipelineManagedPaths")` のブロック内（または末尾近く）に destruction confirmation コメントを追加する:
  ```
  // Destruction confirmation: prCreateResultPath を pipelineManagedPaths から除去すると
  // 「pr-create-result.md in changed → excluded from BOTH offending AND toStage」が fail する
  // (offending に PR_CREATE_RESULT が入り、expect(offending).toHaveLength(0) が赤になる)
  ```

- [x] `describe("pipelineManagedPaths")` 内の第 1 テストに同様のコメントを追加する:
  ```
  // Destruction confirmation: prCreateResultPath を配列から外すと toHaveLength(5) および
  // toContain(PR_CREATE_RESULT) が fail する
  ```

**Acceptance Criteria**:
- "pr-create-result.md のみが dirty な round で offending が空" のテストが green
- destruction confirmation コメントが明示されている
- 既存の bite-evidence / state.json / events.jsonl / usage.json の各テストは無改変で green

---

## T-04: `cross-boundary-invariants.md` frontmatter に 2 glob を追加する

対象ファイル: `specrunner/reviewers/cross-boundary-invariants.md`

- [x] frontmatter `paths` セクションに以下の 2 行を追加する（既存 5 glob の後に追記）:
  ```yaml
    - src/core/runtime/**
    - src/core/verification/**
  ```
- [x] 本文（`## 目的` 以降）は一切変更しない

修正後の frontmatter 全体:
```yaml
---
name: cross-boundary-invariants
maxIterations: 2
paths:
  - src/core/pipeline/**
  - src/core/step/**
  - src/state/**
  - src/store/**
  - src/adapter/**
  - src/core/runtime/**
  - src/core/verification/**
---
```

**Acceptance Criteria**:
- frontmatter の `paths` が合計 7 glob になっている
- 既存 5 glob がすべて保存されている（順序も維持）
- `src/core/runtime/**` と `src/core/verification/**` が追加されている
- `## 目的` 以降の本文は無改変

---

## T-05: `typecheck && test` を通す

- [x] `bun run typecheck` が green（型エラーなし）
- [x] `bun run test` が green（全テスト pass、既存 round-git-scope テストを含む）

**Acceptance Criteria**:
- typecheck / test どちらも exit 0
