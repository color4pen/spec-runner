# Cross-Boundary-Invariants Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## Summary

新しい lockfile-sync gate と implementer prompt 追加は、変更していない既存機構の主要な不変条件を破っていない。B-12（`node:child_process` 直接 import 封じ込め）は `lockfile-sync.ts` が `spawn` を引数注入で受け取ることで守られている。`baseBranch` ガードにより、`baseBranch` を渡さない既存テスト群（`phases.length` 固定を含む）への影響はない。`checkPackageJsonScriptsIntegrity` の early-return パス（TC-INT-01 の `toHaveLength(1)` 固定）は、lockfile-sync gate コードの手前で return するため保全される。

1 つの MEDIUM 所見（`LOCKFILE_SYNC_PHASE` 定数の二重管理・歯なし）と 1 つの LOW ���見（`git show` ref 形式の不整合）を記録する。いずれも現時点では正しく動作しているが、将来の変更で黙って壊れ得る cross-boundary 構造である。

## Reviewed Scope

- 変更ファイル（主要4件）: `src/core/verification/lockfile-sync.ts`（新規）、`src/core/verification/runner.ts`、`src/core/verification/changed-lines.ts`、`src/util/detect-pm.ts`、`src/core/step/implementer.ts`
- 参照した不変条件: B-12（spawn 封じ込め）、B-6��env strip）、changed-line-coverage gate の両経路配線前例、`checkPackageJsonScriptsIntegrity` early-return パス
- 参照した既存境界: `runner-integrity.test.ts`（TC-INT-01 の `toHaveLength(1)` 固定）、`runner-git-show-env.test.ts`（env strip 検査）、`arch-allowlist.ts`（B-12 allowlist）、`runner.ts` コマンド経路 / フェーズ経路の分岐構造

## Boundary-by-Boundary Analysis

### B-12: `node:child_process` 直接 import 封じ込め

`lockfile-sync.ts` は `node:child_process` を import **しない**。`spawn` はオーケストレータ引数経由で注入され、`runner.ts`（B-12 allowlist 済み）が提供する。`getChangedFileList`（`changed-lines.ts`）も B-12 allowlist 済��の既存モジュール経由。`arch-allowlist.ts` に新エントリ追加なし（git diff で確認）。

✅ B-12 準拠。

### B-6: env strip（stripSecrets）

`lockfile-sync.ts` の `gitShowFile` が `stripSecrets(process.env as ...)` を spawn options に渡している（L219）。`runner-git-show-env.test.ts` が既存 integrity check の env strip を pin しているが、新 gate の `gitShowFile` も同一パターンを使用。さらに `getChangedFileList` は `changed-lines.ts` の `spawnGit`（`stripSecrets` 内包）経由で実行される。

✅ B-6 準拠。

### phases.length 固定テストへの影響 — TC-INT-01 の `toHaveLength(1)`

`runner-integrity.test.ts` TC-INT-01 は scripts tampered → 早期 return を検査し `result.phases.toHaveLength(1)` を固定している。`runVerificationPhases` の早期 return（L490–512）は lockfile-sync gate コード（L646–665）**の前**にあるため、tampered ケースでは gate が phases に push されない。

`toHaveLength(1)` は変更後も保全される。

✅ TC-INT-01 の固定を破らない。

### baseBranch ガードによる既存テスト群の保護

`runner.test.ts`・`runner-commands.test.ts` の `phases.length` 固定テストは `baseBranch` 未指定で `runVerification` を呼ぶ。`baseBranch === undefined` の場合、新 gate は両経路ともコードに到達しない（`if (baseBranch !== undefined)` ガード）。これにより既存 phases count 固定は全て��全される。

✅ `baseBranch` ガードが既存テスト群を保護している。

### LOCKFILE_SYNC_PHASE 定数の二重管理（MEDIUM）

`runner.ts` L28 に local constant `const LOCKFILE_SYNC_PHASE = "lockfile-sync" as const` が宣言されている。この値は `lockfile-sync.ts` L36 の export `const LOCKFILE_SYNC_PHASE = "lockfile-sync" as const` と現在一致しているが、TypeScript の型システムは両者が同じ文字列であることを強制しない。

local constant は fail-fast skip パス（L427, L650）の `phase:` フィールドにのみ使われる。実際に gate が走る場合の `phase:` は `runLockfileSyncGate` の戻り値から来る（`lockfile-sync.ts` の export 値）。もし export 側が "lockfile-check" 等に変更されると、runner.ts の skip phase は "lockfile-sync"、実行時の gate phase は "lockfile-check" になり、同一 run 内で `phase` 名が食い違う。`writeVerificationResult` は phase 名を表示するが名前による絞り込みを行わないため、最終的な影響は markdown レポートの不整合にとどまる。ただし、verification-result.md を parse して phase 名を検索するコード（build-fixer 等）が将来追加された場合に無音で壊れる。

現状は正しく動作しているが、cross-boundary 管理のための歯が存在しない。

### git show ref 形式の非対称性（LOW���

`checkPackageJsonScriptsIntegrity`（`runner.ts` L230）は `origin/${baseBranch}:package.json` を使う（リモート追跡ブランチ）。新 gate の `gitShowFile`（`lockfile-sync.ts` L216）は `${baseBranch}:${filepath}` を使う（ローカルブランチ）。

fresh worktree 環境では両者は同一コミットを指す。しかし、ローカル `main` が `origin/main` より古い（pull し忘れ）状態では:

- `checkPackageJsonScriptsIntegrity`: 最新の `origin/main` と比較（正確）
- lockfile-sync gate: 古いローカル `main` と比較（stale）

stale な base に依存が存在しない場合、gate は「依存変更あり + lockfile なし」と誤判定し **false positive** になる。design D5 はこの選択を「worktree 環境での移植性」と説明し、Open Questions にも残されている。同一 verification 関数内に異なる ref 解決ポリシーが混在する点は保守上の混乱源。

spec-review F-03 でも指摘済みだが、cross-boundary 観点から: `checkPackageJsonScriptsIntegrity`（既存・変更なし）が `origin/` 前提で動作している中、新 gate がローカル ref を使う不整合は既存機構の前提との乖離である。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | 定数二重管理・歯なし | `src/core/verification/runner.ts` | L28 の local `LOCKFILE_SYNC_PHASE = "lockfile-sync"` は `lockfile-sync.ts` L36 の export と値が同じだが TypeScript による強制がない。fail-fast skip パス（L427/L650）と実 gate 結果で `phase` 名が food い違うとき、同一 run で inconsistent phase 名が生まれる。現状は正しく一致しているが歯がない。 | `runner.ts` に `// INVARIANT: must equal LOCKFILE_SYNC_PHASE in lockfile-sync.ts` を inline assertion またはコメント + 専用テスト（`lockfile-sync.ts` の export と `runner.ts` local を比較する 1 行テスト）で固定する。あるいは TDZ 問題が解消できるなら static import に変える。 |
| 2 | LOW | git ref 非対称 | `src/core/verification/lockfile-sync.ts` | `gitShowFile` が `${baseBranch}:path`（ローカル ref）を使うが、同じ verification 経路の `checkPackageJsonScriptsIntegrity`（runner.ts L230）は `origin/${baseBranch}:path`（リモート追跡 ref）を使う。stale なローカル `main` で false positive が生じ得る。 | `gitShowFile` の ref を `origin/${baseBranch}` に統一するか、設計上の理由（移植性優先）を inline コメントに明示して意図的選択であることを記録する。 |

## Observations

| # | Severity | File | Description |
|---|----------|------|-------------|
| 1 | LOW | `src/core/verification/runner.ts` | `checkPackageJsonScriptsIntegrity` early-return 時、lockfile-sync gate phase が phases 配列に現れない（skipped entry も push されない）。これは coverage gate も同様の挙動（early return 前なので phases に含まれない）であり、新 gate が同一パターンを踏襲しているため回帰ではない。認識としての記録。 |
| 2 | LOW | `src/core/verification/runner.ts` | `verification.commands = []`（空配列、未定義ではない）+ `baseBranch` 指定 + lockfile-sync gate が skipped を返す場合、`allSkipped = true` → `VERIFICATION_NO_RUNNABLE_PHASES` になる。ただし空 commands 配列は変更前から同様の挙動であり、新 gate による回帰ではない。 |
