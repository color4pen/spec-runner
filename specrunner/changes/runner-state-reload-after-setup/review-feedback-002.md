# Code Review Feedback — iteration 2

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### operator 適用内容の確認（最新 commit 1bf50a995）

| 対応項目 | 変更内容 |
|---------|---------|
| F1 (egress vacuous) | `runner-reload-egress-e2e.test.ts` +32/-8行: TC-013 を push 前検証に並べ替え、否定方向 (bootstrap OID 欠落 → EGRESS_UNKNOWN_COMMIT) + 肯定方向の両 assert を追加 |
| F2 (managed blocking 未記録) | `design.md` +4行: D3 に「明示的な挙動変更」として managed 新規 run の fail-closed 停止と TC-022×TC-011 合成封鎖を明記 |

### TC-013 修正後の egress 検証（F1 対応）の正確性確認

- **Step 7**: worktree に `src/impl.ts` を add → commit (`step: implementer`)。push は行わない
- **Step 7 時点の unpushed range** (`git rev-list HEAD --not --remotes=origin` in worktree): bootstrap commit + step commit の両方が含まれる ✓
- **Step 8a (否定方向)**: `verifyEgressLedger({ ledger: [stepOid] })` — bootstrap OID が unpushed range にあるがledger にない → `EGRESS_UNKNOWN_COMMIT` throw を期待してアサート ✓
  - これは mado-os 実発現 (in-memory state に bootstrap OID がない) の egress 段再現
- **Step 8b (肯定方向)**: `verifyEgressLedger({ ledger: [...reloadedState.synthesizedCommits!, stepOid] })` — 全 unpushed commit がledger に含まれる → resolve を期待 ✓
- `workspace-materializer.ts` `new-run` arm (L213-242) は bootstrap commit を push しない（push はパイプラインステップが担う）ため、setup 後 push 前にこのテストが走る形は production 形状と一致する ✓

### design.md D3 修正後の内容確認（F2 対応）

`design.md` D3 に追加された内容:
> **明示的な挙動変更(code-review F2)**: この選択により、managed runtime の**新規 run は setup 直後に exit code 1 で停止する**(reload 検証が別 request で完了するまで)。封鎖は TC-022(ManagedRuntime.reloadJobState が throw する)× TC-011(runner は reload の throw を fail-closed に扱い pipeline を開始しない)の合成で担保する。

TC-022 × TC-011 合成による managed 新規 run の fail-closed 封鎖が設計文書に記録された ✓

### 受け入れ基準の充足状況

| 基準 | 状況 | 根拠 |
|------|------|------|
| 実 store + 実 git で EGRESS_UNKNOWN_COMMIT なし固定 | ✓ | TC-013 step 8b: push 前に reloaded ledger + step commit で egress pass |
| synthesizedCommits に bootstrap OID を in-memory 経路で直接 assert | ✓ | TC-013 step 6: `reloadJobState()` 戻り値を直接アサート（store 直読でない） |
| runner.ts 手動 mirror 削除・reload に置換 | ✓ | runner.ts L170-196 確認済み |
| reviewers / noWorktree / issueNumber が reload 後も保持 | ✓ | TC-012 |
| reload 失敗で run が開始されない (fail-closed) | ✓ | TC-011 |
| 破壊確認として記録 | ✓ | TC-010/TC-013/TC-014 の DESTROY コメント |
| 既存テストは無改変で green | ✓ | verification-result.md: 全 green |
| typecheck && test が green | ✓ | verification-result.md: 全フェーズ passed |

---

## 検証できなかった項目

- bite-evidence 実行（bite-evidence-result.md: strategy-deferred — scoped verification 未設定）
- managed runtime の runner 経由 新規 run の fail-closed を runner 経路で直接確認するテスト（TC-022 × TC-011 合成封鎖で代替されている）

---

## Findings 詳細

### F3 [info]: resume path skip guard の専用テストが存在しない（前回から継続）

**場所**: `src/core/command/runner.ts:176`

**観測**: `if (this.runtime.reloadJobState && workspaceOpts.existingWorktreePath === undefined)` の `existingWorktreePath === undefined` 条件を除去しても既存テストで検出されない。`tasks.md T-04` の仕様記述にこの条件が含まれていない（実装が仕様を超えている）。

設計として正しい（resume 時は `prepare()` が既に full state をロードしており再 reload は不要。managed runtime が常に throw する設計では条件なしでは resume も止まる）。blocking なし。

---

### F4 [info]: TC-021 / TC-002 / TC-023 が named test として未実装（前回から継続）

**観測**: `test-cases.md` で定義された TC-021（no-worktree uses cwd）・TC-002（mirror code absent）・TC-023（optional method for test fakes）が named test として実装されていない。いずれも暗黙的にカバーされている:
- TC-021: TC-010 が `workspace.worktreePath` なしの workspace を使い同じ stateRoot derivation を通る
- TC-002: diff 確認 + runner.test.ts TC-CR-008 の reloadJobState mock で間接的にカバー
- TC-023: reloadJobState を持たない既存 runner.test.ts fakes が optional-chain により影響なし

"should"/"info" 優先度。blocking なし。
