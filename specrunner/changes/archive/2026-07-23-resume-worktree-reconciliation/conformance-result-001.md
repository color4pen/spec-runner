# Conformance Result — resume-worktree-reconciliation — iter 001

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### J1: Task completion — tasks.md 全チェックボックス確認

すべてのチェックボックスが `[x]` であることを確認。各タスクの実装を実ファイルで照合した。

| Task | 実装照合 |
|------|---------|
| T-01: `src/core/resume/reconcile-worktree.ts` 新規作成 | ファイル存在確認済み。`ReconcileResult`・`isReconcilableArtifact`・`reconcileWorktreeArtifacts` の export、全 import、`defaultSpawnFn` 非 import、改変禁止4ファイルの無変更を確認 |
| T-02: `ResumeCommand.prepare()` への wire | `resume.ts` line 32 import、line 333 の呼び出し位置（apply-canon gate 後、`else if` 前）、エラーハンドリングの形式を確認 |
| T-03: `docs/operations.md` 回復契約 | `### halt → resume の回復契約` heading、3クラス表、`.specrunner/local/<slug>/` 明示、ジャーナル保護記述を確認 |
| T-04 Unit / T-05 E2E / T-06 wiring tests | 各テストファイルの TC 番号・内容を照合 |
| T-07 docs drift-guard | `tests/unit/docs/operations-recovery-contract.test.ts` の全 assertion を確認 |
| T-08 既存 apply-canon テスト green | verification-result.md: 634 file / 9368 tests passed, 0 failures |
| T-09 typecheck && test | verification-result.md: typecheck=passed, test=passed |

### J2: Spec requirements (SHALL/MUST)

**Requirement 1 — resume は step 開始前に3クラス分類・処理する**

- `isReconcilableArtifact` が3クラス判定を実装: canon → false、managed → false、change folder 内残骸 → true
- 全 resume 経路（default/`--from`/`--apply-canon`）が同一の `if (resolvedWorktreePath !== null && resolvedSlug !== null)` ブロック内に到達することを `resume.ts` で確認
- TC-006〜010 で分類器の境界を確認、TC-001 で実経路を確認

**Requirement 2 — ジャーナルと非管理パスを保護する**

- `pipelineManagedPaths(slug)` を keep set として使用、`changeFolderPath(slug)` 外は early return で除外することを確認
- TC-008（managed paths false）、TC-003（state.json/src/ が残存）で検証済み

**Requirement 3 — 退避失敗時は fail-closed**

- `fsMkdir(quarantineDir)` と `fsWriteFile` は try-catch なしで実行されており、例外はそのまま伝播する
- 除去コードは quarantine 全成功後にのみ到達する構造を確認
- TC-004（mkdir 失敗 → throw + 残骸保全）、TC-017（PrepareError exit code 1）で検証済み

**Requirement 4 — apply-canon gate を弱体化しない**

- reconcile 呼び出しが apply-canon gate の `if (dirtyCanonPaths.length > 0)` ブロックの外側・後続に配置されていることを確認
- gate fail-close 時は `throw new PrepareError` が reconcile の前に実行される
- TC-019（dirty canon → reconcile 未到達）、TC-007（canon paths → false）で検証済み

### J3: Design decisions D1〜D7

| Decision | 実装照合 |
|----------|---------|
| D1: resume entry に単一回復点 | `prepare()` 内呼び出し確認 |
| D2: 新規モジュール、純粋分類器 + オーケストレーター | `reconcile-worktree.ts` の構造を確認 |
| D3: ジャーナルは `pipelineManagedPaths` の keep set | 分類器の条件3を確認 |
| D4: quarantine-all-then-remove-all; quarantine 失敗は fail-closed | コード順序を確認（quarantine loop → remove loop、try-catch なし） |
| D5: tracked state 別除去 (`clean`/`rm --cached+clean`/`checkout HEAD`) | 三分類処理コードを確認; TC-013 で全 kind を実地検証 |
| D6: apply-canon gate 後、worktree guard 内 | 配置確認済み |
| D7: 検知はベストエフォート; quarantine/remove のみ fail-closed | spawn try-catch と exitCode != 0 の no-op return を確認; TC-012 で spawn rejection を検証 |

### J4: 受け入れ基準（request.md）

| 基準 | テスト |
|------|--------|
| 残骸が quarantine 退避・除去され write-scope violation なし | TC-001: `findScopedCommitViolations` / `findWriteScopeViolations` が `[]` を返すことを実git repoで確認 |
| quarantine 失敗時 fail-closed | TC-004: `.specrunner/local` を regular file に差し替え → throw + 残骸保全 |
| 残骸なし worktree で no-op（冪等性） | TC-002: `{ reconciled: [], quarantineDir: null }` + `reconcile-*` dir なし |
| 既存 apply-canon テスト無変更で green | 9368 tests passed |
| 回復契約が docs に明文化 | `docs/operations.md` + TC-021 drift-guard |
| `typecheck && test` green | verification-result.md 全フェーズ passed |

## 検証できなかった項目

None — すべての項目を実装ファイルと verification-result.md で確認した。

## Findings 詳細

None — 指摘なし。

---

### 参考: 非ブロッキング観察（finding には計上しない）

**Self-ignoring `.gitignore` 追加（仕様外の実装詳細）:**
`reconcile-worktree.ts` は quarantine dir 作成前に `.specrunner/local/.gitignore` に `*` を書き込む（`flag: "wx"`）。`specrunner init` 未実行のリポジトリで quarantine dir が `git status` に出現するのを防ぐ目的。ブロック全体が silent catch で囲まれており、失敗しても動作に影響しない。仕様の契約を変更するものではないため finding には計上しない。

**TC-004 の障害注入位置:**
tasks.md は "`.specrunner/local/<slug>` を regular file に差し替える" と記述しているが、実際のテストは `.specrunner/local`（1段上）を regular file にしている。`quarantineDir` の `mkdir` が ENOTDIR で失敗する効果は同等であり、fail-closed 契約の検証として有効。
