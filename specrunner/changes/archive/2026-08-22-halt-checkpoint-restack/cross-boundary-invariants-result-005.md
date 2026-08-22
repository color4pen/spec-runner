# cross-boundary-invariants Review — halt-checkpoint-restack

**Reviewer**: cross-boundary-invariants  
**Iteration**: 5  
**Date**: 2026-08-22  

## 観点

変更していないコードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。  
実装そのものは正しくテストも green のまま、既存機構との相互作用にだけ欠陥が宿るクラスのバグが対象。

---

## 前周以降の変更ファイル（machine-derived, code-fixer ラウンド）

prior-round-context に記載された変更ファイル:

| ファイル | 種別 | 変更内容 |
|---|---|---|
| `specrunner/changes/halt-checkpoint-restack/events.jsonl` | pipeline 状態ファイル | コードではない、スキップ |
| `specrunner/changes/halt-checkpoint-restack/state.json` | pipeline 状態ファイル | コードではない、スキップ |
| `specrunner/changes/halt-checkpoint-restack/usage.json` | pipeline 状態ファイル | コードではない、スキップ |
| `src/store/__tests__/event-journal-checkpoint-restack.test.ts` | **新規テストファイル（全体）** | TC-006 含む 4 テストスイート追加 |

加えて git diff main...HEAD で確認:

| ファイル | 変更内容 |
|---|---|
| `src/store/event-journal.ts` | `CheckpointRestackRecord` 型定義、`EventRecord` union 追加、`fold()` で `checkpointRestacks` 常時 emit |
| `src/core/step/checkpoint-restack.ts` | F-01 fix: `localTipOid` guard でガード後に `recordRestack` を呼び出す |
| `src/core/step/commit-push.ts` | F-02(1) fix: restack 成功時に「以降の push も同じ理由で拒否される可能性がある」警告を追加 |
| `src/store/journal-integrity.ts` | 変更なし（grep で "checkpoint-restack" なし） |

---

## 前周 (iter 4) 確認済み不変条件の継続保持

生産コードのうち iter 4 で確認した I-1〜I-7 は、今回も変更対象外（`src/core/step/checkpoint-restack.ts` は F-01 guard のみの変更）。

| ID | 不変条件 | 前周状態 | 今周状態 |
|---|---|---|---|
| I-1 | egress backstop 不変条件（`verifyEgressLedger` と D4 封じ込め検査の境界） | ✅ | ✅ 変更なし |
| I-2 | attach quiescence 不変条件（restack commit が `attachQuiescentPolicy` を通過） | ✅ | ✅ 変更なし |
| I-3 | counter reversal 不変条件（`checkpoint-restack` record が `historyCount`/`stepCounts` に寄与しない） | ✅ | ✅ fold() 変更で引続き保持 |
| I-4 | `attachResumePolicy` 必須入力存在確認（change folder 全体 overlay で `reads()` 入力が tree に含まれる） | ✅ | ✅ 変更なし |
| I-5 | 差分封じ込め不変条件（D4: diff パスが全件 `changeDir/` 配下） | ✅ | ✅ 変更なし |
| I-6 | worktree / index 汚染不変条件（`GIT_INDEX_FILE` が実 index を保護） | ✅ | ✅ 変更なし |
| I-7 | `GIT_INDEX_FILE` と `SpawnFn` 互換性（`temp index` が適切な path に作成） | ✅ | ✅ 変更なし |

---

## 今周の新規検査

### 検査 A: F-01 修正 — `localTipOid` guard

**変更前の問題（iter 3 指摘）**: `recordRestack` は `localTipOid` 取得より前に呼ばれる可能性があり、空文字の `localTipOid` を含む record が journal に書き込まれ得た。

**今周確認内容**（`src/core/step/checkpoint-restack.ts` lines 176–204）:

```typescript
const localTipFailed = (localTipResult.exitCode ?? 1) !== 0 || !localTipOid;
// ...（rev-list も localTipFailed のガード内）
if (localTipFailed) {
    return { kind: "skipped", reason: "no-local-tip" };
}
// Step 3: journal record BEFORE tree construction (D5) — only reached if !localTipFailed
if (params.recordRestack) { ... }
```

`recordRestack` の呼び出しが `localTipFailed` 早期 return **より後**に配置されており、`localTipOid` が空のときは record が書き込まれない。**不変条件保持を確認。**

### 検査 B: F-03 修正 — `checkpointRestacks` 常時配列 emit

**変更前の問題（iter 3 指摘）**: `fold()` が `checkpointRestacks` を conditional spread するため、record がない場合に `undefined` になり得た。

**今周確認内容**（`src/store/event-journal.ts` fold() return）:

```typescript
const checkpointRestackRecords: CheckpointRestackRecord[] = [];
// ...
return {
    steps, history, stepsTotal, stepCounts, historyCount: historyRecords.length,
    lineage: lineageRecords,
    operatorEvents: operatorEventRecords,
    findingRecency: findingRecencyRecords,
    checkpointRestacks: checkpointRestackRecords,  // ← 常時配列
    ...(lastInterruption !== undefined ? { lastInterruption } : {}),
    ...(corruption !== undefined ? { corruption } : {}),
};
```

`checkpointRestackRecords` は常に `[]` 以上として初期化されており、戻り値に無条件で含まれる。**不変条件保持を確認。**

### 検査 C: F-02(1) — halt 警告メッセージ

**変更前の問題（operator 裁定）**: restack 成功時に「以降の push も同じ理由で拒否される可能性がある」警告が欠如していた。

**今周確認内容**（`src/core/step/commit-push.ts` lines 917–926）:

```typescript
case "published":
    stderrWrite(`Info: checkpoint-restack: published restacked checkpoint for ${slug} ...`);
    stderrWrite(
        `Warning: checkpoint-restack: 以降の push も同じ理由で拒否される可能性がある。` +
        `ローカル branch を手当てしてから resume すること`,
    );
    break;
```

restack `published` 時に警告が emit される。**実装済みを確認。**

### 検査 D: TC-006 テスト — `detectCounterReversal` が null を返す確認

operator 裁定「event-journal-checkpoint-restack.test.ts に TC-006 の describe を追加し、detectCounterReversal(existingCounters, foldResult) が null を返すことを直接 assert する」。

**今周確認内容**（`src/store/__tests__/event-journal-checkpoint-restack.test.ts` lines 74–141）:

TC-006 は 3 つの sub-test (`TC-006-a`, `TC-006-b`, `TC-006-c`) を持ち、それぞれ:
- (a) step-attempt + transition + checkpoint-restack がある場合 → `detectCounterReversal` が null
- (b) checkpoint-restack 2 件 → null
- (c) checkpoint-restack のみ（counter = 0）→ null

`detectCounterReversal(storedCounters, foldResult)` を**直接呼び出して**確認している。**I-3 不変条件のテスト固定を確認。**

### 検査 E: `job-journal.ts persist()` ENOENT fallback との相互作用

`persist()` の ENOENT fallback（line 134）:

```typescript
foldResult = { steps: {}, history: [], stepsTotal: 0, stepCounts: {}, historyCount: 0,
               lineage: [], operatorEvents: [], findingRecency: [] };
```

このオブジェクトには `checkpointRestacks` が含まれない（`undefined`）。  
`persist()` 内で `detectCounterReversal(existingCounters, foldResult)` を呼ぶが、この関数は `historyCount` と `stepCounts` のみ参照するため `checkpointRestacks: undefined` は問題を起こさない。  
`FoldResult.checkpointRestacks` は型定義で `?` optional であり、このフォールバックはコンパイル上も問題なし。**不変条件保持を確認。**

### 検査 F: `events.jsonl` 書き込みパスの一貫性（recordRestack vs hash-object）

- `recordRestack` コールバック（`local.ts` lines 782–786）: `new JobStateStore(state.jobId, slugOpts.stateRoot, slugOpts)` → `<stateRoot>/specrunner/changes/<slug>/events.jsonl` に書き込む
- `git hash-object -w -- eventsRelPath` （`checkpoint-restack.ts` line 343）: `eventsRelPath = slugEventsPath(slug) = "specrunner/changes/<slug>/events.jsonl"` を `cwd` 相対で読む

`cwd` = `deps.cwd ?? process.cwd()` = worktree パス  
`stateRoot` = `this.workspace?.worktreePath ?? this.workspace?.cwd` = worktree パス  

両者が同一 worktree path を指すため、`recordRestack` が書き込んだ events.jsonl を `hash-object` が正しく読む。**パス一貫性を確認。**

### 検査 G: graft 後の `synthesizedCommits` ロールバックリスク

`persistBeforePush(restackedOid)` および `persistBeforePush(mergeOid)` は各々:
1. `updateJobState` でディスク state.json に OID を追記
2. `state.synthesizedCommits` in-memory も追記（ローカル参照を mutate）

pipeline が後続で `store.persist(state)` を呼ぶ場合、in-memory の `state.synthesizedCommits` は最新の OID を含んでいるため、wholesale persist でロールバックが起きない。  
**既存 `appendOidInPlace` パターンと同一の安全策が機能することを確認。**

---

## 全件 findings 総括

| ID | 種別 | 状態 | 備考 |
|---|---|---|---|
| I-1 | egress backstop 境界 | ✅ 保持 | 変更なし |
| I-2 | attach quiescence 境界 | ✅ 保持 | 変更なし |
| I-3 | counter reversal 境界 | ✅ 保持 | fold() + TC-006 でテスト固定 |
| I-4 | attachResumePolicy reads() 境界 | ✅ 保持 | 変更なし |
| I-5 | 差分封じ込め境界 | ✅ 保持 | 変更なし |
| I-6 | worktree 汚染境界 | ✅ 保持 | 変更なし |
| I-7 | GIT_INDEX_FILE 互換性 | ✅ 保持 | 変更なし |
| F-01 | localTipOid guard | ✅ 解消済み | early return 後に recordRestack |
| F-02(1) | halt warn 追加 | ✅ 解消済み | published 時 warning emit |
| F-03 | checkpointRestacks 常時配列 | ✅ 解消済み | fold() 無条件 emit |
| A: paths 一貫性 | events.jsonl path | ✅ 問題なし | cwd == stateRoot |
| B: persist fallback | ENOENT fallback | ✅ 問題なし | detectCounterReversal は参照しない |
| C: graft rollback | synthesizedCommits | ✅ 問題なし | in-memory mutate で一貫 |

**新規 cross-boundary invariant 違反: なし**

---

## Evidence

- 確認ファイル数: 14 ファイル（`checkpoint-restack.ts`, `commit-push.ts`, `local.ts`, `event-journal.ts`, `journal-integrity.ts`, `job-journal.ts`, `job-state-store.ts`, `checkpoint-policy.ts`, `verify-checkpoint.ts`, `paths.ts`, `halt-checkpoint-restack-e2e.test.ts`, `event-journal-checkpoint-restack.test.ts`, `commit-push-restack-integration.test.ts`, `checkpoint-restack.test.ts` の unit test）
- `git diff main...HEAD` で実際の変更を確認
- 前周で確認した I-1〜I-7 はコード変更がないため継続保持
- F-01/F-02(1)/F-03 は今周の diff で解消を確認
- TC-006 test は `detectCounterReversal(existingCounters, foldResult)` への直接 assert を含む
