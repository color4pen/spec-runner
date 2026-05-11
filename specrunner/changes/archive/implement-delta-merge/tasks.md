# Tasks: implement-delta-merge

## Task 1: FinishFs に readFile を追加

**File**: `src/core/finish/types.ts`

`FinishFs` インターフェースに `readFile(path: string): Promise<string>` を追加する。

既存の `FinishFs` を使うテストの `makeFs()` ヘルパーにも `readFile` のデフォルトモックを追加する:
- `tests/finish-archive-change-folder.test.ts`
- `tests/finish-move-requests-dir.test.ts`
- `tests/finish-orchestrator.test.ts`

`readFile` のデフォルトは `vi.fn().mockResolvedValue("")`。

**受け入れ基準**:
- [x] `FinishFs.readFile` が定義されている
- [x] 既存テストの `makeFs()` が `readFile` を含む
- [x] 既存テストが全 pass

---

## Task 2: paths.ts に specsDirRel と baselineSpecPath を追加

**File**: `src/util/paths.ts`

```typescript
const SPECS_DIR = "specrunner/specs";

export function specsDirRel(): string {
  return SPECS_DIR;
}

export function baselineSpecPath(capability: string): string {
  return `${SPECS_DIR}/${capability}/spec.md`;
}
```

既存のパターン（`changeFolderPath` 等）と同じく相対パスを返す。TC-034 制約（他 src/ モジュールの import 禁止）を遵守する。

**受け入れ基準**:
- [x] `specsDirRel()` → `"specrunner/specs"`
- [x] `baselineSpecPath("cli-commands")` → `"specrunner/specs/cli-commands/spec.md"`
- [x] 既存テストが全 pass

---

## Task 3: spec-merge.ts — パーサーとマージロジック

**File**: `src/core/finish/spec-merge.ts`（新規作成）

### 3a: delta spec パーサー

`parseDeltaSpec(content: string): DeltaSpec` を実装する。

- `## ADDED Requirements`, `## MODIFIED Requirements`, `## REMOVED Requirements` の 3 セクションを検出
- 各セクション内の `### Requirement: <name>` でブロック分割
- セクションが存在しない場合は空配列

```typescript
interface RequirementBlock {
  name: string;
  content: string;  // ヘッダ行含むブロック全体
}

interface DeltaSpec {
  added: RequirementBlock[];
  modified: RequirementBlock[];
  removed: RequirementBlock[];
}
```

### 3b: baseline spec パーサー

`parseBaselineSpec(content: string): BaselineSpec` を実装する。

- `## Requirements` セクションを検出
- セクション内を `### Requirement:` でブロック分割
- `## Requirements` より前のテキストを `preamble` に保持
- `## Requirements` セクション後の同レベル以上のセクションがあれば `postamble` に保持

```typescript
interface BaselineSpec {
  preamble: string;
  requirements: RequirementBlock[];
  postamble: string;
}
```

### 3c: バリデーション

`validateDeltaSpec(delta: DeltaSpec): string[]` を実装する。

- セクション内の Requirement 名重複を検出
- クロスセクション競合を検出（同一名が複数セクションに存在）
- エラーの配列を返す（空なら valid）

### 3d: マージロジック

`applyMerge(baseline: BaselineSpec, delta: DeltaSpec): MergeResult` を実装する。

適用順: REMOVED → MODIFIED → ADDED。

- REMOVED: `baseline.requirements` から同名ブロックを削除。存在しなければエラー
- MODIFIED: `baseline.requirements` の同名ブロックを delta の内容で差し替え。存在しなければエラー
- ADDED: `baseline.requirements` の末尾に追加。同名が既に存在すればエラー

```typescript
type MergeResult =
  | { ok: true; merged: string }
  | { ok: false; errors: string[] };
```

### 3e: baseline テキスト再構築

`renderBaselineSpec(spec: BaselineSpec): string` を実装する。

- `preamble` + `## Requirements\n\n` + requirement blocks（改行区切り） + `postamble`
- 末尾に trailing newline を保証

### 3f: 新規 capability 用の初期 baseline 生成

`createNewBaselineSpec(added: RequirementBlock[]): string` を実装する。

- `## Purpose\n\nTBD\n\n## Requirements\n\n` + ADDED blocks

**受け入れ基準**:
- [x] delta spec の 3 セクションが正しくパースされる
- [x] baseline spec が preamble / requirements / postamble に分離される
- [x] バリデーションが重複名・クロスセクション競合を検出する
- [x] REMOVED → MODIFIED → ADDED の順で正しく適用される
- [x] 存在しない Requirement への MODIFIED/REMOVED がエラーになる
- [x] 既存名への ADDED がエラーになる

---

## Task 4: spec-merge.ts — orchestrator 向け関数

**File**: `src/core/finish/spec-merge.ts`（Task 3 に追加）

`mergeSpecsForChange(params): Promise<SpecMergeResult>` を実装する。

```typescript
export type SpecMergeResult =
  | { ok: true; skipped: boolean; message: string }
  | { ok: false; escalation: string; exitCode: 1 };

export async function mergeSpecsForChange(params: {
  slug: string;
  cwd: string;
  spawn: SpawnFn;
  fs: FinishFs;
}): Promise<SpecMergeResult>
```

処理フロー:

1. `changeFolderPath(slug)/specs/` の存在チェック → なければ skip
2. `fs.readdir()` で specs/ 内の capability ディレクトリを列挙
3. 各 capability に対して:
   a. delta spec を `fs.readFile()` で読み取り
   b. `parseDeltaSpec()` でパース
   c. `validateDeltaSpec()` でバリデーション → エラーなら即 escalation
   d. baseline spec の存在チェック
   e. baseline 存在: `parseBaselineSpec()` → `applyMerge()` → `renderBaselineSpec()`
   f. baseline 未存在 + ADDED のみ: `createNewBaselineSpec()` + `fs.mkdir()` で capability ディレクトリ作成
   g. baseline 未存在 + MODIFIED/REMOVED あり: escalation
   h. `fs.writeFile()` で baseline spec を書き込み
4. 全 capability 成功後に `spawn("git", ["add", specsDirRel() + "/"])` で stage
5. 成功メッセージを返す

**2-pass 方式**: バリデーション（pass 1: ステップ 2-3c, 3d-3g のエラーチェック）を全 capability で先に完了し、全 pass 後に書き込み（pass 2: ステップ 3h, 4）を実行する。1 capability でもエラーがあれば書き込みは一切行わない。

**受け入れ基準**:
- [x] specs/ がない場合 skip
- [x] 全 capability のバリデーション後に書き込む 2-pass 方式
- [x] 新規 capability のディレクトリ作成
- [x] git add specrunner/specs/ が実行される
- [x] escalation のフォーマットが formatEscalation() 準拠

---

## Task 5: orchestrator.ts への統合

**File**: `src/core/finish/orchestrator.ts`

`runPhase1Archive()` 内で `archiveChangeFolder()` 呼び出しの **前** にマージを実行する。

```typescript
import { mergeSpecsForChange } from "./spec-merge.js";

// L184 (const archiveCwd = operationCwd ?? cwd;) の後に追加:
const mergeResult = await mergeSpecsForChange({ slug: target.slug, cwd: archiveCwd, spawn, fs });
if (!mergeResult.ok) return { ok: false, escalation: mergeResult.escalation, exitCode: 1 };
if (!mergeResult.skipped) stdoutWrite(mergeResult.message);
```

Phase 1 の順序: merge → archive → move → commit。

**受け入れ基準**:
- [x] mergeSpecsForChange が archiveChangeFolder より前に呼ばれる
- [x] merge 失敗時に Phase 1 が escalation で中断する
- [x] merge skip 時にメッセージが出ない
- [x] 既存の orchestrator テストが全 pass

---

## Task 6: テスト — spec-merge パーサーとマージロジック

**File**: `tests/finish-spec-merge.test.ts`（新規作成）

### 6a: parseDeltaSpec テスト

- ADDED のみの delta → `added` に RequirementBlock が入り、`modified` / `removed` は空
- 3 セクション全部ある delta → 各セクションに正しくブロックが入る
- セクションなし（空文字） → 全空配列

### 6b: parseBaselineSpec テスト

- Purpose + Requirements + 複数 Requirement → preamble / requirements / postamble 分離
- Requirements セクションなし → requirements 空、全テキストが preamble

### 6c: validateDeltaSpec テスト

- 正常な delta → エラー空
- ADDED 内に同名 Requirement 重複 → エラー 1 件
- ADDED と MODIFIED に同名 → クロスセクション競合エラー

### 6d: applyMerge テスト

- ADDED: baseline に新規 Requirement 追加
- MODIFIED: baseline の既存 Requirement 差し替え
- REMOVED: baseline から Requirement 削除
- 複合: ADDED + MODIFIED + REMOVED 混在
- エラー: 存在しない Requirement への MODIFIED → errors
- エラー: 存在しない Requirement への REMOVED → errors
- エラー: 既存名への ADDED → errors

### 6e: createNewBaselineSpec テスト

- ADDED ブロックから新規 baseline テキスト生成

**受け入れ基準**:
- [x] 全ケースが pass
- [x] エラーケースのメッセージが具体的な Requirement 名を含む

---

## Task 7: テスト — mergeSpecsForChange 統合テスト

**File**: `tests/finish-spec-merge.test.ts`（Task 6 に追加）

既存テストの `makeFs()` / `makeSpawn()` パターンを使用する。

### テストケース

- **skip**: change folder に specs/ がない → `{ ok: true, skipped: true }`
- **ADDED 成功**: delta に ADDED のみ、baseline 存在 → baseline に追記、git add 実行
- **MODIFIED 成功**: delta に MODIFIED、baseline に同名 Requirement あり → 差し替え
- **REMOVED 成功**: delta に REMOVED、baseline に同名 Requirement あり → 削除
- **複合成功**: ADDED + MODIFIED + REMOVED → 全操作適用
- **新規 capability**: baseline なし + ADDED のみ → mkdir + writeFile
- **新規 capability + MODIFIED**: baseline なし + MODIFIED あり → escalation
- **バリデーションエラー**: 重複名 → escalation
- **git add 失敗**: spawn exit 1 → escalation

**受け入れ基準**:
- [x] 全ケースが pass
- [x] fs.writeFile / spawn の呼び出し引数が正しい
- [x] escalation メッセージが formatEscalation 形式

---

## Task 8: 型チェック・lint・テスト全 pass 確認

`bun run typecheck && bun run lint && bun run test` を実行し、全 pass を確認する。

**受け入れ基準**:
- [x] typecheck pass
- [x] lint pass（lint スクリプト未定義のため typecheck で代替）
- [x] test pass（既存 + 新規全て）

---

## Dependency Graph

```
Task 1 (FinishFs.readFile)
  ↓
Task 2 (paths.ts) ─── 並行可 ──→ Task 3 (パーサー+マージ)
                                    ↓
                                Task 4 (mergeSpecsForChange)
                                    ↓
                                Task 5 (orchestrator 統合)
                                    ↓
                              Task 6, 7 (テスト) ─── 並行可
                                    ↓
                                Task 8 (全 pass 確認)
```
