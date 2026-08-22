# Code Review Feedback — halt-checkpoint-restack — iter 1

<!-- verdict は CLI が report_result の typed findings から導出する。この file には書かない。 -->

## 検証した項目

### 読んだファイル

| ファイル | 確認ポイント |
|---|---|
| `src/core/step/checkpoint-restack.ts` | 全体（567 行）。D1–D8 の各設計決定の実装を追跡 |
| `src/core/step/commit-push.ts` (diff) | push double-failure 後段への restack 接続。egress failure の early return を確認 |
| `src/core/runtime/local.ts` (diff) | `recordRestack` / `persistBeforePush` callback の組み立て |
| `src/store/event-journal.ts` (diff) | `CheckpointRestackRecord` 型、`EventRecord` union 拡張、`FoldResult.checkpointRestacks` optional field、`fold()` dispatch |
| `src/store/job-journal.ts` (diff) | `appendCheckpointRestack` → `_appendRecord` 委譲 |
| `src/store/job-state-store.ts` (diff) | `appendCheckpointRestack` の公開 |
| `src/core/step/__tests__/checkpoint-restack.test.ts` | 全体（831 行）。TC カバレッジを test-cases.md と照合 |
| `tests/halt-checkpoint-restack-e2e.test.ts` | 全体（557 行）。TC カバレッジを照合 |
| `specrunner/changes/halt-checkpoint-restack/design.md` | D1–D8、Risks/Trade-offs を精査 |
| `specrunner/changes/halt-checkpoint-restack/spec.md` | 6 Requirements / 10 Scenarios の SHALL/MUST/MUST NOT を確認 |
| `specrunner/changes/halt-checkpoint-restack/tasks.md` | T-01〜T-08 の acceptance criteria と実装照合 |
| `specrunner/changes/halt-checkpoint-restack/test-cases.md` | TC-001〜TC-036 の Category/Priority/Source と実装済みテストとの対応表を作成 |

### TC カバレッジ照合

| TC | Priority | Test file | 判定 |
|---|---|---|---|
| TC-001 (int) | must | e2e | ✓ |
| TC-002 (unit) | must | checkpoint-restack.test.ts | ✓ |
| TC-003 (int) | must | e2e | ✓ |
| TC-004 (unit) | must | checkpoint-restack.test.ts | ✓ |
| TC-005 (int) | must | e2e | ✓ |
| TC-006 (int) | must | TC-005 e2e で間接カバレッジ（attach 検証内部で counter reversal が検査） | △ |
| TC-007 (int) | must | e2e | ✓ |
| TC-008 (unit) | must | **なし** | ✗ |
| TC-009 (unit) | must | e2e (partial) + TC-021 unit | ✓ |
| TC-010 (unit) | must | TC-018 unit（recordRestack reject） | ✓ |
| TC-011 (int) | must | e2e | ✓ |
| TC-012 (unit) | must | checkpoint-restack.test.ts | ✓ |
| TC-013 (unit) | must | 既存 commit-push-egress-invariant.test.ts TC-003 回帰 | △ |
| TC-014 (unit) | must | **なし** | ✗ |
| TC-015 (unit) | must | **なし** | ✗ |
| TC-016 (unit) | must | checkpoint-restack.test.ts | ✓ |
| TC-017 (unit) | must | checkpoint-restack.test.ts | ✓ |
| TC-018 (unit) | must | checkpoint-restack.test.ts | ✓ |
| TC-019 (unit) | must | checkpoint-restack.test.ts | ✓ |
| TC-020 (unit) | must | checkpoint-restack.test.ts | ✓ |
| TC-021 (unit) | must | checkpoint-restack.test.ts | ✓ |
| TC-022 (unit) | must | checkpoint-restack.test.ts | ✓ |
| TC-023 (unit) | must | checkpoint-restack.test.ts | ✓ |
| TC-024 (unit) | must | checkpoint-restack.test.ts | ✓ |
| TC-025 (unit) | must | 既存 commit-push-egress-invariant.test.ts TC-003 回帰（strict sequence 一致） | △ |
| TC-026 (unit) | should | **なし** | ✗ (should) |
| TC-027 (int) | must | e2e（`persistedOids` callback proxy） | ✓ |
| TC-028 (unit) | must | checkpoint-restack.test.ts | ✓ |
| TC-029 (unit) | must | checkpoint-restack.test.ts | ✓ |
| TC-030 (unit) | should | checkpoint-restack.test.ts | ✓ |
| TC-031 (unit) | should | checkpoint-restack.test.ts | ✓ |
| TC-032 (unit) | must | checkpoint-restack.test.ts | ✓ |
| TC-033 (unit) | must | 「already covered by commitFinalState test」コメントのみ（明示 spy なし） | △ |
| TC-034 (gate) | must | verification-result.md: typecheck passed | ✓ |
| TC-035 (gate) | must | verification-result.md: test passed | ✓ |
| TC-036 (gate) | must | git diff 確認: 既存テストファイル変更なし | ✓ |

凡例: ✓ = 明示テスト実装済み / △ = 間接カバレッジ / ✗ = 未実装

### 実装正確性の確認

- **D1（success path 不変）**: egress 失敗 early return（`commit-push.ts` line 874 `return`）より後に restack を配置。push 1 回目成功経路では line 881 `if (...=== 0) return` で即 return しており、restack は呼ばれない。✓
- **D3（plumbing only）**: `GIT_INDEX_FILE` env overlay が `read-tree`/`ls-tree`/`update-index`/`hash-object`/`write-tree` に適用されていることを TC-028 が invariant として固定。`add`/`commit`/`checkout`/`reset`/`stash`/`merge` の発行なし。✓
- **D4（containment）**: `git diff --name-only <parentOid> <restackedOid>` の結果から change folder 外のパスを検出して `containment-violation`。`verifyEgressLedger` が restack commit を対象としない（HEAD-reachable のみ）ため専用検査が必要であることを設計が正確に説明。✓
- **D5（journal before tree）**: Step 3（`recordRestack` callback）が Step 4（`read-tree` 以降の tree 構築）より前。ただし `localTipFailed` の early-return より前に record が書かれるため、`no-local-tip` 経路では `localTipOid: ""` の record が append される（TC-029 がこの経路を通過するが `localTipOid` 空文字の明示 assert なし）。設計の意図的選択（コメント明示）。✓
- **D6（graft compare-and-swap）**: `update-ref refs/heads/<branch> <mergeOid> <localTipOid>` で HEAD が変化していた場合は失敗（`graft: "failed"` で warn）。TC-032 でカバー。✓
- **D8（best-effort fetch → rev-parse）**: fetch 失敗は無視。`rev-parse` が空 stdout → `no-remote-tip`。この early return により、既存 failure-path unit test（sequence 外呼び出しに対し `{ exitCode: 0, stdout: "" }` を返す fake）が無変更で green のまま。✓

### セキュリティ確認

- `maskSensitive` 適用（TC-029）: `pushFailureStderr` が `maskSensitive` で伏字化されてから `reason` フィールドへ格納。GitHub token / Anthropic key パターンを含む `MASK_PATTERNS` が `src/logger/stdout.ts` で定義済み。✓
- 未 push 作業 commit の封じ込め（D4）: 構造的保証（change folder のみ overlay）+ 実行時二重検査（diff 結果照合）。✓
- コマンドインジェクション: `spawnFn` は引数配列渡しでシェル文字列展開なし。slug / branch は既存 job state 由来。✓

---

## 検証できなかった項目

- TC-027 の「state.json の `synthesizedCommits` 配列に」への直接 assert: e2e テストは `LocalRuntime.commitFinalState` ではなく `commitFinalState` 関数を直接呼ぶため、`persistedOids` callback proxy を使用。state.json を直接読んでの `synthesizedCommits` 配列照合はなし。`LocalRuntime` 統合テストではないため許容範囲と判断するが、実際の state.json への書き込みは検証できていない。

---

## Findings 詳細

### F-01 — TC-008, TC-014, TC-015: 「must」単体テストが未実装（store/fold layer）

test-cases.md で "must" と分類されている 3 件の unit TC に対して実装がない。

| TC | 概要 | 間接カバレッジ |
|---|---|---|
| TC-008 | `fold()` の `historyCount` / `stepCounts` / `history` / `steps` が checkpoint-restack record の追加で変化しない | TC-005 e2e（`runAttachVerification` → `verifyCheckpoint` → `fold()` の内部で counter reversal が検査される） |
| TC-014 | `fold()` が `checkpoint-restack` record を `checkpointRestacks[]` に収集し、`historyCount` は変化しない | 同上（間接） |
| TC-015 | `store.appendCheckpointRestack()` が events.jsonl へのみ append し state.json を書き換えない | e2e での `s.appendCheckpointRestack(record)` 成功（state.json 不変の明示 assert なし） |

TC-006（counter reversal 非検出）は TC-005 e2e で`runAttachVerification` が成功することで実質的に検証されており、独立した単体テストは不要と判断できる。一方 TC-008/TC-014/TC-015 は、`fold()` または `appendCheckpointRestack()` に将来修正を加えた際に regression を検出できない状況を作っている。

**修正方針（参考）**:
`src/store/__tests__/event-journal-checkpoint-restack.test.ts`（新設）で以下を実装する:
1. `fold()` に `checkpoint-restack` record が 1 行含まれる events.jsonl を入力した際に、`historyCount` / `stepCounts` が変化せず `checkpointRestacks[0]` にレコードが入ることを assert（TC-014 / TC-008）。
2. `JobStateStore.appendCheckpointRestack()` を呼ぶ前後で `state.json` の mtime / 内容が変化せず、events.jsonl に 1 行追記されることを assert（TC-015）。

### F-02 — TC-033: egress 失敗経路での restack 非呼び出しが明示的に検証されていない

`checkpoint-restack.test.ts` ヘッダは "already covered by commitFinalState test" としているが、既存の egress 失敗テスト（`commit-push-egress-invariant.test.ts`）は `restackCheckpointOntoPublishedTip` に対する spy / call count assert を持たない。strict-sequence fake の動作として、egress 失敗後に余分な git 呼び出しが起きても `no-remote-tip`（rev-parse empty stdout）でサイレント skip するため、既存テストは regression を検出できない可能性がある。

コード構造上（line 874 の early return より後に restack 呼び出しがある）、偶発的な regression リスクは低いが、test-cases.md の must TC に対して明示的な保証がない。

**修正方針（参考）**:
`commit-push-egress-invariant.test.ts` の egress 失敗ケースで、`commitFinalState` に渡す `recordRestack` callback を spy にし、呼び出し回数 0 を assert することで TC-033 を明示的にカバーする。

### F-03 — TC-026（should）: push 二重失敗後の warn 出力順が未テスト

既存 warn（"Warning: failed to push ..."）と restack 結果メッセージの出力順序に関する test-cases.md の "should" TC に実装がない。

コードは正しく既存 warn を先に出力してから switch 分岐で restack 結果を出力しているが、出力順が固定されていないため、リファクタリング時に変わっても検知できない。

---

## Observations（情報のみ・アクション不要）

- **spec-review-result-001.md の priority count 不一致**: spec-review は "must 32, should 4（TC-026/029/030/031 が should）" としているが、test-cases.md Summary は "must: 33, should: 3"。TC-029 は test-cases.md では **must** であり、spec-review が誤集計（TC-029 を should と数えた）。コード実装への影響なし。

- **`localTipOid: ""` を含む journal record**: `no-local-tip` 経路（HEAD rev-parse 失敗）では `localTipOid: ""` の record が events.jsonl に append される。D5 に基づく意図的設計（積み直し試行を journalize する）。TC-029 がこの経路を通過するが `localTipOid: ""` の明示 assert はない。operator が診断情報として参照した場合に空文字が混乱を招く可能性があるが、実害は軽微。

- **TC-027 e2e の間接検証**: `LocalRuntime.commitFinalState` を使わず `commitFinalState` を直接呼ぶため、`persistedOids` を synthesizedCommits の proxy として使用。state.json の `synthesizedCommits` 配列への直接書き込みは検証できていないが、T-05 acceptance criteria（`LocalRuntime.commitFinalState` 統合）の範囲として許容範囲内。

---

## 受け入れ条件照合

| 受け入れ条件 | 対応テスト | 判定 |
|---|---|---|
| push 拒否時に awaiting-resume の quiescent checkpoint が publish される（親 = 最終 push 済み tip、未 push commit を含まない） | TC-001 / TC-003 (e2e) | ✓ |
| attach 検証成立 + resume 再走 | TC-005 (e2e) | ✓ |
| 積み直し push も失敗した場合に throw せず warn で継続 | TC-009 (e2e partial + unit TC-021) | ✓ |
| push 成功の通常経路は既存テスト無変更で green | TC-036 + 既存 TC-003 回帰 | ✓ |
| typecheck && test が green | verification-result.md | ✓ |
