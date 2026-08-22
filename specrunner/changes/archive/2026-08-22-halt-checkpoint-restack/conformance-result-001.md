# Conformance Result — halt-checkpoint-restack — iter 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## Scope

- **request.md**: Acceptance criteria reviewed (normative)
- **spec.md**: All Requirements (SHALL/MUST) and Scenarios reviewed (normative)
- **design.md**: Decisions D1–D8 reviewed as plan context
- **tasks.md**: Checkbox state reviewed as plan context

## 検証した項目

| # | 規範項目 | 出典 | 結果 | 根拠 |
|---|---------|------|------|------|
| 1 | push 失敗時に remote tip を親として checkpoint を積み直し push（SHALL） | Spec Req 1 | ✓ | `restackCheckpointOntoPublishedTip` 実装；e2e TC-001 parent assert |
| 2 | 積み直し commit の親は `origin/<branch>` tip（MUST NOT 未 push commit 含む） | Spec Req 1 | ✓ | `commit-tree -p <parentOid>`；e2e TC-001・TC-003 親 OID 一致確認 |
| 3 | `origin/<branch>` 未存在 → 積み直しせず warn のみ継続（SHALL） | Spec Req 1 Scenario 2 | ✓ | `no-remote-tip` 早期 return；TC-017 unit test |
| 4 | tree は change folder（`specrunner/changes/<slug>/`）のみ差し替え（SHALL） | Spec Req 2 | ✓ | D3 temp index overlay；TC-016 git 呼び出しシーケンス検証 |
| 5 | change folder 外パスが diff に存在すれば push しない（MUST NOT） | Spec Req 2 | ✓ | 封じ込め検査 step 7；TC-004 unit test |
| 6 | 差分が空なら push しない | Spec Req 2 | ✓ | no-delta check step 5（write-tree == parent^{tree}）；TC-020 |
| 7 | 封じ込め検査違反時に警告出力・例外を投げない | Spec Req 2 Scenario 3 | ✓ | `stderrWrite` + `containment-violation` 返却 |
| 8 | 積み直し checkpoint が attach 検証（integrity + quiescent + identity）を通過（SHALL/MUST） | Spec Req 3 | ✓ | change folder 全体 overlay で `attachResumePolicy` reads() 要求を満たす |
| 9 | local state なし環境から attach 検証成立（checkpointOid 一致） | Spec Req 3 Scenario 1 | ✓ | e2e TC-005: Machine B clone で `runAttachVerification` 成功 |
| 10 | **resume step が halt した step と一致する** | Spec Req 3 Scenario 1 "Then" | **△** | `state.status === "awaiting-resume"` は assert 済み；`resumePoint.step === "implementer"` は explicit assert なし（→ F-01） |
| 11 | counter reversal 検出されず attach 検証成功 | Spec Req 3 Scenario 2 | ✓ | `checkpoint-restack` が historyCount/stepCounts に計上されない（TC-008/TC-014）；TC-005 で検証通過を確認 |
| 12 | `checkpoint-restack` record を events.jsonl に append・publish される tree に含まれる（SHALL/MUST） | Spec Req 4 | ✓ | step 3（D5）で tree 構築前に `recordRestack` 呼び出し；e2e TC-007 で events.jsonl 内容確認 |
| 13 | record に parentOid / localTipOid / unpublishedCommits / reason（maskSensitive 済み）を含む（SHALL） | Spec Req 4 | ✓ | `CheckpointRestackRecord` 型全フィールド；TC-029 masking assert |
| 14 | record は state.json projection を変更しない（MUST NOT） | Spec Req 4 | ✓ | fold() が `checkpoint-restack` を `checkpointRestacks` のみに収集；TC-008/TC-014 |
| 15 | 積み直しの全操作失敗は例外を投げず warn のみ（MUST NOT / SHALL） | Spec Req 5 | ✓ | 全操作を try/catch；e2e TC-009 `commitFinalState` が `resolves` で完了 |
| 16 | ローカル branch tip は checkpoint commit のまま・作業 commit 失われない | Spec Req 5 Scenario 1 | ✓ | push 失敗時 graft 未実行；e2e TC-009: `originTip === publishedTipOid` |
| 17 | journal 追記失敗でも積み直し commit 作成・push を継続 | Spec Req 5 Scenario 2 | ✓ | recordRestack throw を catch して継続；TC-018 unit test |
| 18 | push 成功後ローカル branch を publish 済み commit の子孫にする（SHALL） | Spec Req 6 | ✓ | `_doGraft` step 11；e2e TC-011: `merge-base --is-ancestor` 確認 |
| 19 | graft は既存 commit を破棄・書き換えない（MUST NOT）・worktree 変更なし（MUST NOT） | Spec Req 6 | ✓ | `commit-tree + update-ref` のみ；TC-028 porcelain サブコマンド非発行 invariant |
| 20 | graft 後のローカル tree は graft 前 HEAD の tree と同一 | Spec Req 6 Scenario 1 | ✓ | TC-022: merge commit tree = HEAD^{tree} |
| 21 | detached HEAD では branch ref を変更しない | Spec Req 6 Scenario 2 | ✓ | graft: "skipped"；TC-024 unit test |
| 22 | 生成 commit OID（restack + graft merge）を synthesizedCommits 台帳へ追記（SHALL） | Spec Req 6 | **△** | 両 OID に対して `persistCommit` 呼び出し済み；graft merge OID の explicit assert が conditional（→ F-02） |
| 23 | push 成功経路では積み直し git 操作・record 追記なし（MUST NOT） | Spec Req 7 | ✓ | D1: push1 成功で即 return；TC-003 シーケンス不変確認 |
| 24 | request AC-1: publish tip が awaiting-resume quiescent checkpoint（parent = push 成功 tip） | request.md | ✓ | e2e TC-001/TC-003: parent OID・diff path 確認 |
| 25 | request AC-2: attach 成立 | request.md | ✓ | e2e TC-005 |
| 26 | request AC-2: resume が拒否された step から再走できる（テストで固定） | request.md | **△** | attach は通過するが `resumePoint.step` の explicit assert 欠落（→ F-01） |
| 27 | request AC-3: 積み直し push 失敗時 throw せず warn で継続 | request.md | ✓ | e2e TC-009 |
| 28 | request AC-4: push 成功通常経路は既存テスト無変更で green | request.md | ✓ | commit-push-egress-invariant.test.ts TC-003/TC-004/TC-011 |
| 29 | request AC-5: `typecheck && test` が green | request.md | ✓ | verification-result.md: passed（813 test files、typecheck exit 0） |

### Design 計画との対照（plan context のみ、findings なし）

| 設計判断 | 実装 | 評価 |
|---------|------|------|
| D1: push 二重失敗後段のみに restack を置く | `commitFinalState` の push2 失敗 warn 直後に呼び出し | spec に整合、通常経路変更なし ✓ |
| D2: overlay 単位は change folder 全体（request 字面「管理パスのみ」からの逸脱） | `changeFolderPath(slug)` でサブツリー全置換 | spec.md が D2 を正規化（`specrunner/changes/<slug>/` SHALL）。spec が request との齟齬を明示的に上書き ✓ |
| D3: temp index + plumbing で worktree/HEAD/index を変更しない | `GIT_INDEX_FILE` env；TC-028 invariant assert | ✓ |
| D4: 封じ込め検査 fail-closed | step 7 `git diff --name-only` → violation で push 抑止 | ✓ |
| D5: checkpoint-restack record を tree 構築前に追記 | step 3 で `recordRestack` 呼び出し後に tree 構築開始 | ✓ |
| D6: graft（`-s ours` 相当）で local branch を publish 済み commit の子孫にする | `_doGraft`：commit-tree + update-ref | ✓ |
| D7: 独立 module `src/core/step/checkpoint-restack.ts` | 実装済み | ✓ |
| D8: best-effort fetch → remote-tracking ref rev-parse | step 1；fetch 失敗は無視；stdout 空 → no-remote-tip | ✓ |

## 検証できなかった項目

None（全 normative 項目を実装 + テストレベルで確認した）

## Findings 詳細

### F-01（medium）— TC-005 で `resumePoint.step` が halt step と一致することの explicit assert が欠落

**ファイル**: `tests/halt-checkpoint-restack-e2e.test.ts`  
**箇所**: ~422 行（Machine B attach verification assertion ブロック）

spec Requirement 3 Scenario 1 の "And" 節は「resume step は halt した step に解決される」と明示する。  
e2e TC-005 は `verifiedCheckpoint.state.status === "awaiting-resume"` を assert しているが、  
`verifiedCheckpoint.state.resumePoint?.step === "implementer"`（halt step）を explicit assert していない。

`attachResumePolicy` は内部で `resolveResumeStep` を呼び resume step の resolvability を確認するが、  
検証通過だけでは「resume step が halt した step（implementer）と一致する」ことは証明できない  
（別ステップの reads() が tree に存在していれば異なる step でも attach が通過し得る）。

request 受け入れ条件「resume が拒否された step から再走できることをテストで固定する」を fully 充足するには、  
`resumePoint.step` の explicit assert が必要。

```ts
// 追加すべき assertion（e2e TC-005 ブロック内）
expect(verifiedCheckpoint.state.resumePoint?.step).toBe("implementer");
```

### F-02（low）— TC-027 の graft merge OID assertion が conditional

**ファイル**: `tests/halt-checkpoint-restack-e2e.test.ts`  
**箇所**: ~386–392 行（TC-027 synthesizedCommits assertion ブロック）

tasks.md TC-027 は「restack commit OID と graft merge commit OID の**両方**が含まれることを assert する」と明記する。  
現在のテストは `persistedOids.contains(restackedOid)` と `persistedOids.length >= 2` のみを assert し、  
graft merge OID については `if (graftMergeOid)` の conditional block で `localTip === graftMergeOid` を検証している。

`persistedOids.length >= 2` は checkpoint OID + restack OID の 2 件で充足するため、  
graft merge OID が `persistedOids` に含まれなくても（= `persistCommit(mergeOid)` が呼ばれなくても）assertion は通過する。

実装（`_doGraft` 内の `persistCommit(mergeOid)` 呼び出し）は仕様どおりに動作しているが、  
テストが graft merge OID の存在を unconditional に assert していないため gap がある。

```ts
// graft 後の local HEAD が graft merge commit になることを利用して明示 assert
const localTip = gitSync(["rev-parse", "HEAD"], repoDir);
expect(persistedOids).toContain(restackedOid);   // restack OID ✓
expect(persistedOids).toContain(localTip);        // graft merge OID（HEAD = graft commit）✓
```
