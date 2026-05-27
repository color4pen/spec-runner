# Implementation Tasks: verification-package-json-integrity

## Phase 1: シグネチャ変更

- [x] **T1.1**: `src/core/verification/runner.ts` — `runVerification` に `baseBranch?: string` パラメータを追加する（第4引数）
  - 変更前: `export async function runVerification(slug: string, cwd: string = process.cwd(), verificationConfig?: VerificationConfig)`
  - 変更後: `export async function runVerification(slug: string, cwd: string = process.cwd(), verificationConfig?: VerificationConfig, baseBranch?: string)`
  - phase fallback path への呼び出しを `return runVerificationPhases(slug, cwd, baseBranch)` に変更

- [x] **T1.2**: `src/core/verification/runner.ts` — `runVerificationPhases` に `baseBranch?: string` パラメータを追加する（第3引数）
  - 変更前: `async function runVerificationPhases(slug: string, cwd: string)`
  - 変更後: `async function runVerificationPhases(slug: string, cwd: string, baseBranch?: string)`

- [x] **T1.3**: `src/core/step/verification.ts` — `runVerification` 呼び出しに `deps.request.baseBranch` を渡す
  - 変更前: `await runVerification(deps.slug, verificationCwd, deps.config.verification)`
  - 変更後: `await runVerification(deps.slug, verificationCwd, deps.config.verification, deps.request.baseBranch)`

## Phase 2: integrity check ヘルパー関数

- [x] **T2.1**: `src/core/verification/runner.ts` に `checkPackageJsonScriptsIntegrity` 関数を追加する
  - シグネチャ: `async function checkPackageJsonScriptsIntegrity(cwd: string, baseBranch: string): Promise<{ tampered: boolean; diff?: string }>`
  - 処理:
    1. `spawn("git", ["show", \`origin/${baseBranch}:package.json\`], { cwd })` でベースラインを取得
    2. git show 失敗（exit code non-zero）→ `{ tampered: false }` を返す
    3. `fs.readFile(path.join(cwd, "package.json"), "utf-8")` でワークツリーの package.json を読み込む
    4. ワークツリーの package.json 読み込み失敗 → `{ tampered: false }` を返す
    5. 両方を `JSON.parse` し、`.scripts` セクションを抽出（undefined の場合は空オブジェクト `{}` として扱う）
    6. キーを昇順ソートして正規化した上で比較: `const normalize = (s: Record<string, string>) => JSON.stringify(Object.fromEntries(Object.entries(s).sort())); normalize(baselineScripts) !== normalize(currentScripts)`
    7. 差分あり → `{ tampered: true, diff: <整形済み差分文字列> }` を返す
       - diff 文字列フォーマット: `"Baseline scripts:\n" + JSON.stringify(baselineScripts, null, 2) + "\n\nCurrent scripts:\n" + JSON.stringify(currentScripts, null, 2)`
    8. 差分なし → `{ tampered: false }` を返す
  - git show の spawn は `new Promise` でラップし、stdout を Buffer で収集する（既存の `spawnScript` パターンに倣う）
  - JSON.parse 失敗時は try-catch で `{ tampered: false }` を返す（壊れた JSON は後続の phase で検出される）

## Phase 3: runVerificationPhases への integrity check 挿入

- [x] **T3.1**: `src/core/verification/runner.ts` — `runVerificationPhases` の冒頭（`const phases: PhaseResult[] = []` の前）に integrity check を挿入する
  - `baseBranch` が truthy の場合のみ実行
  - `checkPackageJsonScriptsIntegrity(cwd, baseBranch)` を呼び出す
  - `tampered === true` の場合:
    1. `PhaseResult` を構築: `{ phase: "package-json-integrity", status: "failed", stdout: "", stderr: diff文字列, exitCode: null, durationMs: 0 }`
    2. `VerificationResult` を構築: `{ slug, verdict: "failed", phases: [phaseResult], errorCode: "PACKAGE_JSON_SCRIPTS_TAMPERED" }`
    3. `writeVerificationResult(result, outputPath)` を呼び出す
    4. `return result` で即座に return（phase ループに入らない）
  - `tampered === false` の場合: 従来通り phase ループに進む

## Phase 4: 検証

- [x] **T4.1**: `bun run typecheck` — 型エラーなし
- [x] **T4.2**: `bun run lint` — lint エラーなし
- [x] **T4.3**: `bun test` — 全テスト通過（npx vitest run で確認。1件の既存失敗 CodeFixerStep.requiresCommit は本タスクと無関係）

## Notes for Implementer

- `checkPackageJsonScriptsIntegrity` 内の `spawn` は既存の `spawnScript` と同じパターン（`child_process.spawn` + Promise ラップ）で実装する。`bun:*` / `Bun.*` は使用しない
- `stripSecrets` は不要（`git show` は外部ネットワークに接続しない）
- `scripts` セクションが両方とも `undefined` の場合は差分なし（`{} === {}` として扱う）
- `JSON.stringify` での比較はキーの順序に依存する。`Object.entries(s).sort()` でキーを昇順ソートして正規化すること（`JSON.parse → JSON.stringify` だけでは正規化されない。`JSON.parse` はテキスト中のキー出現順を保持するため）
- `baseBranch` は `deps.request.baseBranch` から取得（型は `string`、request.md で required フィールド）。ただし `runVerification` の型上は `string | undefined`（直接呼び出し対応）
