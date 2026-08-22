# Conformance Result — halt-checkpoint-restack — iter 2

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## Scope

- **request.md**: Acceptance criteria reviewed (normative)
- **spec.md**: All Requirements (SHALL/MUST) and Scenarios reviewed (normative)
- **design.md**: Decisions D1–D8 reviewed as plan context
- **tasks.md**: Checkbox state reviewed as plan context
- **Iteration 1 findings**: F-01 / F-02 の解消を確認

## 前回 Findings の解消確認

| Finding | 内容 | 解消状況 |
|---------|------|---------|
| F-01（medium）| TC-005 で `resumePoint.step` が halt step と一致することの explicit assert 欠落 | ✅ 解消：`tests/halt-checkpoint-restack-e2e.test.ts:419` に `expect(verifiedCheckpoint.state.resumePoint?.step).toBe("implementer")` が追加された |
| F-02（low）| TC-027 の graft merge OID assertion が conditional | ✅ 解消：`tests/halt-checkpoint-restack-e2e.test.ts:382–387` にて `const localTip = gitSync(["rev-parse", "HEAD"], repoDir)` を経由した無条件 assert（`persistedOids` が `localTip` を含む）が追加された |

## 検証した項目

| # | 規範項目 | 出典 | 結果 | 根拠 |
|---|---------|------|------|------|
| 1 | push 失敗時に remote tip を親として checkpoint commit を積み直し push SHALL | Spec Req 1 | ✓ | `restackCheckpointOntoPublishedTip` 実装；`commit-tree -p <parentOid>` にて親を明示；e2e TC-001 の `restackedParent === publishedTipOid` |
| 2 | 積み直し commit の親系列に未 push commit を含まない（MUST NOT） | Spec Req 1 | ✓ | tree overlay は remote tip 基点；e2e TC-003: `originHistory` に `workCommitOid` 不在確認 |
| 3 | `origin/<branch>` 未解決（未 push branch）は積み直しなし・warn のみ継続 SHALL | Spec Req 1 Scenario 2 | ✓ | `no-remote-tip` 早期 return；unit TC-017 |
| 4 | tree は `specrunner/changes/<slug>/` 配下のみ差し替え SHALL | Spec Req 2 | ✓ | D3: temp index `read-tree <parentOid>` → ls-tree 比較 → update-index overlay；TC-016 で git 呼び出し順とパスを assert |
| 5 | change folder 外パスが diff に存在する場合は push しない（MUST NOT） | Spec Req 2 / D4 | ✓ | step 7 containment check；unit TC-004: `src/foo.ts` が diff に出ると `containment-violation` で push 抑止 |
| 6 | 差分が空の場合も push しない | Spec Req 2 | ✓ | step 5: `write-tree == parentOid^{tree}` → `no-delta` 返却・push せず；unit TC-020 |
| 7 | 封じ込め検査失敗時：警告出力・例外を投げない | Spec Req 2 Scenario 3 | ✓ | `stderrWrite` + `containment-violation` 返却；unit TC-004 |
| 8 | 積み直し checkpoint が attach 検証（integrity + attachQuiescentPolicy + identity）を通過 SHALL/MUST | Spec Req 3 | ✓ | change folder 全体 overlay → `attachResumePolicy.reads()` 要求を満たす；e2e TC-005: `runAttachVerification` 成功 |
| 9 | local state なし環境から attach 検証成立（checkpointOid が restack commit OID と一致） | Spec Req 3 Scenario 1 | ✓ | e2e TC-005: Machine B clone（`git clone bareDir machineBDir`）で `runAttachVerification` 実行；`verifiedCheckpoint.checkpointOid === restackedOid` |
| 10 | resume step が halt した step（implementer）に解決される | Spec Req 3 Scenario 1 "And" | ✓ | e2e TC-005 line 419: `expect(verifiedCheckpoint.state.resumePoint?.step).toBe("implementer")` — F-01 解消済み |
| 11 | counter reversal 検出されず attach 検証成功 | Spec Req 3 Scenario 2 | ✓ | `checkpoint-restack` は `historyCount`/`stepCounts` に計上されない（TC-008/TC-014）；e2e TC-005 内で `verifyCheckpoint` が通過 |
| 12 | `checkpoint-restack` record を tree 構築前に events.jsonl へ append SHALL；publish される tree に含まれる MUST | Spec Req 4 | ✓ | step 3 D5: `recordRestack` 呼び出し後に tree 構築（step 4）開始；step 4c で worktree events.jsonl を `hash-object` → index 更新；e2e TC-007: `git show <restackedOid>:specrunner/changes/<slug>/events.jsonl` に `checkpoint-restack` record 確認 |
| 13 | record に `parentOid` / `localTipOid` / `unpublishedCommits` / `reason`（maskSensitive 伏字化）を含む SHALL | Spec Req 4 | ✓ | `CheckpointRestackRecord` 型定義に全フィールド；`maskSensitive(pushFailureStderr).slice(0, 500)` で reason 生成；TC-029: 機密 token が伏字化されることを assert |
| 14 | record は state.json projection（history/steps/counters）を変更しない（MUST NOT） | Spec Req 4 | ✓ | `fold()` が `checkpoint-restack` を `checkpointRestacks[]` のみに収集；TC-008: historyCount/stepCounts 不変；TC-015: `appendCheckpointRestack` が state.json の mtime/内容を変更しないことを assert |
| 15 | 積み直しの全操作失敗は例外を投げず warn のみ継続（MUST NOT / SHALL） | Spec Req 5 | ✓ | 全 step を try/catch で包む；最外 catch-all でも throw しない；e2e TC-009: all-reject spawnFn で `commitFinalState` が `resolves.toBeUndefined()` |
| 16 | journal 追記失敗でも積み直し commit 作成・push を継続 | Spec Req 5 Scenario 2 | ✓ | `recordRestack` throw を catch して warn し処理継続；unit TC-018 |
| 17 | local branch tip は checkpoint commit のまま；作業 commit は失われない | Spec Req 5 Scenario 1 | ✓ | push 失敗時 graft 未実行（D6: push 成功後のみ）；e2e TC-009: `originTip === publishedTipOid` かつ `localTip ≠ publishedTipOid` |
| 18 | push 成功後にローカル branch を publish 済み commit の子孫にする SHALL | Spec Req 6 | ✓ | `_doGraft`: `commit-tree headTree -p localHead -p restackedOid` → `update-ref`；e2e TC-011: `merge-base --is-ancestor restackedOid HEAD` が exit 0 |
| 19 | 生成 commit OID を `synthesizedCommits` 台帳へ追記 SHALL | Spec Req 6 | ✓ | step 8: `persistCommit(restackedOid)` を push 前；graft 内: `persistCommit(mergeOid)` を `update-ref` 前；e2e TC-027: `persistedOids.toContain(restackedOid)` かつ `persistedOids.toContain(localTip)` — F-02 解消済み |
| 20 | graft は既存 commit を破棄・書き換えない（MUST NOT）；worktree 変更なし（MUST NOT） | Spec Req 6 | ✓ | `commit-tree + update-ref` のみ（worktree checkout / index 操作なし）；TC-028: `add/commit/checkout/reset/stash/merge` が一度も発行されないことを invariant assert |
| 21 | graft 後の branch tip tree は graft 前 HEAD tree と同一 | Spec Req 6 Scenario 1 | ✓ | TC-022: merge commit に `HEAD^{tree}` を渡すことを assert |
| 22 | 未 push 作業 commit はローカル branch から到達可能 | Spec Req 6 Scenario 1 | ✓ | graft merge commit の parent に `localHead` を含む（`-p localHead -p restackedOid`） |
| 23 | detached HEAD では branch ref を変更しない | Spec Req 6 Scenario 2 | ✓ | `symbolic-ref -q HEAD` 非 0 → graft: "skipped"；TC-024: `update-ref refs/heads/...` が呼ばれないことを assert |
| 24 | push 成功経路では積み直し git 操作・record 追記なし（MUST NOT） | Spec Req 7 | ✓ | D1: push1 成功で即 return；restack 呼び出し自体が到達されない；commit-push-egress-invariant.test.ts TC-003 のシーケンス不変確認 |
| 25 | egress 検査失敗経路では restack を呼ばない | Design D1 / 実装 | ✓ | egress 失敗は早期 return；TC-033: fetch/push サブコマンドが発行されないことを assert |
| 26 | request AC-1: publish tip が awaiting-resume quiescent checkpoint（parent = push 成功 tip，未 push commit 含まず） | request.md | ✓ | e2e TC-001/TC-003: parent OID 一致・diff path が change folder 配下のみ・origin history に work commit 不在 |
| 27 | request AC-2: attach 成立・resume が拒否された step から再走できることをテストで固定 | request.md | ✓ | e2e TC-005: `runAttachVerification` 成功 + `resumePoint.step === "implementer"` |
| 28 | request AC-3: 積み直し push 失敗時 throw せず warn で継続（テストで固定） | request.md | ✓ | e2e TC-009（all-reject spawnFn） |
| 29 | request AC-4: push 成功通常経路は既存テスト無変更で green | request.md | ✓ | commit-push-egress-invariant.test.ts 変更なし；verification-result.md: 816 test files passed |
| 30 | request AC-5: `typecheck && test` が green | request.md | ✓ | verification-result.md: typecheck exit 0，test 816 files passed |

## Design 計画との対照（plan context のみ）

| 設計判断 | 実装 | 評価 |
|---------|------|------|
| D1: push 二重失敗後段のみに restack | `commitFinalState` の push2 失敗 warn 直後に `restackCheckpointOntoPublishedTip` 呼び出し | spec 整合 ✓ |
| D2: overlay 単位は change folder 全体（request 字面「管理パスのみ」からの逸脱） | `changeFolderPath(slug)` でサブツリー全置換 | spec.md が D2 を正規化（`specrunner/changes/<slug>/` SHALL）。spec が request との齟齬を明示的に上書き ✓ |
| D3: temp index + plumbing で worktree/HEAD/index を変更しない | `GIT_INDEX_FILE` env；TC-028 invariant assert | ✓ |
| D4: 封じ込め検査 fail-closed | step 7 `git diff --name-only` → violation で push 抑止 | ✓ |
| D5: checkpoint-restack record を tree 構築前に追記 | step 3 で `recordRestack` 呼び出し後に tree 構築（step 4）開始 | ✓ |
| D6: graft（`-s ours` 相当）で local branch を publish 済み commit の子孫にする | `_doGraft`: commit-tree + update-ref | ✓ |
| D7: 独立 module `src/core/step/checkpoint-restack.ts` | 実装済み | ✓ |
| D8: best-effort fetch → remote-tracking ref rev-parse | step 1；fetch 失敗は無視；stdout 空 → no-remote-tip | ✓ |

## 検証できなかった項目

None（全 normative 項目を実装・テストレベルで確認した）

## Findings 詳細

None（前回 F-01/F-02 はいずれも解消された。新たな指摘なし）
