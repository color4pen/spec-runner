# cross-boundary-invariants Review — halt-checkpoint-restack

**Reviewer**: cross-boundary-invariants  
**Iteration**: 1  
**Date**: 2026-08-22  

## 観点

実装そのものは正しくテストも green のまま、**変更していないコードの暗黙の前提（不変条件）を新しい挙動が黙って破っていないか**を検出する。
具体的には egress backstop・attach 検証・journal 整合性・synthesizedCommits 台帳・pipeline persist の各既存機構との相互作用を重点的に確認した。

---

## 検査対象ファイル

- `src/core/step/checkpoint-restack.ts`（新規）
- `src/core/step/commit-push.ts`（変更：restack 呼び出し追加）
- `src/core/runtime/local.ts`（変更：callback 注入）
- `src/store/event-journal.ts`（変更：`CheckpointRestackRecord` 追加）
- `src/store/job-journal.ts`（変更：`appendCheckpointRestack`）
- `src/store/job-state-store.ts`（変更：同上）
- `src/core/attach/verify-checkpoint.ts`（参照：attach 検証との相互作用確認）
- `src/core/attach/checkpoint-policy.ts`（参照：counter-reversal 等との相互作用確認）
- `src/git/checkpoint-ref.ts`（参照：restack commit 読み取り経路）
- `tests/halt-checkpoint-restack-e2e.test.ts`（新規：e2e カバレッジ確認）

---

## 不変条件チェック結果

### ✅ (a) egress backstop（`verifyEgressLedger`）との相互作用

`commitFinalState` は egress 検査を push 前に実行し、失敗時は early return（restack 未呼び出し）— 設計 D1 の指定通り。  
restack push（`git push origin <oid>:refs/heads/<branch>`）は `verifyEgressLedger` を経由せず、代わりに封じ込め検査（D4: `git diff --name-only parentOid restackedOid`）で change folder 外パスがないことを fail-closed で確認。  
graft merge commit（`mergeOid`）は `persistCommit(mergeOid)` → `update-ref` の順で台帳への追記が先行するため、以降の `runInlineEgressCheck` が `mergeOid` を台帳内に見つけられる。  
**不変条件を破る挙動なし。**

### ✅ (b) `verifyCheckpoint`（counter-reversal 検査）との相互作用

`checkpoint-restack` record は `historyCount`/`stepCounts` に寄与しない（fold ではカウントせず）。  
restack commit の `events.jsonl` は `state.json._journal.historyCount = Y` と一致する fold 結果を返す（restack record は `checkpointRestacks` に収まりカウント外）。  
`detectCounterReversal(stored, foldResult)` は `Y >= Y` → 逆転なし。  
**attach 検証は通過する。**

### ✅ (c) `attachResumePolicy.reads()` tree-precheck との相互作用

restack commit の tree は `specrunner/changes/<slug>/` 全体を local checkpoint commit の tree で差し替えるため、resume step の `reads()` が要求するすべての入力ファイルが treeFiles に含まれる（D2 の change folder 全体 overlay 選択の根拠）。  
e2e テスト TC-005 で `runAttachVerification({ policy: attachQuiescentPolicy })` が pass することを実 git で確認している。  
**不変条件を破る挙動なし。**

### ✅ (d) persist 路の journal 整合性

`recordRestack` (step 3) → `appendEventRecord` → `fs.appendFile` で events.jsonl に直接追記。  
その後 `persistBeforePush(restackedOid)` → `updateJobState` → `store.persist()` が呼ばれる際、`persist()` は fast-path（既存の `_journal.historyCount >= state.history.length`）を取り、events.jsonl を fold せずに state.json のみ更新する（history/steps の変化がないため）。  
fast-path 書き込みは `stateToStateJson(state)` + 既存カウンタのため、restack record が誤ってカウンタに計上されることはない。  
**不変条件を破る挙動なし。**

### ✅ (e) temp index（`GIT_INDEX_FILE`）の worktree/index 非干渉

temp index は `.specrunner/local/<slug>/restack-index-<timestamp>` に置かれ、`.gitignore` の `.specrunner/*` で無視される。  
`git read-tree`・`update-index`・`write-tree` はすべて `GIT_INDEX_FILE` 経由で temp index に対してのみ動作し、実 index は変更されない。  
`git hash-object -w` は `GIT_INDEX_FILE` に無関係にオブジェクトストアに書くが、これは意図通り（worktree の events.jsonl blob を object store に登録するため）。  
`git update-ref refs/heads/<branch>` と `git commit-tree` はワーキングツリー・実 index を一切変更しない。  
**既存 worktree/index の不変条件を破る挙動なし。**

---

## Findings（不変条件の暗黙違反候補）

### F-01 — `recordRestack` が `no-local-tip` 早期リターン **前** に呼ばれ、`localTipOid: ""` の記録が disk に残る

**Severity**: medium  
**File**: `src/core/step/checkpoint-restack.ts`  
**Line**: 208–221（step 3 の `recordRestack` 呼び出し → step 3.5 の `if (localTipFailed) return { kind:"skipped", reason:"no-local-tip" }`）

`git rev-parse HEAD` が失敗する（exit≠0 または stdout が空）の場合、`localTipFailed = true`・`localTipOid = ""` となる。
コードは `recordRestack` を **`no-local-tip` 早期リターンより前**に呼ぶため、`CheckpointRestackRecord { ..., localTipOid: "" }` が events.jsonl に `fs.appendFile` される。
この record は disk 上に残り、non-ephemeral runner が次回 `commitAndPush` または `commitFinalState` を成功させると remote に publish される。

`CheckpointRestackRecord.localTipOid` は `string`（空文字を許容する型）だが、仕様の意味（"The local tip OID at the time of halt"）は非空 40 桁 SHA を前提とする。
空文字 OID を含む record が publish されると、将来的にこのフィールドを機械的に処理するツール（例: `unpublishedCommits` を cherry-pick する補助 CLI）が誤動作する可能性がある。

**現在の影響範囲**: `git rev-parse HEAD` の失敗は git リポジトリの根本的な破損を意味し、実運用では極めてまれ。直接的な機能不全は生じない。

**修正方針**: `recordRestack` の呼び出しを `if (!localTipFailed)` ガードで囲むか、`CheckpointRestackRecord.localTipOid` を `string | null` に変更して空を明示的に表現する。

---

### F-02 — graft 後の non-ephemeral runner の次回 `commitAndPush` push range に work commit が含まれ、pre-receive による連鎖 halt が発生しうる

**Severity**: medium  
**File**: `src/core/step/checkpoint-restack.ts`（`_doGraft`）, `src/core/step/commit-push.ts`（`commitAndPush`）

graft が成功すると、ローカル branch tip が `mergeOid`（親: `[localTipOid=checkpointOid, restackedOid]`）に更新される。
non-ephemeral runner が pipeline を local state から resume し、次の synthesis step が完了すると `commitAndPush` が `git push -u origin <branch>` を実行する。
この push の範囲は `[synthesisOid, mergeOid, checkpointOid, workCommit_N, ..., workCommit_1]` になる（`origin/<branch>=restackedOid` から到達できない commit すべて）。

**`synthesizedCommits` 台帳との整合性は維持される**（work commit・checkpointOid は生成時に台帳登録済み、mergeOid は graft 時に登録済み → `verifyEgressLedger` は PASS）が、push 範囲に元の push-rejected work commit が入るため、**pre-receive hook が再度同じコミットを拒否**し `commitAndPush` が `pushFailedError` を throw する。

この halt → `commitFinalState` → direct push 失敗 → restack のサイクルが繰り返されると、`origin/<branch>` に restack commit が蓄積していく（各 restack は quiescent checkpoint として正しく published されるため、attach・resume は常に可能）。

**既存不変条件への影響**:
- `verifyEgressLedger` 不変条件: 破らない（台帳内のすべての OID が range に存在）
- "これ以上悪化させない"（request 非目標）: graft なしでも同様に push は失敗するが、失敗理由が "non-fast-forward" から "pre-receive" に変わり、かつ各 halt が新たな restack を誘発する点が設計上言及されていない

**影響範囲**: non-ephemeral runner でかつ pre-receive hook が継続して active な環境に限定。ephemeral runner は restackedOid を origin としてクリーンにスタートするため影響なし。

**修正・判断の方針**:
- (option A) 設計の許容範囲と明記し、`halt → restack` サイクルの warn メッセージに「以降の push も pre-receive に拒否される可能性がある。ローカルブランチを手動修正してから resume してください」を追加する（決定不要、文書化のみ）。
- (option B) non-ephemeral runner に限り、restack 後の graft を実行しない（ephemeral 環境のみ graft が有効）オプションを追加する。ただし non-fast-forward 問題が non-ephemeral で再発する。
- (option C) 設計ドキュメント（design.md D6）に明示的に記載する（現状は Risks に記述なし）。

---

### F-03 — `FoldResult.checkpointRestacks` が空時 `undefined`（`operatorEvents`/`lineage` は常に `[]`）

**Severity**: low  
**File**: `src/store/event-journal.ts`  
**Line**: 457（`...(checkpointRestackRecords.length > 0 ? { checkpointRestacks: ... } : {})`）

`operatorEvents` および `lineage` は fold result に常に配列（空の場合 `[]`）として含まれるが、`checkpointRestacks`（および `findingRecency`）は records が 0 件のとき `undefined`（省略）となる。
現在このフィールドを機械的に処理するコードは存在しないが、将来 `foldResult.checkpointRestacks.forEach(...)` のようなコードが `.checkpointRestacks?.forEach()` と書かれずに書かれた場合、TypeError を引き起こす。

**修正方針**: `...(checkpointRestackRecords.length > 0 ? { ... } : {})` を `checkpointRestacks: checkpointRestackRecords` に変更し、常に配列を emit する（`operatorEvents`/`lineage` と同一パターン）。

---

### F-04 — published restack commit の `state.json.synthesizedCommits` が `checkpointOid`・`restackedOid`・`mergeOid` を含まない

**Severity**: low  
**File**: `src/core/step/checkpoint-restack.ts`（step 4b: `ls-tree localTipOid`）, `src/core/runtime/local.ts`（`persistBeforePush` 呼び出しタイミング）

restack commit の `state.json` は `git ls-tree localTipOid -- changeDir/` から取得する（checkpoint commit のスナップショット）。checkpoint commit は `commitFinalState` の `git commit` で作成された時点のものであり、その後 `persistBeforePush(checkpointOid)` → `persistBeforePush(restackedOid)` → `persistBeforePush(mergeOid)` で disk の state.json に追記される OID は restack commit の `state.json` に反映されない。

結果として、published restack checkpoint の `state.json.synthesizedCommits` には `checkpointOid`・`restackedOid`・`mergeOid` が不在。

**egress UNKNOWN_COMMIT への影響**:
- Machine B（新規 runner）: `restackedOid` は `origin/<branch>` に存在するため `--not --remotes=origin` で除外される → range に入らない。`checkpointOid`・`mergeOid` は Machine B の履歴にない → range に入らない。**EGRESS_UNKNOWN_COMMIT は発生しない。**
- Machine A（non-ephemeral）: in-memory `state.synthesizedCommits` は `persistBeforePush` クロージャが in-place 更新するため、resume 後の `runInlineEgressCheck` は正しい台帳を使う。**EGRESS_UNKNOWN_COMMIT は発生しない。**

**実害**: 現時点の機能的影響なし。ただし "restack commit が自身を `synthesizedCommits` に含まない" という semantic inconsistency が存在する。将来の監査ツールや chain-of-custody 検証に影響する可能性。

**修正方針（任意）**: step 4c で events.jsonl の blob を更新するように、step 4c 前後で DISK 上の最新 state.json も `hash-object` して `specrunner/changes/<slug>/state.json` を上書きする。ただし変更量が増えるため、設計の費用対効果を判断する必要がある。

---

## まとめ

| # | Severity | 対象ファイル | 要約 |
|---|----------|-------------|------|
| F-01 | medium/fixable | `checkpoint-restack.ts:208-221` | `localTipOid: ""` の journal record が `no-local-tip` early-exit 前に disk に残る |
| F-02 | medium/decision-needed | `checkpoint-restack.ts` (_doGraft), `commit-push.ts` | graft 後 non-ephemeral の次回 push 範囲に work commit → pre-receive 連鎖 halt |
| F-03 | low/fixable | `event-journal.ts:457` | `checkpointRestacks` が空時 undefined（常配列 invariant 不一致） |
| F-04 | low/fixable | `checkpoint-restack.ts`（step 4b）| restack commit の `state.json.synthesizedCommits` が stale（checkpointOid 等を欠く） |

egress backstop・attach 検証（counter-reversal・reads() tree-precheck）・journal 整合性・worktree/index 非干渉の主要不変条件は保たれている。
F-01 と F-03 は小規模な修正で解消可能。F-02 は設計上のトレードオフとして明示化する判断が必要。

## 判定

**needs-fix** — F-01（medium/fixable）が発見された。
