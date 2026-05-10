## Context

現状のパス構築パターン:

1. **テンプレートリテラル直書き**: `` `openspec/changes/${slug}/spec-review-result-${nnn}.md` `` — 最も多い。step 実装、prompt、error で使用
2. **path.join 分解**: `path.join(cwd, "openspec", "changes", slug)` — dynamic-context, finish 系で使用
3. **テスト内ハードコード**: `"openspec/changes/test-slug/spec-review-result-001.md"` — assertion で使用

パスリテラルの散在箇所:
- `src/core/step/` 配下: spec-review, code-review, verification, pr-create, implementer, spec-fixer, code-fixer, build-fixer
- `src/prompts/` 配下: propose-system, spec-review-system, code-review-system, test-case-gen-system
- `src/core/finish/` 配下: archive-openspec, preflight
- `src/cli/finish.ts`, `src/errors.ts`, `src/git/dynamic-context.ts`
- `src/core/verification/runner.ts`, `src/core/verification/propagate.ts`
- `src/adapter/managed-agent/agent-runner.ts`
- テスト 15 ファイル以上

## Goals / Non-Goals

**Goals:**

- パスリテラル `openspec/changes/` を 1 箇所（`changeFolderPath` の実装内部）に集約する
- `openspec/specs/` も同様に `specsFolderPath` で集約する
- 将来の R2 で関数の戻り値を 1 行変えるだけで全コードのパスが切り替わる状態にする
- 振る舞いを一切変えない（pure refactoring）

**Non-Goals:**

- パスの値を変更すること（R2 のスコープ）
- openspec CLI 呼び出しの除去（R2 のスコープ）
- 新規テストの追加（既存テストのリテラル置換のみ）

## Decisions

### D1. パスユーティリティの配置場所

**Decision**: `src/util/paths.ts` に新設する。

**Rationale**: `src/util/` は既に slugify, spawn, atomic-write 等のステートレスユーティリティが置かれており、パス構築関数もこの粒度に合致する。core/ は business logic 層であり、ただのパス文字列構築はそこに置くべきではない。

**Alternatives considered**:
- A. `src/core/paths.ts` — core は business logic。パス構築は pure utility
- B. `src/config/paths.ts` — config は runtime 設定。静的パス構築は config ではない

### D2. 関数 API 設計

**Decision**: 以下の関数群を export する:

```typescript
// 基本: change folder の相対パス
export function changeFolderPath(slug: string): string;

// result file path ヘルパー
export function specReviewResultPath(slug: string, iteration: number): string;
export function reviewFeedbackPath(slug: string, iteration: number): string;
export function verificationResultPath(slug: string): string;
export function prCreateResultPath(slug: string): string;

// specs / changes ディレクトリ（cwd 結合用）
export function changesDirRel(): string;
export function specsDirRel(): string;

// request.md パス
export function requestMdPath(slug: string): string;
```

**Rationale**: `buildFindingsPath` と `buildReviewFeedbackPath` は既に存在する関数。これらを paths.ts に移動し、同じパターンで他の result path も関数化する。呼び出し元は `changeFolderPath` だけを使うか、具体的な result path ヘルパーを使うか選べる。

**Alternatives considered**:
- A. `changeFolderPath` 1 関数のみ、result file name は呼び出し元で結合 — 呼び出し元に `${changeFolderPath(slug)}/verification-result.md` のようなリテラルが残る。集約の意味が薄れる
- B. class-based PathBuilder — over-engineering。関数で十分

### D3. 既存の buildFindingsPath / buildReviewFeedbackPath の扱い

**Decision**: `spec-review.ts` の `buildFindingsPath` と `code-review.ts` の `buildReviewFeedbackPath` は `paths.ts` に移動し、元のファイルからは re-export する。

**Rationale**: これらの関数は外部（テスト、他 step）から import されている。re-export により import パスの変更を最小化しつつ、実体を paths.ts に統一する。

### D4. テスト内パスリテラルの置換方針

**Decision**: テスト内で使われるパスリテラルも `changeFolderPath()` 等の関数を import して使う。ただし fixture JSON ファイル（`tests/fixtures/legacy-job-state-post-pr24.json`）は書き換えない。

**Rationale**: テストがパス関数を使うことで、R2 でパスを変えたときにテストも自動的に追従する。fixture JSON は「過去の状態のスナップショット」であり、実データの互換性テストとして残す。

### D5. prompt 内パスの置換方法

**Decision**: prompt builder 関数（`buildSpecReviewInitialMessage`, `buildImplementerInitialMessage` 等）内で `changeFolderPath(slug)` を呼び、テンプレートリテラルに注入する。prompt の構造テンプレート（markdown 内の backtick-quoted パス例示）も動的に生成する。

**Rationale**: prompt 内のパスが実際のパスと乖離するリスクを排除する。prompt builder は既に slug を引数で受けているため、そこで path 関数を呼ぶだけ。

### D6. `dynamic-context.ts` の `openspec/specs/` パスの扱い

**Decision**: `specsDirRel()` と `changesDirRel()` を paths.ts に追加し、`path.join(cwd, "openspec", "specs")` を `path.join(cwd, specsDirRel())` に置換する。

**Rationale**: R2 でディレクトリ名が変わる可能性がある（`openspec/specs/` → `specrunner/specs/`）。集約しておけば同様に 1 行変更で済む。

## Risks / Trade-offs

- **Risk**: import 追加により循環依存が発生する可能性
  - **Mitigation**: `src/util/paths.ts` は他の src/ モジュールを一切 import しない pure 関数のみ。循環の余地なし
- **Risk**: re-export によるバンドルサイズ/tree-shaking への影響
  - **Mitigation**: CLIツール（バンドルしない）なので影響なし
- **Trade-off**: テスト内の `"openspec/changes/test/..."` を関数呼び出しに変えると、テスト自体がパス関数に依存する
  - **Acceptance**: パス関数のテストが別途存在し、そこで正確性を保証する。下流テストがパス関数を使うのは DRY の原則に合致する
