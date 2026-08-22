# Conformance Result — halt-checkpoint-restack (Iteration 3)

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## Scope

**Change**: halt checkpoint を未 push 作業 commit から分離して publish する  
**Iteration**: 3  
**Reviewed against**: `request.md` (acceptance criteria) and `spec.md` (Requirements / Scenarios)

---

## Normative Items Verified

### Requirement 1: halt checkpoint push 失敗 → 最終 publish 済み tip を親として積み直し

| Normative item | Result | Evidence |
|---|---|---|
| push 二重失敗後に `restackCheckpointOntoPublishedTip` が呼ばれる | ✅ | `commit-push.ts:902` — `messageLabel === "checkpoint"` guard 後に呼び出し |
| `messageLabel === "finalize"` では restack が発動しない | ✅ | `commit-push.ts:902` のガード; TC-039 で機械固定 |
| `origin/<branch>` が解決できない場合は warn のみで skip | ✅ | `checkpoint-restack.ts:171` — `no-remote-tip` return |
| remote tip が local history の ancestor でない場合は skip | ✅ | `checkpoint-restack.ts:206-225` — `merge-base --is-ancestor`; TC-037/TC-038 で固定 |
| 積み直し commit の親が `origin/<branch>` tip と一致する | ✅ | `commit-tree … -p <parentOid>` (`checkpoint-restack.ts:396`) |
| 積み直し commit の parent chain に未 push 作業 commit を含まない (MUST NOT) | ✅ | D3 overlay 構造: remote tip の tree を base として change folder のみを差し替え |
| すべての失敗経路で throw しない | ✅ | 外側 try/catch (`checkpoint-restack.ts:487-493`) |

Scenarios verified:
- 「作業 commit の push が拒否される状況で halt した」→ TC-001 (E2E) ✅
- 「publish 済み tip が存在しない branch では積み直しをしない」→ TC-002/TC-017 (unit) ✅
- 「remote が local history と分岐している場合は積み直しをしない」→ TC-037/TC-038 (unit + E2E) ✅
- 「finalize commit の push 失敗では積み直しをしない」→ TC-039 (unit integration) ✅

---

### Requirement 2: 積み直した checkpoint の tree は change folder のみを差し替え

| Normative item | Result | Evidence |
|---|---|---|
| tree = parent tree に対して `specrunner/changes/<slug>/` のみ差し替え (SHALL) | ✅ | D3 temp index overlay (`checkpoint-restack.ts:265-380`); `GIT_INDEX_FILE` 環境変数 |
| change folder 外パスが diff に含まれる場合は push しない (MUST NOT) | ✅ | D4 containment check (`checkpoint-restack.ts:407-430`); TC-004 (unit) |
| 差分が空の場合も push しない | ✅ | D3 no-delta tree OID check (`checkpoint-restack.ts:383-391`) — write-tree OID == parent^{tree} → `no-delta` skip; TC-020 (unit) |
| `.github/workflows/ci.yml` 等の作業 commit 変更が tree に含まれない | ✅ | TC-003 (E2E): diff 全パスが `specrunner/changes/<slug>/` 配下のみを検証 |

Scenarios verified:
- 「未 push 作業 commit のファイル変更は publish されない」→ TC-003 E2E ✅
- 「change folder 外の差分が検出された場合は push しない」→ TC-004 unit ✅

Note: spec は containment check の文脈で "差分が空の場合も push しない" を要求。実装は step 5 の
no-delta tree OID 比較（commit-tree 実行前）で同等の効果を実現している。tree OID が異なる場合に
`git diff --name-only` が空になることは git の設計上起こりえないため、システム挙動として
spec 要求を満たしている。

---

### Requirement 3: 積み直された checkpoint は attach 検証を通過し、resume できる

| Normative item | Result | Evidence |
|---|---|---|
| generic integrity + attachQuiescentPolicy + identity 通過 (SHALL) | ✅ | TC-005 (E2E): `runAttachVerification({ policy: attachResumePolicy })` が成功 |
| `checkpointOid` が restack commit OID と一致 | ✅ | TC-005 E2E assert |
| `state.status === "awaiting-resume"` | ✅ | TC-005 E2E assert |
| resume step が halt した step に解決される | ✅ | TC-005 E2E: `resumePoint.step === "implementer"` を assert |
| counter reversal 検査が通る | ✅ | TC-006 (store unit): `detectCounterReversal` が null を返す |

Scenarios verified:
- 「local state を持たない環境から attach 検証が成立する」→ TC-005 E2E (Machine B clone) ✅
- 「journal が state.json の counters を巻き戻していない」→ TC-006 unit ✅

---

### Requirement 4: 積み直しの発生を journal event として publish される checkpoint に記録する

| Normative item | Result | Evidence |
|---|---|---|
| `checkpoint-restack` record を events.jsonl へ append (SHALL) | ✅ | `checkpoint-restack.ts:231-249`; `recordRestack` callback |
| tree 構築**前**に append して publish tree に含める (MUST) | ✅ | step 3 が step 4 (tree build) より前 (`checkpoint-restack.ts:227-249 vs 251+`) |
| `parentOid` / `localTipOid` / `unpublishedCommits` / `reason` フィールドを含む (SHALL) | ✅ | `CheckpointRestackRecord` interface (`event-journal.ts:187-203`) |
| `reason` は `maskSensitive` で伏字化 + 500 文字 truncate | ✅ | `checkpoint-restack.ts:230` |
| state.json projection（history / steps / counters）を変更しない (MUST NOT) | ✅ | TC-008/TC-014 (store unit): historyCount / stepCounts 不変を検証 |

Scenarios verified:
- 「publish された checkpoint から未 publish commit を判別できる」→ TC-007 E2E ✅
- 「積み直し record は projection を増やさない」→ TC-008 unit ✅

---

### Requirement 5: 積み直しの失敗は例外を投げず警告のみで継続する

| Normative item | Result | Evidence |
|---|---|---|
| いずれの操作が失敗しても throw しない (MUST NOT) | ✅ | 外側 catch-all (`checkpoint-restack.ts:487-493`); 各 callback は個別 try/catch |
| stderr への警告のみで継続 (SHALL) | ✅ | `stderrWrite` 使用; `commitFinalState` 戻り値は `Promise<void>` |
| local からの resume 可能性を損なわない (MUST NOT) | ✅ | worktree/index 変更なし; graft 失敗時もローカル commit は消えない |

Scenarios verified:
- 「積み直した checkpoint の push も拒否される」→ TC-009 E2E + TC-021 unit ✅
- 「journal 追記が失敗しても publish を試みる」→ TC-018 unit ✅

---

### Requirement 6: publish 後にローカル branch を publish 済み commit の子孫にする

| Normative item | Result | Evidence |
|---|---|---|
| push 成功かつ HEAD が branch を指す場合に graft (SHALL) | ✅ | `_doGraft` (`checkpoint-restack.ts:515-595`); symbolic-ref guard |
| 既存 commit を破棄・書き換えない (MUST NOT) | ✅ | `commit-tree + update-ref` のみ; worktree/index 不変 |
| worktree の内容を変更しない (MUST NOT) | ✅ | TC-028 invariant: `add/commit/checkout/reset/stash/merge` 未発行 |
| merge commit OID を `synthesizedCommits` 台帳へ追記 (SHALL) | ✅ | `_doGraft` 内 `persistCommit(mergeOid)` (`checkpoint-restack.ts:565-572`) |
| detached HEAD では graft しない | ✅ | `symbolic-ref -q HEAD` guard; TC-024 unit ✅ |

Scenarios verified:
- 「積み直し後もローカル branch から fast-forward で push できる状態になる」→ TC-011 E2E ✅
- 「HEAD が detached の場合は再接続しない」→ TC-024 unit ✅

---

### Requirement 7: push が成功する通常経路の挙動は変更しない

| Normative item | Result | Evidence |
|---|---|---|
| push 成功時に restack git 操作を一切実行しない (MUST NOT) | ✅ | `commit-push.ts:881/884` — push 成功時に `return` で早期終了 |
| push 成功時に `checkpoint-restack` record を追記しない (MUST NOT) | ✅ | `recordRestack` は push 失敗経路のみで到達するコードパスにある |

Scenarios verified:
- 「push 成功時に追加の git 操作が発生しない」→ TC-026/TC-039 (integration) が git call sequence を assert ✅

---

## Acceptance Criteria Verification

| AC | 結果 |
|---|---|
| 作業 commit push 拒否 → awaiting-resume の quiescent checkpoint が publish される（parent=最終 push 成功 tip、未 push commit 含まない） | ✅ TC-001/TC-003 E2E |
| 積み直された checkpoint への attach 検証成立 + 拒否 step から再走 | ✅ TC-005 E2E |
| 積み直し push も失敗 → throw せず warn で継続 | ✅ TC-009 E2E |
| push 成功の通常経路は既存テスト無変更で green | ✅ guard 構造確認; TC-039 finalize path 検証 |
| `typecheck && test` が green | ✅ tasks.md 全チェックボックス完了; verification-result.md 参照 |

---

## 検証できなかった項目

None — 全 normative item（Requirement body の SHALL/MUST + 全 Scenario）を確認済み。
`typecheck && test` の実行結果は `verification-result.md` および tasks.md チェックボックスで確認。

## Findings 詳細

None — 指摘なし。
