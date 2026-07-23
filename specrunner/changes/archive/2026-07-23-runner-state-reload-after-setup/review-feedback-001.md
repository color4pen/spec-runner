# Code Review Feedback — iteration 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### Diff / 実装確認

- `git diff main...HEAD --stat`: 実装ファイル 4 本（runner.ts, local.ts, managed.ts, runtime-strategy.ts）+ テスト 2 本（runner-reload-after-setup.test.ts, runner-reload-egress-e2e.test.ts）+ runner.test.ts 4 行追加
- `src/core/command/runner.ts`: 手動 mirror ブロック（旧 169–181 行）が削除済みであること、reload ブロックが setupWorkspace 成功後に配置されていることを確認
- `src/core/runtime/local.ts:864–868`: `reloadJobState` 実装を確認。`workspace.worktreePath ?? this.cwd` で stateRoot を導出し `JobStateStore.load()` を呼ぶ。エラーは呼び出し元に伝搬（swallow なし）
- `src/core/runtime/managed.ts:579–591`: `reloadJobState` が `throw new Error(...)` で実装されていることを確認（D3 通り）
- `src/core/port/runtime-strategy.ts`: `RuntimeStrategy` にオプショナル、`RealRuntimeStrategy` に必須として追加済みを確認

### Test 確認

- **TC-010** (runner-reload-after-setup.test.ts): 実 `JobStateStore` + `LocalRuntime` で synthesizedCommits が store から返ることを確認 ✓
- **TC-011** (runner-reload-after-setup.test.ts): `reloadJobState` が reject すると `pipeline.run()` が呼ばれず exit code 1 を確認 ✓
- **TC-012** (runner-reload-after-setup.test.ts): reviewers / noWorktree / issueNumber が reload 後も保持されることを確認 ✓
- **TC-020** (runner-reload-after-setup.test.ts): worktreePath が stateRoot に使われることを確認 ✓
- **TC-022** (runner-reload-after-setup.test.ts): ManagedRuntime が throw することを確認 ✓
- **TC-013** (runner-reload-egress-e2e.test.ts): 実 git + 実 store で bootstrap → reload → synthesizedCommits を確認。**Step 8 の verifyEgressLedger アサーションは vacuous（後述 F1）** ✓/△
- **TC-014** (runner-reload-egress-e2e.test.ts): runner が reload 由来 state を pipeline に渡すことを sentinel OID でシールしていることを確認 ✓
- **TC-015** (runner-reload-egress-e2e.test.ts): halt-path persist が synthesizedCommits を null に退行させないことを確認 ✓
- **runner.test.ts TC-CR-008**: `reloadJobState` を返す fake で worktreePath が pipeline に届くことを確認 ✓

### 受け入れ基準の充足状況

| 基準 | 状況 | 根拠 |
|------|------|------|
| 実 store + 実 git の統合テスト: EGRESS_UNKNOWN_COMMIT なし | △ | TC-013 step 6 で synthesizedCommits の在在を確認。step 8 の verifyEgressLedger は trivially pass（F1 参照） |
| synthesizedCommits に bootstrap OID を直接 assert | ✓ | TC-013 step 6 |
| runner.ts 手動 mirror 削除・reload に置換 | ✓ | diff 確認済み |
| reviewers / noWorktree / issueNumber が reload 後も保持 | ✓ | TC-012 |
| reload 失敗で run が開始されない (fail-closed) | ✓ | TC-011 |
| 破壊確認として記録 | ✓ | DESTROY コメント各 TC に記載（bite-evidence は tooling 制限で deferred） |
| 既存テストは無改変で green | ✓ | verification-result.md: 626 ファイル全 green |
| typecheck && test が green | ✓ | verification-result.md |

---

## 検証できなかった項目

- bite-evidence 実行（bite-evidence-result.md: strategy-deferred — scoped verification 未設定）
- managed runtime の実際の新規 run 動作（managed runtime テストは runner 経由の新規 run path を踏まない構成）

---

## Findings 詳細

### F1 [should]: TC-013 step 8 の verifyEgressLedger アサーションが vacuous — コメントが事実誤りである

**場所**: `tests/unit/core/runtime/runner-reload-egress-e2e.test.ts` L238–259

**観測**:

TC-013 step 7 で `git push origin E2E_BRANCH` を実行すると、bootstrap commit とその上に積まれた step commit の両方が origin に到達する。その後 step 8 で `verifyEgressLedger` を呼ぶと `git rev-list HEAD --not --remotes=origin` は空リストを返す（全 commit が push 済み）。verifyEgressLedger のチェックは「unpushed commit が全て ledger に含まれるか」なので、unpushed が 0 件であれば ledger が null でも通過する。

step 8 のコメント:
```
// After pushing the step commit, only the bootstrap commit remains in the "unpushed" set.
```
これは誤りである。step 7 の push は E2E_BRANCH の全 commit（bootstrap + step）を origin に送るため、push 後の unpushed set は空になる。

**影響**:

`reloadJobState` を無効化（store 読取りを bootstrapState 返却に差し替え）しても step 8 は通過する。「EGRESS_UNKNOWN_COMMIT なしで通ることを固定する」という受け入れ基準の egress レベルでのシールが TC-013 単体では成立しない。

ただし、シールの論理的な連鎖は成立している:
- **TC-013 step 6**: `reloadedState.synthesizedCommits` に bootstrap OID が含まれる（DESTROY: reloadJobState 破壊 → fail）
- **TC-014**: runner が reload 由来 state を pipeline に渡す（DESTROY: reload 呼び出し削除 → fail）
- **論理的帰結**: pipeline が受け取る state の synthesizedCommits に bootstrap OID が存在するため、実際の push 前に verifyEgressLedger が呼ばれれば EGRESS_UNKNOWN_COMMIT は発生しない

**推奨対応**: step 8 のコメントを実態に合わせて修正する。または、step 7 で step commit のみを push した後（bootstrap は未 push のまま）に `verifyEgressLedger` を呼ぶよう順序を変更し、bootstrap commit が unpushed set に含まれる状態で egress チェックが通ることを実際に検証する。

---

### F2 [should]: managed runtime 新規 run の blocking behavior がどこにも明示的に記録されていない

**場所**: `src/core/runtime/managed.ts`, `src/core/command/runner.ts:176`

**観測**:

`ManagedRuntime.reloadJobState` は常に throw する。runner.ts は `existingWorktreePath === undefined`（新規 run）のとき `reloadJobState` を呼ぶため、managed runtime の全新規 run が fail-closed で exit code 1 になる。

設計として D3 で明示されており、request.md スコープ外にも「managed runtime の同型確認は別 request」と記載されている。fail-closed の挙動は一貫している。

ただし以下の点が残る:
- 受け入れ基準（request.md）に「managed runtime の新規 run が停止する」という記述がない
- runner 経由で managed runtime の新規 run が fail-closed になることを直接封鎖するテストが存在しない（TC-022 は ManagedRuntime.reloadJobState が throw することを検証するが、runner path は未封鎖）
- managed runtime ユーザーへのエラーメッセージは `logError("Failed to reload job state after workspace setup: reloadJobState not implemented for managed runtime")` のみ

**推奨対応**: 対応必須ではないが、managed runtime 新規 run の fail-closed を runner 経由で検証する minimal test を追加するか、この behavior 変更を change log / design.md に明示的に記録すること。

---

### F3 [info]: resume path skip guard が tasks.md T-04 の仕様に記載されていない

**場所**: `src/core/command/runner.ts:176`, `tasks.md T-04`

**観測**:

tasks.md T-04 は `if (this.runtime.reloadJobState) {` と指定しているが、実装は
```ts
if (this.runtime.reloadJobState && workspaceOpts.existingWorktreePath === undefined) {
```
という resume path skip を追加している。

この guard は論理的に正しい（resume `prepare()` は既に full state をロードしており、`existingWorktreePath === undefined` で新規 run のみを対象にする）。`WorkspaceOptions.existingWorktreePath` の型定義（`undefined` = 未設定/新規 run、`null` = no-worktree resume、`string` = worktree resume）により三値が正しく区別される。

ただし:
- guard そのものの dedicated test が存在しない
- guard を削除しても、resume path で `reloadJobState` を呼ぶことの悪影響（managed runtime が常に throw する設計では resume も止まる）を検出するテストがない

実害は現時点では小さいが、仕様逸脱として記録する。

---

### F4 [info]: TC-021（no-worktree uses cwd）が名前付きテストとして未実装

**場所**: `test-cases.md TC-021`, `runner-reload-after-setup.test.ts`

**観測**:

TC-021（"should" 優先度）「LocalRuntime — no-worktree mode では cwd を stateRoot に使う」は名前付きテストとして実装されていない。TC-010 が `workspace.worktreePath` なしの workspace を使うため暗黙的にカバーされているが、"stateRoot = cwd" という命題を明示的にアサートするテストが存在しない。

TC-002（mirror code is absent）・TC-023（optional method for test fakes）も同様に "should" 優先度で名前付きテストが未実装。blocking ではない。
