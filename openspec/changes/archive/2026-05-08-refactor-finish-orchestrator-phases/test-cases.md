# Test Cases: runFinishOrchestrator をフェーズ関数に分割する

## 対象ファイル

`src/core/finish/orchestrator.ts`

---

## 構造検証（T4 ディスパッチャ化）

### TC-R1-STRUCT-001: runFinishOrchestrator の行数制約
- **Priority**: must
- **GIVEN** リファクタリング後の orchestrator.ts を読み込む
- **WHEN** `runFinishOrchestrator` 関数の本体行数を計測する
- **THEN** 関数本体が 80 行以下であること

### TC-R1-STRUCT-002: Phase 関数が module-private で存在する
- **Priority**: must
- **GIVEN** リファクタリング後の orchestrator.ts
- **WHEN** ファイル内のシンボルを確認する
- **THEN** `runPhase1Archive`、`runPhase2Push`、`runPhase4Finalize` の 3 関数が同ファイル内に定義されている（export されていない）こと

### TC-R1-STRUCT-003: Phase2Result 型が定義されている
- **Priority**: must
- **GIVEN** リファクタリング後の orchestrator.ts
- **WHEN** 型定義を確認する
- **THEN** `Phase2Result` 型が `{ ok: true; mergeStateAfterPush: string } | { ok: false; escalation: string; exitCode: 1 }` として定義されていること

---

## runPhase1Archive（T1）

### TC-R1-P1-001: worktree なし → checkoutFeatureBranch が呼ばれる
- **Priority**: must
- **GIVEN** `operationCwd` が `null`（worktree なし）
- **WHEN** `runPhase1Archive` を呼び出す
- **THEN** `git fetch origin <branch>` および `git checkout -B <branch> origin/<branch>` が spawn される

### TC-R1-P1-002: worktree あり → checkoutFeatureBranch がスキップされる
- **Priority**: must
- **GIVEN** `operationCwd` が有効なパス（worktree あり）
- **WHEN** `runPhase1Archive` を呼び出す
- **THEN** `git fetch` および `git checkout -B` が spawn されないこと

### TC-R1-P1-003: checkoutFeatureBranch 失敗 → ok:false を返す
- **Priority**: must
- **GIVEN** `operationCwd` が `null` かつ `git fetch` が exitCode:1 を返す
- **WHEN** `runPhase1Archive` を呼び出す
- **THEN** `{ ok: false, exitCode: 1, escalation: <string> }` を返すこと

### TC-R1-P1-004: archiveOpenspec 失敗 → ok:false を返す
- **Priority**: must
- **GIVEN** `archiveOpenspec` が `{ ok: false }` を返す
- **WHEN** `runPhase1Archive` を呼び出す
- **THEN** `{ ok: false, exitCode: 1 }` を返すこと

### TC-R1-P1-005: moveRequestsDir 失敗 → ok:false を返す
- **Priority**: must
- **GIVEN** `moveRequestsDir` が `{ ok: false }` を返す（archiveOpenspec は成功）
- **WHEN** `runPhase1Archive` を呼び出す
- **THEN** `{ ok: false, exitCode: 1 }` を返すこと

### TC-R1-P1-006: 全ステップ成功 → ok:true を返す
- **Priority**: must
- **GIVEN** checkout（またはスキップ）・archiveOpenspec・moveRequestsDir がすべて成功する
- **WHEN** `runPhase1Archive` を呼び出す
- **THEN** `{ ok: true }` を返すこと

### TC-R1-P1-007: skipped 結果に対して stdoutWrite を呼ばない
- **Priority**: should
- **GIVEN** `archiveOpenspec` が `{ ok: true, skipped: true }` を返す
- **WHEN** `runPhase1Archive` を呼び出す
- **THEN** archiveOpenspec の result.message を stdoutWrite しないこと

### TC-R1-P1-008: archiveCwd は operationCwd が優先される
- **Priority**: should
- **GIVEN** `operationCwd` が有効なパスで、`cwd` が別のパス
- **WHEN** `runPhase1Archive` を呼び出す
- **THEN** `archiveOpenspec` および `moveRequestsDir` が `operationCwd` を cwd として受け取ること

---

## runPhase2Push（T2）

### TC-R1-P2-001: push 成功 → ok:true と mergeStateAfterPush を返す
- **Priority**: must
- **GIVEN** `pushFeatureBranch` が成功し、`pollMergeStateAfterPush` が "CLEAN" を返す
- **WHEN** `runPhase2Push` を呼び出す
- **THEN** `{ ok: true, mergeStateAfterPush: "CLEAN" }` を返すこと

### TC-R1-P2-002: push 失敗 → ok:false を返す
- **Priority**: must
- **GIVEN** `git push origin <branch>` が exitCode:1 を返す
- **WHEN** `runPhase2Push` を呼び出す
- **THEN** `{ ok: false, exitCode: 1, escalation: <string> }` を返すこと

### TC-R1-P2-003: poll 後 DIRTY → ok:false でエスカレーション
- **Priority**: must
- **GIVEN** push は成功し、`pollMergeStateAfterPush` が `mergeStateStatus: "DIRTY"` を返す
- **WHEN** `runPhase2Push` を呼び出す
- **THEN** `{ ok: false, exitCode: 1, escalation: <string> }` を返し、escalation に "DIRTY" が含まれること

### TC-R1-P2-004: poll 後 DIRTY のエスカレーションに resumeCommand が含まれる
- **Priority**: must
- **GIVEN** poll が DIRTY を返す
- **WHEN** `runPhase2Push` を呼び出す
- **THEN** escalation に `specrunner finish <slug>` が含まれること

### TC-R1-P2-005: pollMergeStateAfterPush が空文字を返した場合は prViewData の mergeStateStatus を使用する
- **Priority**: should
- **GIVEN** `pollMergeStateAfterPush` が `{ mergeStateStatus: "" }` を返し、`prViewData.mergeStateStatus` が "CLEAN"
- **WHEN** `runPhase2Push` を呼び出す
- **THEN** `{ ok: true, mergeStateAfterPush: "CLEAN" }` を返すこと

### TC-R1-P2-006: push がスキップされた場合に stdout メッセージが出ない
- **Priority**: should
- **GIVEN** `pushFeatureBranch` が `{ ok: true, skipped: true }` を返す
- **WHEN** `runPhase2Push` を呼び出す
- **THEN** "Pushed ... to origin." を stdoutWrite しないこと

---

## runPhase4Finalize（T3）

### TC-R1-P4-001: worktree あり → manager.remove + prune が呼ばれる
- **Priority**: must
- **GIVEN** `operationCwd` が有効なパス（worktree あり）
- **WHEN** `runPhase4Finalize` を呼び出す
- **THEN** `manager.remove(operationCwd, cwd)` と `manager.prune(cwd)` が呼ばれること

### TC-R1-P4-002: worktree あり → updateJobState で worktreePath が null に更新される
- **Priority**: must
- **GIVEN** `operationCwd` が有効なパス
- **WHEN** `runPhase4Finalize` を呼び出す
- **THEN** `updateJobState` が `worktreePath: null` を設定して呼ばれること

### TC-R1-P4-003: worktree あり → git checkout / git pull が呼ばれない
- **Priority**: must
- **GIVEN** `operationCwd` が有効なパス
- **WHEN** `runPhase4Finalize` を呼び出す
- **THEN** `git checkout <baseBranch>` および `git pull --ff-only` が spawn されないこと

### TC-R1-P4-004: worktree なし・isOnMain=true → checkout + pull が呼ばれる
- **Priority**: must
- **GIVEN** `operationCwd` が `null`、`git rev-parse --abbrev-ref HEAD` が baseBranch と同値を返す
- **WHEN** `runPhase4Finalize` を呼び出す
- **THEN** `git checkout <baseBranch>` と `git pull --ff-only` が順番に spawn されること

### TC-R1-P4-005: worktree なし・isOnMain=false → warning 出力、checkout/pull スキップ
- **Priority**: must
- **GIVEN** `operationCwd` が `null`、`git rev-parse --abbrev-ref HEAD` が baseBranch と異なる値を返す
- **WHEN** `runPhase4Finalize` を呼び出す
- **THEN** stdoutWrite に "Warning" を含むメッセージが出力され、`git checkout` と `git pull` が spawn されないこと

### TC-R1-P4-006: git checkout 失敗 → ok:false を返す
- **Priority**: must
- **GIVEN** `operationCwd` が `null`、isOnMain=true、`git checkout <baseBranch>` が exitCode:1 を返す
- **WHEN** `runPhase4Finalize` を呼び出す
- **THEN** `{ ok: false, exitCode: 1 }` を返すこと

### TC-R1-P4-007: git pull 失敗 → ok:false を返す
- **Priority**: must
- **GIVEN** `operationCwd` が `null`、isOnMain=true、checkout は成功、`git pull --ff-only` が exitCode:1 を返す
- **WHEN** `runPhase4Finalize` を呼び出す
- **THEN** `{ ok: false, exitCode: 1 }` を返すこと

### TC-R1-P4-008: branch 削除はベストエフォート（失敗しても ok:true）
- **Priority**: must
- **GIVEN** `git branch -D` と `git push origin --delete` が両方 exitCode:1 を返す
- **WHEN** `runPhase4Finalize` を呼び出す
- **THEN** `{ ok: true }` を返すこと（branch 削除失敗で abort しない）

### TC-R1-P4-009: markJobArchived が branch 削除の後に呼ばれる
- **Priority**: must
- **GIVEN** 全ステップが成功する
- **WHEN** `runPhase4Finalize` を呼び出す
- **THEN** `markJobArchived` が呼ばれ、job の status が "archived" になること

### TC-R1-P4-010: worktree remove 失敗はベストエフォート（ok:true）
- **Priority**: should
- **GIVEN** `manager.remove` が例外をスローする
- **WHEN** `runPhase4Finalize` を呼び出す
- **THEN** `{ ok: true }` を返すこと（stderr に警告が出ること）

---

## runFinishOrchestrator ディスパッチャ（T4）

### TC-R1-DISP-001: Phase ヘッダメッセージがディスパッチャ側から出力される
- **Priority**: must
- **GIVEN** 正常系のフロー（prState=OPEN）
- **WHEN** `runFinishOrchestrator` を呼び出す
- **THEN** `"Phase 1: archive on feature branch ..."` のメッセージが stdoutWrite から出力されること

### TC-R1-DISP-002: Phase 1 失敗時は Phase 2-4 が実行されない
- **Priority**: must
- **GIVEN** `git fetch` が失敗する（Phase 1 エラー）
- **WHEN** `runFinishOrchestrator` を呼び出す
- **THEN** exitCode:1 で返り、`git push`、`gh pr merge`、`markJobArchived` が呼ばれないこと

### TC-R1-DISP-003: Phase 2 から mergeStateAfterPush が Phase 3 に渡される
- **Priority**: must
- **GIVEN** push 後の poll で "BLOCKED" が返る
- **WHEN** `runFinishOrchestrator` を呼び出す
- **THEN** `gh pr merge` が `--admin` フラグ付きで呼ばれること

### TC-R1-DISP-004: Phase 4 はプリマージ済みの場合でも実行される
- **Priority**: must
- **GIVEN** PR の state が "MERGED"（Phase 1-3 スキップ対象）
- **WHEN** `runFinishOrchestrator` を呼び出す
- **THEN** Phase 4（worktree cleanup / checkout / markJobArchived）が実行され、exitCode:0 で返ること

---

## 振る舞い不変性の確認（既存 TC の継続）

> 以下は既存テストが引き続きパスすることを確認するシナリオ。
> リファクタリング後も TC-101〜TC-WT-FIN-003 のすべてが green であること。

### TC-R1-COMPAT-001: TC-123 正常フロー（archive あり、CLEAN）が通過する
- **Priority**: must
- **GIVEN** 既存 TC-123 と同じセットアップ（changeFolderExists=true、prState=OPEN、CLEAN）
- **WHEN** `runFinishOrchestrator` を呼び出す
- **THEN** exitCode:0、Phase 0-4 のメッセージがすべて出力される

### TC-R1-COMPAT-002: TC-106 プリマージ済み PR → Phase 1-3 スキップ
- **Priority**: must
- **GIVEN** PR state が "MERGED"
- **WHEN** `runFinishOrchestrator` を呼び出す
- **THEN** `openspec archive` と `gh pr merge` が呼ばれず、exitCode:0

### TC-R1-COMPAT-003: TC-125 Phase 1 エスカレーション → markJobArchived 未呼び出し
- **Priority**: must
- **GIVEN** git fetch が失敗
- **WHEN** `runFinishOrchestrator` を呼び出す
- **THEN** exitCode:1、job の status が "awaiting-merge" のまま（archived に変わらない）

### TC-R1-COMPAT-004: TC-WT-FIN-001 worktreePath あり → Phase 1 checkout なし、Phase 4 worktree 削除
- **Priority**: must
- **GIVEN** state に worktreePath が設定されている
- **WHEN** `runFinishOrchestrator` を呼び出す
- **THEN** `git checkout -B` が呼ばれず、mockManager.remove が worktreePath で呼ばれる

### TC-R1-COMPAT-005: TC-DIRTY-001 DIRTY mergeStateStatus → merge 未実行のエスカレーション
- **Priority**: must
- **GIVEN** push 後の poll が DIRTY を返す
- **WHEN** `runFinishOrchestrator` を呼び出す
- **THEN** exitCode:1、escalation に "DIRTY" が含まれ、`gh pr merge` が呼ばれない

### TC-R1-COMPAT-006: TC-126 status=archived → Already archived ノーオペレーション
- **Priority**: must
- **GIVEN** state.status が "archived"
- **WHEN** `runFinishOrchestrator` を呼び出す
- **THEN** exitCode:0、"Already archived" メッセージが出力される

### TC-R1-COMPAT-007: bun run typecheck && bun run test が全 green
- **Priority**: must
- **GIVEN** T1-T4 のリファクタリングが完了した状態
- **WHEN** `bun run typecheck && bun run test` を実行する
- **THEN** 型エラーなし、全テスト pass
