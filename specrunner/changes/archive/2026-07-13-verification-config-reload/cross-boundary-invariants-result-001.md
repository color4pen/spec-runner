# Cross-Boundary-Invariants Review — verification-config-reload (Iteration 1)

- **reviewer**: cross-boundary-invariants
- **verdict**: approved

---

## 対象 diff 概要

新ファイル: `src/core/verification/reload-coverage-config.ts`（`reloadCoverageConfig` ヘルパ）  
変更ファイル: `src/core/step/verification.ts`（`VerificationStep.run` に reload 呼び出し追加）  
新テスト: `reload-coverage-config.test.ts`、`verification-config-reload.test.ts`、`verification-step.test.ts` 追記

---

## 新規経路の列挙

この diff が導入した実行経路は次の 3 つ。すべて `VerificationStep.run` の entry point から分岐する。

### 経路 A: project-local 不在（`applied: false`）
`reloadCoverageConfig(worktreeCwd)` → `resolveRepoRoot` が null または `fs.access` が ENOENT → `{ applied: false }` → `effectiveVerification = deps.config.verification`

**隣接機構への影響**: `runVerification` への引数が従来と同一。変更なし。

### 経路 B: project-local 存在・正常 reload（`applied: true`）
`reloadCoverageConfig` → disk から `loadConfig` → `{ applied: true, coverage: <disk値> }` → `effectiveVerification = { ...deps.config.verification, coverage: <disk値> }`

**隣接機構への影響**: 以下を確認した。

- `runVerification(slug, cwd, effectiveVerification, baseBranch)` — 第 3 引数のみ変化。第 1/2/4 引数は不変。`runVerification` 内部はステートレスなので同一呼び出しセマンティクスが成立する。
- `verificationConfig?.commands` の dispatch 分岐（`runner.ts:332`）: `commands` は `deps.config.verification` のスプレッドで保持されるため、commands 経路 vs phases 経路の判定は job 開始時と同じ。
- `coverage` の渡し先（commands path: `runner.ts:333`、phases path: `runner.ts:337`）: 両経路とも `verificationConfig?.coverage` = `reload.coverage` を受け取り、gate へ正しく流れる。
- `changed-line-coverage.ts`（不変コード）: `coverage.exclude` を参照する純粋関数。呼び出し側が渡す値が変化するだけで、関数の内部不変条件は成立している。

### 経路 C: reload 時の例外（`applied: false` へ fail-safe）
`loadConfig` が throw → outer catch → `{ applied: false }` → 経路 A と同じ

---

## 不変条件の照合

### I-1: `deps.config` の不変性（複数 step が共有する job 開始時スナップショット）

`VerificationStep.run` は `deps.config.verification` を読み取り専用で参照し、`effectiveVerification` をローカル変数として構築する。`deps.config` オブジェクトは変更されない。

`executor.ts` の `snapshotMainCheckoutGuard(cwd, deps.config)` 呼び出しや他の step が `deps.config` を参照する箇所（`implementer.ts:182` の `deps.config.tests?.placement` 等）はすべて `VerificationStep.run` の呼び出し前後で同一オブジェクトを参照する。**不変条件: 保持。**

### I-2: `runVerification` の受け取る引数の型契約

`runVerification(slug: string, cwd: string, verificationConfig?: VerificationConfig, baseBranch?: string)` — `effectiveVerification` は `VerificationConfig | undefined` の範囲に収まる（`deps.config.verification` のスプレッド + `coverage` の上書き）。型契約は維持される。**不変条件: 保持。**

### I-3: `propagateVerificationResult` の呼び出し順・引数

`runVerification` 完了後に `propagateVerificationResult` を呼ぶ順序は不変。`state.branch`、`slug`、`iteration`、`cwd`、`spawn` のすべてが reload の影響を受けない。**不変条件: 保持。**

### I-4: pipeline 遷移テーブルの期待する verdict

`VerificationStep.run` → `parseResult` は `## Verdict: (passed|failed)` の正規表現に依存する。`runVerification` が `writeVerificationResult` で書くフォーマットは変更なし。verdict の値域（passed / failed）も不変。遷移テーブルの `on: "passed" / "failed" / "escalation"` とのマッピングは保たれる。**不変条件: 保持。**

### I-5: main-checkout guard の監視対象（`.specrunner/**`）

`resolveMonitoredGuardGlobs` は `.specrunner/**` を main checkout 側で監視する。`reloadCoverageConfig` が読むのは worktree 側の `.specrunner/config.json`（read-only）であり、main checkout には書き込まない。guard snapshot の before/after 差分は `reloadCoverageConfig` で生じない。**不変条件: 保持。**

### I-6: `resolveRepoRoot` が worktree を返す topology 整合性

`deps.cwd` = worktree cwd（`<repo>/.git/specrunner-worktrees/<slug>-id`）で `git rev-parse --show-toplevel` を実行すると、linked worktree の場合は worktree パスそのものが返る。したがって `projectLocalPath = <worktreePath>/.specrunner/config.json` となり、build-fixer がコミットする編集先と一致する。preflight が読んだ main checkout 側の project-local と topology 上は別ファイルだが、これは D4 で意図された構造であり、design.md の "Context / 実行時のディレクトリ topology" で明示されている。**不変条件: 保持。**

### I-7: post-fixer reverification および post-conformance reverification における再 reload

pipeline 遷移表より:
- `BUILD_FIXER → VERIFICATION`: build-fixer が disk を編集した直後に verification が再実行される。`reloadCoverageConfig` は毎回 disk を読むため、更新が反映される。
- `CONFORMANCE → VERIFICATION`（`codeChangedSinceLastVerification` が true の場合）: build-fixer の config 編集は既に disk に存在するため、この reverification でも reload が正しく効く。

両経路とも `deps` は同一オブジェクトのまま（job 開始時 in-memory config は不変）。**不変条件: 保持。**

---

## 観察事項（非ブロッキング）

### O-1: `deps.config.verification === undefined` かつ build-fixer が project-local を新規作成する場合

**条件**: job 開始時に `deps.config.verification === undefined`（verification config なし）かつ build-fixer が `<worktree>/.specrunner/config.json` を新規作成して `verification.coverage` を追加した場合。

**手順**:
1. 初回 verification: project-local が不在 → `applied: false` → `effectiveVerification = undefined` → coverage gate なし → passed
2. build-fixer が新規 project-local を作成し `verification.coverage` を追加
3. 二回目 verification（build-fixer failed の場合は経由しないが、別の経路での reverification）: `applied: true, coverage: <新規>` → `effectiveVerification = { coverage: <新規> }` → coverage gate が初めて有効化される

**評価**: 本 request のスコープは「既存の `coverage.exclude` へ追記して self-heal する」であり、verification config が丸ごと不在の状態から build-fixer が新規作成するケースは対象外。設計上のゴールである「exclude 追加後の self-heal」に対しては正しく動作する。この O-1 シナリオは build-fixer が通常行わない操作（coverage config の新規導入）を前提としており、現行テストが意図的にカバーしていない。ブロッキング要件ではない。

### O-2: `{ applied: true, coverage: undefined }` が job 開始時の coverage を上書きする

project-local が存在するが `verification.coverage` を宣言していない場合、reload は `{ applied: true, coverage: undefined }` を返す。job 開始時に `deps.config.verification.coverage` が定義されていた場合、`effectiveVerification.coverage === undefined` となり coverage gate がスキップされる。

**評価**: 設計 D3 の "再 load 失敗は fail-safe" と混同しやすいが、これは失敗ではなく「disk 上の config に coverage が宣言されていない」正常な状態。build-fixer が coverage を削除するような操作をしない限り（削除した変更は PR に載り人間レビュー可能）、実運用での発現は極めて稀。TC-RCC-06 で明示的にテストされ、設計文書にも記載された既知の挙動。ブロッキング要件ではない。

---

## 結論

新規経路 A・B・C の全経路で、変更していない周辺コード（`runVerification`、`changed-line-coverage.ts`、pipeline 遷移テーブル、`propagateVerificationResult`、main-checkout guard）の不変条件が破れる具体的な実行列を構成できなかった。

- **verdict**: approved
