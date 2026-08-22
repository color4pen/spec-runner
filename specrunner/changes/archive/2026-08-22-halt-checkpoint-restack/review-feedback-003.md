# Code Review Feedback: halt-checkpoint-restack (Iteration 3)

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### 読んだファイル・diff

| ファイル | 確認内容 |
|---|---|
| `specrunner/changes/halt-checkpoint-restack/design.md` | D1–D8 全 design decision を通読 |
| `specrunner/changes/halt-checkpoint-restack/tasks.md` | T-01〜T-09 全 task と AC を確認 |
| `specrunner/changes/halt-checkpoint-restack/test-cases.md` | TC-001〜TC-039 全 39 件の category/priority/source を確認 |
| `src/core/step/checkpoint-restack.ts` | 全文通読（596 行）。Step 0〜11 + `_doGraft` の実装を D1–D8 と照合 |
| `src/core/step/commit-push.ts` (lines 770–939) | `commitFinalState` の push 失敗後段 restack 接続と `messageLabel === "checkpoint"` ガードを確認 |
| `src/core/runtime/local.ts` (lines 740–798) | `recordRestack` / `persistBeforePush` コールバック注入を確認 |
| `src/store/event-journal.ts` | `CheckpointRestackRecord` 型・`EventRecord` union への追加・`fold()` dispatch・`FoldResult.checkpointRestacks?` optional フィールドを確認 |
| `src/store/job-journal.ts` | `appendCheckpointRestack` メソッド追加を確認 |
| `src/store/job-state-store.ts` | `appendCheckpointRestack` 委譲を確認 |
| `src/core/step/__tests__/checkpoint-restack.test.ts` | TC-002/004/009/010/012/016/017/018/019/020/021/022/023/024/028/029/030/031/032/037 の各 describe ブロックを通読 |
| `src/core/step/__tests__/commit-push-restack-integration.test.ts` | TC-033/026/039 を通読 |
| `src/store/__tests__/event-journal-checkpoint-restack.test.ts` | TC-008/014/015 を通読 |
| `tests/halt-checkpoint-restack-e2e.test.ts` | TC-001/003/007/011/027/005 happy-path + TC-009 all-reject + TC-038 Runner B divergence の 3 describe を全文通読 |
| `src/core/verification/changed-lines.ts` | diff を通読（out-of-scope change の確認） |
| `git diff main...HEAD --stat` | 変更スコープを確認 |

### 確認した設計・実装の整合性

- **D1 (push-success path 不変)**: `restackCheckpointOntoPublishedTip` は push 二重失敗後のみ呼ばれる。成功経路の `spawnFn` 呼び出し列は構造的に変化しない ✓
- **D3 (temp index, worktree 不変)**: `GIT_INDEX_FILE` env が tree-building 5 操作に限定され、`commit`/`add`/`checkout`/`reset`/`stash`/`merge` が非発行であることを TC-028 が明示的に assert ✓
- **D4 (封じ込め検査)**: `git diff --name-only <parentOid> <restackedOid>` を `commit-tree` 後に実行し、`changeDir/` 外パスで push をブロック。TC-004 が violation path を固定 ✓
- **D5 (journal-before-tree)**: `recordRestack` が Step 3 で呼ばれ、Step 4 の `read-tree` より前であることを TC-016 が call-index inspection で確認 ✓
- **D6 (graft)**: merge commit の tree = `HEAD^{tree}` (local 保持)、parents = [localHead, restackedOid]。compare-and-swap `update-ref` が安全。TC-022/023/011 で ancestry を検証 ✓
- **D7 (callback injection)**: `recordRestack` / `persistCommit` の throw が内部 catch され後続に波及しない。TC-018/019 で固定 ✓
- **D8 (ancestor guard)**: `git merge-base --is-ancestor <parentOid> <localTipOid>` が Step 2.5 に置かれ、journal append より前。TC-037 (unit) + TC-038 (E2E) で divergence skip を固定 ✓

### 受け入れ条件の確認

| 受け入れ条件 | 対応 TC | 確認結果 |
|---|---|---|
| 作業 commit push 拒否 → awaiting-resume quiescent checkpoint が publish される | TC-001/003 E2E | ✓ |
| attach 検証が成立し、拒否 step から resume できる | TC-005 E2E | ✓ |
| 積み直し push も失敗しても throw せず warn で継続 | TC-009 E2E, TC-021 unit | ✓ |
| push 成功の通常経路は既存テスト無変更で green | TC-013 via unchanged `commit-push-egress-invariant.test.ts` | ✓ |
| `typecheck && test` が green | TC-034/035 gate TCs, verification-result.md | ✓ |

## 検証できなかった項目

- `bun run test` の実際の実行結果（verification-result.md の内容は存在を確認したが実行はしていない。gate TCs は verification フェーズでの green を前提としている）

## Findings 詳細

### F-01: TC-006 明示的な unit test ラベルが存在しない

**Category**: low, fixable

TC-006 は test-cases.md で "must" "unit" として宣言されている（scenario: "journal が state.json の counters を巻き戻していない"）。しかしいずれのテストファイルにも "TC-006" ラベルが存在しない。

*機能的カバレッジは zero ではない*: TC-014-e が `fold()` に `checkpoint-restack` 追記後の `historyCount`/`stepCounts` 不変を unit で固定し、TC-005 E2E が `runAttachVerification` → `verifyCheckpoint` → `detectCounterReversal` を実際に通過させている。

ただし traceability の観点では `detectCounterReversal` を直接呼ぶ unit test が存在しないため、将来の `detectCounterReversal` 改修で `checkpoint-restack` が誤って計上された場合、最初に検出されるのは unit test ではなく E2E になる。

**推奨**: `event-journal-checkpoint-restack.test.ts` に TC-006 describe を追加し、`detectCounterReversal(existingCounters, foldResult)` が `null` を返すことを直接 assert する。

---

### F-02: 仕様スコープ外の変更が PR に混在している

**Category**: low, decision-needed

`src/core/verification/changed-lines.ts`（60 行変更）および `tests/unit/core/verification/changed-lines-origin-fallback.test.ts`（234 行追加）は `request.md`・`tasks.md`・`spec.md`・いずれの step touched-files にも記載がない。

変更内容は `baseBranch` が local ref として存在しない worktree 環境で `origin/<baseBranch>` へ fallback する挙動の追加であり、実装・テストとも正しい。しかし spec 上の根拠がなく、この PR の conformance 検証対象外となっているため、将来の仕様追跡で見落とされるリスクがある。

**オプション**:
- **Accept as-is**: 変更は小さく、自己完結し、テスト付き。worktree 環境を主用途とする specrunner では自然な修正として受け入れることができる。
- **別 PR に分離**: `changed-lines-worktree-fallback` として独立した request.md / tasks.md を持つ change を作成し、完全な仕様トレーサビリティを確保する。

---

## Positive observations

- **D4 封じ込め検査の二重性**: tree 構築方法（D3）と実行時の diff 検査（D4）が独立して containment を保証している。実装バグによる情報漏洩を二重で防ぐ設計が実装レベルでも維持されている。

- **`checkpoint-restack` record の optional field 設計**: `FoldResult.checkpointRestacks?` を optional にすることで、既存の手書き `FoldResult` リテラル（`job-journal.ts:134` 等）を一切変更せずに型チェックが通る。TC-034 gate が typecheck green を構造的に保証する。

- **TC-038 E2E の設計**: Runner B が先行した状態で Runner A の restack が `remote-diverged` で skip し、origin の tree が変化しないことを実 git 2-clone で固定している。ancestor guard (D8) の "MUST NOT overwrite" 要件を最も現実に近い形で証明している。

- **graft の安全性**: `update-ref <refs/heads/branch> <mergeOid> <localHead>` は compare-and-swap であり、外部プロセスが同時に branch を進めた場合は失敗して `graft: "failed"` を返すだけで publish 済み結果は維持される。

- **`no-delta` check**: `write-tree` OID と `parentOid^{tree}` が一致した場合に push をスキップすることで、change folder に実質的差分がない場合の不要 push を防いでいる。TC-020 が固定。

