# Design: implement-delta-merge

## Overview

finish Phase 1 に delta spec → baseline spec マージステップを追加する。`spec-merge.ts` を新設し、change folder 内の `specs/<capability>/spec.md`（delta spec）を `specrunner/specs/<capability>/spec.md`（baseline spec）に反映する。

## Architecture

### Module Structure

```
src/core/finish/spec-merge.ts    ← 新設。パーサー + マージロジック + orchestrator 向け関数
src/util/paths.ts                ← specsDirRel(), baselineSpecPath() 追加
src/core/finish/orchestrator.ts  ← Phase 1 にマージ呼び出し追加
src/core/finish/types.ts         ← FinishFs に readFile() 追加
```

### Data Flow

```
Phase 1 (orchestrator.ts)
  ├── mergeSpecsForChange()        ← NEW: spec-merge.ts
  │     ├── changeFolderPath(slug)/specs/ の存在チェック
  │     ├── specs/ 内の capability ディレクトリを列挙
  │     └── 各 capability に対して:
  │           ├── delta spec を readFile() で取得
  │           ├── parseDeltaSpec() でパース
  │           ├── validateDeltaSpec() でバリデーション
  │           ├── baseline spec を readFile() で取得（存在しない場合は空扱い）
  │           ├── parseBaselineSpec() でパース
  │           ├── applyMerge() で REMOVED → MODIFIED → ADDED 適用
  │           ├── renderBaselineSpec() でテキスト再構築
  │           └── writeFile() + git add で baseline を更新
  ├── archiveChangeFolder()        ← 既存
  └── moveRequestsDir()            ← 既存
```

### Key Design Decisions

**D1: FinishFs に readFile を追加**

現在の `FinishFs` は `writeFile` を持つが `readFile` がない。spec-merge はファイル読み取りが必要なため `readFile(path: string): Promise<string>` を追加する。既存の `exists` / `writeFile` / `mkdir` と同じ DI パターンを維持する。

**D2: パーサーは正規表現ベースの行単位処理**

Markdown AST パーサー（remark 等）は導入せず、`### Requirement:` ヘッダの行マッチングでブロックを分割する。delta spec と baseline spec の構造は固定的であり、正規表現で十分。外部依存ゼロを維持する。

**D3: マージ順序は REMOVED → MODIFIED → ADDED**

request.md の要件通り。REMOVED で削除した後に MODIFIED を適用し、最後に ADDED を追加する。この順序により、同名 Requirement が REMOVED と ADDED の両方にある場合をクロスセクション競合として検出できる。

**D4: git add は spec ツリー全体**

マージ後の `git add` は `specrunner/specs/` をまとめて stage する。個別ファイル追跡は不要（archive-change-folder と同じパターン）。

**D5: 新規 capability は mkdir -p + テンプレート生成**

baseline spec が存在しない capability に対する ADDED は、`## Purpose` を TBD として新規 `spec.md` を生成する。`fs.mkdir()` で `specrunner/specs/<capability>/` を作成し `fs.writeFile()` で書き込む。

**D6: エラー時は即座に escalation（部分適用なし）**

1 capability でもマージエラーが発生した場合、ファイルへの書き込みを行わずに escalation を返す。全 capability のバリデーションを先に通してからまとめて書き込む 2-pass 方式を採用する。

### Type Definitions

```typescript
// Delta spec のパース結果
interface DeltaSpec {
  added: RequirementBlock[];
  modified: RequirementBlock[];
  removed: RequirementBlock[];
}

// Requirement ブロック
interface RequirementBlock {
  name: string;       // "### Requirement:" の後のテキスト
  content: string;    // ヘッダ行を含むブロック全体のテキスト
}

// Baseline spec のパース結果
interface BaselineSpec {
  preamble: string;         // ## Requirements より前のテキスト（## Purpose 等）
  requirements: RequirementBlock[];
  postamble: string;        // ## Requirements セクション後のテキスト（通常は空）
}

// マージ結果
type MergeResult =
  | { ok: true; merged: string }       // マージ済みテキスト
  | { ok: false; errors: string[] };    // バリデーションエラー

// mergeSpecsForChange の戻り値
type SpecMergeResult =
  | { ok: true; skipped: boolean; message: string }
  | { ok: false; escalation: string; exitCode: 1 };
```

### Error Cases

| Case | 検出タイミング | 対応 |
|------|-------------|------|
| change folder に specs/ がない | mergeSpecsForChange 冒頭 | skip（ok: true, skipped: true） |
| delta spec 内の Requirement 名重複 | validateDeltaSpec | escalation |
| クロスセクション競合（ADDED + MODIFIED に同名） | validateDeltaSpec | escalation |
| MODIFIED 対象が baseline に存在しない | applyMerge | escalation |
| REMOVED 対象が baseline に存在しない | applyMerge | escalation |
| ADDED 対象が baseline に既存在 | applyMerge | escalation |
| 新規 capability に MODIFIED/REMOVED | applyMerge | escalation |
| git add 失敗 | mergeSpecsForChange | escalation |

### Orchestrator Integration

```typescript
// orchestrator.ts Phase 1 の変更箇所（L186-188 付近）
const archiveCwd = operationCwd ?? cwd;

// NEW: merge delta specs before archive
const mergeResult = await mergeSpecsForChange({ slug: target.slug, cwd: archiveCwd, spawn, fs });
if (!mergeResult.ok) return { ok: false, escalation: mergeResult.escalation, exitCode: 1 };
if (!mergeResult.skipped) stdoutWrite(mergeResult.message);

// existing: archive change folder
const archiveResult = await archiveChangeFolder({ slug: target.slug, cwd: archiveCwd, spawn, fs });
```

## Scope Exclusions

- baseline spec の内容品質改善（TBD Purpose の修正等）
- RENAMED 操作の実装
- baseline spec の消費パイプライン（propose/code-review への注入）
- 既存 49 baseline spec の一括更新（過去の archive delta を遡及適用する等）
