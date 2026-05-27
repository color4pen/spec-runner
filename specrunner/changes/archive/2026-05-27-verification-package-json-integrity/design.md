# Design: verification-package-json-integrity

## Overview

verification step の phase fallback path（`runVerificationPhases`）が `bun run <script>` を実行する前に、ワークツリーの `package.json` の `scripts` セクションが base branch と比較して改変されていないかを検証する。改変が検出された場合は verification を実行せず `verdict: failed` + 改変内容を verification-result.md に記載して即座に return する。

## Design Decisions

### D1: `runVerificationPhases` の冒頭に integrity check を挿入する

**Decision**: `runVerificationPhases(slug, cwd)` の冒頭（phase ループ開始前）で `package.json` の `scripts` セクションの改変チェックを実行する。

**Rationale**:
- phase fallback path のみが対象（request.md に明記）
- `runVerificationCommands`（custom commands path）はユーザーが明示的にコマンドを設定しているためチェック不要
- `runVerification` のディスパッチ分岐より後、`runVerificationPhases` の冒頭に置くことで、対象パスの限定が自然に実現される

### D2: `baseBranch` を `runVerificationPhases` に引数として渡す

**Decision**: `runVerificationPhases(slug, cwd, baseBranch)` に `baseBranch: string | undefined` パラメータを追加する。呼び出し元の `runVerification` も同様に `baseBranch` パラメータを追加し、`VerificationStep.run` から `deps.request.baseBranch` を渡す。

**シグネチャ変更**:
```typescript
// runner.ts
export async function runVerification(
  slug: string,
  cwd?: string,
  verificationConfig?: VerificationConfig,
  baseBranch?: string,          // 追加
): Promise<VerificationResult>

async function runVerificationPhases(
  slug: string,
  cwd: string,
  baseBranch?: string,          // 追加
): Promise<VerificationResult>
```

```typescript
// verification.ts (呼び出し元)
await runVerification(deps.slug, verificationCwd, deps.config.verification, deps.request.baseBranch);
```

**Rationale**:
- `origin/main` ハードコードを避け、request.md の `base-branch` 値に従う
- `baseBranch` は `deps.request.baseBranch` から取得可能（`StepContext.request: ParsedRequest` が `baseBranch: string` を保持）
- optional パラメータにすることで、テストや直接呼び出し時の後方互換性を維持

### D3: `git show origin/<baseBranch>:package.json` でベースラインを取得する

**Decision**: ベースラインの `package.json` は `git show origin/<baseBranch>:package.json` で取得する。

**ヘルパー関数**:
```typescript
async function checkPackageJsonScriptsIntegrity(
  cwd: string,
  baseBranch: string,
): Promise<{ tampered: boolean; diff?: string }>
```

**処理フロー**:
1. `git show origin/<baseBranch>:package.json` を `child_process.spawn` で実行し、ベースラインの `package.json` を取得
2. ベースライン取得失敗（exit code non-zero）→ `{ tampered: false }` を返す（新規プロジェクト等、skip して従来通り実行）
3. ワークツリーの `package.json` を `fs.readFile` で読み込む
4. ワークツリーの `package.json` 読み込み失敗 → `{ tampered: false }` を返す（package.json がないプロジェクト）
5. 両方の `scripts` セクションを JSON.parse して比較（`JSON.stringify` での deep equal）
6. 差分がある → `{ tampered: true, diff: <差分文字列> }` を返す
7. 差分がない → `{ tampered: false }` を返す

**Rationale**:
- `git show` は worktree 内で実行可能で、remote の fetch 状態に依存する（pipeline 開始時に fetch 済みの前提）
- JSON レベル比較により、フォーマット差異（空白・改行）に左右されない
- `scripts` セクションのみ比較し、`dependencies` / `devDependencies` の正当な変更は許容

**Trade-offs**:
- **Pro**: `git show` は軽量で外部依存なし
- **Pro**: JSON レベル比較で意味的な差分のみ検出
- **Con**: `origin/<baseBranch>` が fetch されていない場合はチェックがスキップされる（false negative）— pipeline の前提として許容

### D4: 改変検出時は verification を実行せず即座に failed verdict を返す

**Decision**: `checkPackageJsonScriptsIntegrity` が `tampered: true` を返した場合、phase ループに入らず即座に `VerificationResult` を構築して return する。

**出力フォーマット**（verification-result.md）:
```markdown
# Verification Result — <slug> — iter 1

## Verdict: failed

errorCode: PACKAGE_JSON_SCRIPTS_TAMPERED

## Phase Results

| # | Phase | Status | Duration | Exit Code |
|---|-------|--------|----------|-----------|
| 1 | package-json-integrity | failed | 0.0s | — |

## Phase: package-json-integrity

Step 'package-json-integrity' failed

```
package.json scripts section has been modified from origin/<baseBranch>.

Baseline scripts:
{<baseline scripts JSON>}

Current scripts:
{<current scripts JSON>}
```
```

**Rationale**:
- 改変された `scripts` でコマンドを実行するリスクを完全に排除
- `errorCode` で機械的に識別可能
- diff 内容を verification-result.md に記載することで、build-fixer agent がコンテキストを理解できる

### D5: `baseBranch` が undefined の場合はチェックをスキップする

**Decision**: `baseBranch` が `undefined` の場合（テストや直接呼び出し時）、integrity check をスキップして従来通り phase を実行する。

**Rationale**:
- 後方互換性の維持
- テスト時に不要な git 操作を避ける

## Scope

### In scope
- `src/core/verification/runner.ts` — `checkPackageJsonScriptsIntegrity` ヘルパー関数の追加
- `src/core/verification/runner.ts` — `runVerificationPhases` の冒頭に integrity check を挿入
- `src/core/verification/runner.ts` — `runVerification` / `runVerificationPhases` に `baseBranch` パラメータ追加
- `src/core/step/verification.ts` — `runVerification` 呼び出しに `deps.request.baseBranch` を渡す

### Out of scope
- `runVerificationCommands`（custom commands path）への integrity check
- `package.json` の `scripts` 以外のセクション（dependencies 等）のチェック
- `bun run` 以外の実行方式への変更
- `origin/<baseBranch>` の fetch 処理の追加
