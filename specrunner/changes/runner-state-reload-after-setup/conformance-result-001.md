# Conformance Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### spec.md Requirements (SHALL/MUST)

**R-1: State reload after setupWorkspace**
- `src/core/command/runner.ts:170-196` — reload block present; grep で `jobState.worktreePath = workspace.worktreePath` / `jobState.branch = workspace.branch` が存在しないことを確認。旧 mirror block は完全に削除されている。
- `let { jobState } = prepared` at line 118 — `let` 宣言を確認。line 178 での再代入は有効。
- `pipeline.run(startStep, jobState, deps)` at line 252 — 再代入後の `jobState` がそのまま渡される。

**R-2: Reload failure is fail-closed**
- `runner.ts:179-195` — catch block が `transitionJob(..., "failed", ...)` → persist → return 1 を行う。pipeline.run() に到達しない。
- TC-011 がこのパスを封鎖: `pipelineRunSpy` が未呼び出しかつ `execute()` が 1 を返すことをアサート。

**R-3: In-memory-only fields preserved**
- TC-012 が `reviewers`, `noWorktree`, `issueNumber` + `synthesizedCommits` + `branch` の全保持を検証。
- `LocalRuntime.reloadJobState` はマージロジックを持たない純粋な store.load() — D5 の構造的保証に依拠。

**R-4: Halt-path persist does not revert synthesizedCommits**
- TC-015 が halt-path persist → 再 reload のサイクルで `synthesizedCommits` が保持されることを検証。

### tasks.md (全チェックボックス)

T-01 〜 T-07 のすべてのチェックボックスが `[x]` であることを確認。

### design.md (D1〜D5)

**D1**: `RuntimeStrategy` に `reloadJobState?`（optional, line 609）、`RealRuntimeStrategy` に非 optional として追加（line 755）— 確認済み。

**D2**: `local.ts:864-869` — `stateRoot = workspace.worktreePath ?? this.cwd`; `JobStateStore` 構築; エラー非捕捉。cast サイトにコメント `// Safe cast: steps is always {} at reload point` — 確認済み。TC-020 で worktreePath 優先が検証されている。

**D3**: `managed.ts:591-593` — `throw new Error("reloadJobState not implemented for managed runtime")` — 確認済み。TC-022 で封鎖。

**D4**: mirror block 削除、reload + fail-closed block 追加 — 確認済み。
- **観察**: 実装は `if (this.runtime.reloadJobState && workspaceOpts.existingWorktreePath === undefined)` と resume path を除外する条件を追加している。D4 の仕様は `if (this.runtime.reloadJobState)` のみ。詳細は F-002 参照。

**D5**: `reloadJobState` にマージロジックなし — 構造的保証に依拠。TC-012 で検証。

### request.md 受け入れ基準

| # | 受け入れ基準 | 確認結果 |
|---|------------|---------|
| AC-1 | 実 store + 実 git の統合テスト（手動 seed なし） | ✅ TC-013 — 実 `spawnFn` + 実 `setupWorkspace()` + 手動 seed なしで確認 |
| AC-2 | in-memory 経路での synthesizedCommits 直接 assert | ✅ TC-013 step 6 (reloadJobState の戻り値を直接 assert) + TC-014 (pipeline に渡る state を capture して sentinel OID を assert) |
| AC-3 | runner.ts の worktreePath/branch 手動 mirror 削除 + reload 置換 | ✅ mirror 行なし、reload block あり |
| AC-4 | reviewers/noWorktree/issueNumber の保持テスト | ✅ TC-012 |
| AC-5 | reload 失敗 → run 非開始（fail-closed）テスト | ✅ TC-011 |
| AC-6 | 修正前の挙動に戻すと封鎖テストが fail することを破壊確認として記録 | ⚠️ DESTROY コメントが test ファイルに存在しない（F-001） |
| AC-7 | 既存テスト無改変で green | ✅ verification-result.md: 9266 tests passed |
| AC-8 | typecheck && test が green | ✅ verification-result.md: 全 phase passed |

### 追加確認

- `runner.test.ts:330` — TC-CR-008 が `reloadJobState` mock を追加しており、既存テストが新しい reload パスに適応していることを確認。
- `tests/unit/core/command/runner.test.ts` 以外の既存テストファイルは変更なし — T-07 の受け入れ基準を満たす。

## 検証できなかった項目

- **TC-013b (tasks.md) と TC-014 (実装) の対応確認**: tasks.md の TC-013b の spec comment `"(spec-review F-02)"` は実装のコメントに引き継がれていないが、TC-014 の実装内容（runner 経路の封鎖）は tasks.md の TC-013b の意図と一致しており、機能的には等価と判断。
- **verification.md の test 出力に新テストの個別 pass ログが含まれていないため**: 新テストファイルが実行されたことは「626 test files passed」から間接的に確認（test file 数が増加しているはず）。直接の pass ログは省略されているが、all-passed を信頼。

## Findings 詳細

### F-001 — DESTROY sabotage comments absent from seal test files

tasks.md で TC-011 / TC-013 / TC-013b に DESTROY コメントを明示することが指定されていた。受け入れ基準 AC-6 の「破壊確認として記録する」の標準機構はこの DESTROY コメントパターンである（`bootstrap-egress-ledger-wm.test.ts` 等でも同パターンが使われている）。

テスト自体はシール機能を持つ（TC-013 は `LocalRuntime.reloadJobState` を破壊すると fail、TC-014 は runner.ts の reload 呼び出しを削除すると fail）。しかし DESTROY コメントによる文書化が欠如している。

tasks.md 定義の DESTROY コメント内容:
- **TC-011**: "DESTROY: remove the `reloadJobState` call in runner.ts (restore mirror) → this test still passes because it tests the fail-closed path only. The sealing test is TC-013."
- **TC-013**: "DESTROY: `LocalRuntime.reloadJobState()` の実装を破壊する → step 6 の synthesizedCommits assert が fail する。注意: 本 TC は runtime 層のテスト…"
- **TC-013b**: "DESTROY: runner.ts の `reloadJobState` 呼び出しを削除し旧 mirror を復元する → capture した state に sentinel が含まれず TC-013b が fail する。"

**修正対象**: `tests/unit/core/runtime/runner-reload-after-setup.test.ts` (TC-011) および `tests/unit/core/runtime/runner-reload-egress-e2e.test.ts` (TC-013, TC-013b/TC-014)

### F-002 — Resume-path guard undocumented in design

`runner.ts:176`:
```typescript
if (this.runtime.reloadJobState && workspaceOpts.existingWorktreePath === undefined) {
```

design.md D4 には `if (this.runtime.reloadJobState)` のみ指定されており、`existingWorktreePath === undefined` の条件は設計書に記載されていない。実装の意図（resume path では `prepare()` が既に store から full state をロード済みのため reload は不要）は合理的だが、design.md に根拠が存在しない。

将来の実装者がこの条件を誤って削除した場合、resume path での二重 reload が発生する可能性がある。design.md の D4 に注釈を加えるか、runner.ts のコメントに設計根拠を明記することが望ましい。

**修正対象**: design.md (D4 への注釈追加) または runner.ts のコメント強化
