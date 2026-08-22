# cross-boundary-invariants Review — halt-checkpoint-restack

**Reviewer**: cross-boundary-invariants  
**Iteration**: 2  
**Date**: 2026-08-22  

## 観点

実装そのものは正しくテストも green のまま、**変更していないコードの暗黙の前提（不変条件）を新しい挙動が黙って破っていないか**を検出する。
前周 iteration 1 の 4 件 findings（F-01〜F-04）に対して operator 裁定が下りた。本周は裁定の実施状況と
新規不変条件違反の両方を確認する。

---

## 再確認: 前周 findings の修正状況

### F-01 — `recordRestack` が `no-local-tip` 早期リターン前に呼ばれ `localTipOid: ""` の記録が disk に残る

**File**: `src/core/step/checkpoint-restack.ts:193-221`  
**前周 Severity**: medium / fixable  
**Operator 裁定**: "fixable として修正すること"  

**現状確認**:

`src/core/step/checkpoint-restack.ts` lines 193–221 を Read で確認した。

```typescript
// ── Step 3: journal record BEFORE tree construction (D5) ────────────────
// Appended here (after localTipOid resolution, before no-local-tip early exit)
// so that the restack attempt is journaled even on partial-failure paths.
// The reason field is sanitized via maskSensitive (D5).
const reason = maskSensitive(pushFailureStderr).slice(0, 500);
const restackRecord: CheckpointRestackRecord = {
  type: "checkpoint-restack",
  ...
  localTipOid,          // ← "" when localTipFailed
  unpublishedCommits,   // ← [] when localTipFailed
  ...
};
if (params.recordRestack) {
  try {
    await params.recordRestack(restackRecord);  // ← called before early exit
  } catch ...
}

// Early exit after journal record: no local tip means we cannot build a restack tree.
if (localTipFailed) {
  return { kind: "skipped", reason: "no-local-tip" };
}
```

**結論**: **修正未実施**。`recordRestack` は依然として `no-local-tip` 早期リターン前に呼ばれる。
code-fixer はコメント（"before no-local-tip early exit, so that the restack attempt is journaled even on partial-failure paths"）を追加し、意図的に保持したと読み取れる。
しかし operator 裁定は明示的に「ガードで囲む」を指示しており、この保持は裁定に反する。
`localTipOid: ""` を含む `CheckpointRestackRecord` が events.jsonl に persist される。

---

### F-02 — Operator 裁定アクション（Option A）の実施状況

**前周 Severity**: medium / decision-needed  
**Operator 裁定**: 選択肢 A 採用。  
（1）halt 時の warn メッセージに「以降の push も同じ理由で拒否される可能性がある。ローカル branch を手当てしてから resume すること」を追加  
（2）design.md の Risks に本トレードオフを記載

**現状確認**:

**（1）warn メッセージ追加**:  
`src/core/step/commit-push.ts` の `"published"` ケース出力（lines 911-917）:

```typescript
case "published":
  stderrWrite(
    `Info: checkpoint-restack: published restacked checkpoint for ${slug} ` +
      `at ${restackOutcome.restackedOid} (parent: ${restackOutcome.parentOid}, ` +
      `${restackOutcome.unpublishedCount} unpublished commit(s), graft: ${restackOutcome.graft})`,
  );
  break;
```

operator 裁定で要求された「以降の push も同じ理由で拒否される可能性がある。ローカル branch を手当てしてから resume すること」の文言は含まれていない。

**（2）design.md Risks 追記**:  
`specrunner/changes/halt-checkpoint-restack/design.md` の Risks セクション（lines 229–253）を確認した。
既存のリスク項目は次の通り:

- push 自体も拒否される → warn で継続
- graft が local history を書き換える → compare-and-swap で安全
- merge commit / restack commit が台帳から漏れる → 台帳先行追記
- events.jsonl が counters より 1 record 多い → 検査外
- resume step reads() 入力が存在しない → fail-closed
- fetch の I/O コスト → 失敗経路限定
- request 字面からの逸脱 → 受け入れ
- git 呼び出し回数増加 → 低頻度

**「graft 後の non-ephemeral runner が次回 push 時に同じ pre-receive 拒否を受けて halt → restack が繰り返され得る」というトレードオフを記載したエントリは存在しない。**

**結論**: **裁定アクション両方とも未実施**。  
- (1) 警告文言が "Info" メッセージに含まれていない  
- (2) design.md Risks に non-ephemeral push-rejection ループのトレードオフ記述がない

---

### F-03 — `FoldResult.checkpointRestacks` が空時 `undefined`

**File**: `src/store/event-journal.ts:457`  
**前周 Severity**: low / fixable  
**Operator 裁定**: "fixable として修正すること"  

**現状確認**:

```typescript
// line 457
...(checkpointRestackRecords.length > 0 ? { checkpointRestacks: checkpointRestackRecords } : {}),
```

`lineage: lineageRecords` および `operatorEvents: operatorEventRecords` は常に配列として emit されるが、
`checkpointRestacks` は依然として条件付き spread により、レコードが 0 件のとき `undefined`（フィールドなし）のまま。

**結論**: **修正未実施**。`checkpointRestacks` は `lineage`/`operatorEvents` との一貫性（常に配列）を満たしていない。

---

### F-04 — published restack commit の `state.json.synthesizedCommits` が stale

**File**: `src/core/step/checkpoint-restack.ts`（step 4b: `ls-tree localTipOid`）  
**前周 Severity**: low / fixable または design.md 既知事項記載  
**Operator 裁定**: "semantic inconsistency の解消が変更量に見合わない場合、design.md に既知事項として記載する対応でもよい"  

**現状確認**:

コードの修正は確認されない（step 4b は引き続き `ls-tree localTipOid` から state.json を取得）。

design.md の Risks セクション lines 238-240:

```
- **[Risk] merge commit / restack commit が `synthesizedCommits` 台帳から漏れると
  `EGRESS_UNKNOWN_COMMIT` で resume が止まる** → 両 OID を publish/参照より前に台帳へ追記する
  （既存 persist-before-push 不変の踏襲）。台帳追記の失敗は warn で継続し、publish は妨げない。
```

この Risk 項目は「in-memory/disk 台帳が正しく更新される」ことを説明しているが、
「published restack commit の state.json.synthesizedCommits が checkpointOid/restackedOid/mergeOid を含まないという semantic inconsistency」を **既知事項として明示していない**。

functional impact が低いことは前周同様確認済み（ephemeral runner / non-ephemeral runner どちらでも `EGRESS_UNKNOWN_COMMIT` は発生しない）。

**結論**: **修正も documention も未実施**。既知の semantic inconsistency が design.md で言及されていない。

---

## 主要不変条件の再確認（今周で新たな違反を検索）

### ✅ egress backstop との相互作用（前周 ✅ → 今周も変化なし）

`commitFinalState` は egress 検査失敗で early return（restack 未呼び出し）。  
restack push は `verifyEgressLedger` を経由しない代わりに D4 封じ込め検査で fail-closed 保証。  
graft merge commit (`mergeOid`) は `persistCommit(mergeOid)` が `update-ref` より前に実行され、
非 ephemeral runner の次回 `runInlineEgressCheck` で `mergeOid` が台帳に存在する。  
また、work commit は生成時の `commitAndPush` で既に台帳登録済みのため、
`rev-list HEAD --not --remotes/origin` の結果が台帳内に収まる。  
**不変条件を破る新たな挙動なし。**

### ✅ counter-reversal 検査との相互作用（前周 ✅ → 今周も変化なし）

restack record は `historyCount`/`stepCounts` 対象外。fold は `checkpoint-restack` type を
`checkpointRestacks` に収めてカウントしない。  
published restack commit の events.jsonl は state.json `_journal` の historyCount より
1 record 多くなるが、`detectCounterReversal` は `fold_count >= stored_count` のみを見るため
逆転は検出されない。attach 検証は通過する。  
**不変条件を破る新たな挙動なし。**

### ✅ `attachResumePolicy.reads()` tree-precheck との相互作用（前周 ✅ → 今周も変化なし）

D2 の change folder 全体 overlay により、resume step の `reads()` 必須入力が treeFiles に含まれる。
e2e テスト（`tests/halt-checkpoint-restack-e2e.test.ts`）で `runAttachVerification` pass を確認。  
**不変条件を破る新たな挙動なし。**

### ✅ journal `persist()` fast-path との相互作用（前周 ✅ → 今周も変化なし）

`recordRestack` → `fs.appendFile` → events.jsonl 直接追記。  
続く `persistBeforePush(restackedOid)` の `persist()` は fast-path（history/steps 変化なし）で
events.jsonl を再書き込みせず、state.json のみ更新。カウンタへの誤計上なし。  
**不変条件を破る新たな挙動なし。**

### ✅ temp index（`GIT_INDEX_FILE`）のworktree/index 非干渉（前周 ✅ → 今周も変化なし）

temp index は `.specrunner/local/<slug>/` 配下（git 管理外）。  
`git read-tree`・`update-index`・`write-tree` は `GIT_INDEX_FILE` 経由で temp index のみ操作。  
`git hash-object -w` はオブジェクトストアに書くが index は不使用（`GIT_INDEX_FILE` 無関係）。  
`git commit-tree`・`git update-ref` は worktree/index を変更しない。  
**既存 worktree/index の不変条件を破る挙動なし。**

### ✅ `git push <oid>:refs/heads/<branch>` push 後の fast-forward 継続（新規確認）

restack push 後、remote tip = `restackedOid`。graft 後、local HEAD = `mergeOid`（parents: [checkpointOid, restackedOid]）。  
`restackedOid` は `mergeOid` の ancestor → `mergeOid` は fast-forward から到達可能。  
次 step の `commitAndPush` は `git push -u origin <branch>` で `nextStepCommit` を push するが、
`nextStepCommit` → `mergeOid` → `restackedOid`（remote）のため fast-forward push は成立する。  
ただし push range には `mergeOid`, `checkpointOid`, `workCommits` が含まれ、元の push 拒否原因（pre-receive hook）が active なら再拒否される（F-02 の確認; non-ephemeral 環境限定）。  
**fast-forward 不変条件は破らないが、F-02 の operator 裁定アクション未実施が残存リスク。**

### ✅ `EGRESS_UNKNOWN_COMMIT` 発生有無（新規精査）

Machine B（新規 attach runner）:
- attach 読み取り state.json: synthesizedCommits に work commits のみ（checkpointOid/restackedOid/mergeOid は不在 = F-04 既知問題）
- 新ステップ commit は synthesizedCommits 経由で台帳登録済み
- `rev-list HEAD --not --remotes/origin` は restackedOid（remote）の後継のみを返す
- 台帳に存在しない unpublished commit は返されない  
**EGRESS_UNKNOWN_COMMIT は発生しない**

Machine A（non-ephemeral）:
- in-memory synthesizedCommits = [workCommits..., checkpointOid, restackedOid, mergeOid]
- `rev-list HEAD --not --remotes/origin` = [mergeOid, checkpointOid, workCommits...]
- すべて台帳内  
**EGRESS_UNKNOWN_COMMIT は発生しない**

---

## Findings 全量列挙

### 再指摘: F-01 — `recordRestack` が `no-local-tip` 早期リターン前に呼ばれ `localTipOid: ""` の記録が残る

| 項目 | 内容 |
|------|------|
| **Severity** | medium |
| **Resolution** | fixable |
| **File** | `src/core/step/checkpoint-restack.ts` |
| **Line** | 193-221 |

**再指摘理由**: Operator は「ガードで囲む」と明示したが、code-fixer はコメントで意図的保持を記録しており修正されていない。  
`git rev-parse HEAD` 失敗時に `localTipOid: ""` を含む record が events.jsonl に書かれる。
後続の commit/push が成功した場合、この record は remote に publish される。  
`CheckpointRestackRecord.localTipOid` の仕様（"The local tip OID at the time of halt"）は非空 40 桁 SHA を前提とし、空文字は semantic violation。

**修正方針**: `recordRestack` 呼び出しを `if (!localTipFailed)` で囲む。

---

### 再指摘: F-02 — Operator 裁定 Option A アクション未実施（warn メッセージ + design.md エントリ）

| 項目 | 内容 |
|------|------|
| **Severity** | medium |
| **Resolution** | fixable |
| **File** | `src/core/step/commit-push.ts`, `specrunner/changes/halt-checkpoint-restack/design.md` |
| **Line** | 911-916（commit-push.ts）; Risks セクション（design.md） |

**再指摘理由**: Operator が Option A を選択し、2 つの具体的なアクションを要求したが、どちらも実施されていない。

1. **warn メッセージ未追加**:  
   `"published"` ケースの stderrWrite に  
   「以降の push も同じ理由で拒否される可能性がある。ローカル branch を手当てしてから resume すること」  
   が含まれていない。

2. **design.md Risks 未追記**:  
   graft 後の non-ephemeral runner における push 再拒否 → halt → restack の繰り返しリスクについての
   トレードオフ記述が design.md Risks セクションに存在しない。

**修正方針**:  
(1) commit-push.ts の "published" case stderrWrite に operator 指定文言を追加する。  
(2) design.md Risks に「graft 後の non-ephemeral runner で push 再拒否ループが発生しうる」エントリを追記する。

---

### 再指摘: F-03 — `FoldResult.checkpointRestacks` が空時 `undefined`

| 項目 | 内容 |
|------|------|
| **Severity** | low |
| **Resolution** | fixable |
| **File** | `src/store/event-journal.ts` |
| **Line** | 457 |

**再指摘理由**: Operator は「fixable として修正すること」と明示したが修正されていない。  
`lineage`/`operatorEvents` が常に配列（empty OK）として返るのに対し、`checkpointRestacks` は空時に
`undefined`（フィールドなし）となる非対称性がある。  
現在は機能的影響はないが、将来の `foldResult.checkpointRestacks.forEach(...)` 型のコードが
オプショナルアクセス（`?.`）なしに書かれた場合に TypeError が発生する。

**修正方針**: `...(checkpointRestackRecords.length > 0 ? { checkpointRestacks: ... } : {})` を
`checkpointRestacks: checkpointRestackRecords` に変更し、常に配列を emit する。

---

### 再指摘: F-04 — published restack commit の `state.json.synthesizedCommits` stale が設計に記録されていない

| 項目 | 内容 |
|------|------|
| **Severity** | low |
| **Resolution** | decision-needed |
| **File** | `specrunner/changes/halt-checkpoint-restack/design.md` |
| **Line** | Risks セクション (229-253) |

**再指摘理由**: Operator は「semantic inconsistency の解消が変更量に見合わない場合、design.md に既知事項として記載する対応でもよい」と示したが、どちらの対応も取られていない。  
published restack commit の `state.json.synthesizedCommits` は `checkpointOid`/`restackedOid`/`mergeOid` を含まない（tree 構築時点ではこれらが未生成 or 未追記のため）。  
functional impact は低い（前周分析で EGRESS_UNKNOWN_COMMIT が発生しないことを確認）が、既知の semantic inconsistency として設計文書に記録されていない。

**選択肢**:
- (A) design.md Risks に既知事項として記載する（変更量が少ない推奨パス）
- (B) step 4b の後に state.json blob も disk から hash-object して上書きし、published commit の synthesizedCommits を最新化する（変更量大）

---

## まとめ

| # | Severity | Resolution | 対象ファイル | 要約 |
|---|----------|-----------|-------------|------|
| F-01 | medium | fixable | `checkpoint-restack.ts:193-221` | `localTipOid: ""` record が `no-local-tip` early-exit 前に記録される（ガード未追加） |
| F-02 | medium | fixable | `commit-push.ts:911-916`, `design.md` Risks | Operator Option A アクション 2 件未実施（warn 文言不足 + design.md 未追記） |
| F-03 | low | fixable | `event-journal.ts:457` | `checkpointRestacks` が空時 undefined（常配列 invariant 不一致） |
| F-04 | low | decision-needed | `design.md` Risks | published state.json の synthesizedCommits が stale である旨が設計文書に未記録 |

主要不変条件（egress backstop・counter-reversal・reads() tree-precheck・journal 整合性・worktree/index 非干渉）はすべて保たれている。
前周から 4 件が未解消のまま持ち越され、新規の不変条件違反は発見されなかった。
