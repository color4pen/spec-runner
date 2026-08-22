# cross-boundary-invariants Review — halt-checkpoint-restack

**Reviewer**: cross-boundary-invariants  
**Iteration**: 3  
**Date**: 2026-08-22  

## 観点

実装そのものは正しくテストも green のまま、**変更していないコードの暗黙の前提（不変条件）を新しい挙動が黙って破っていないか**を検出する。  
前周 iteration 2 の 4 件 findings（F-01〜F-04）に対して operator 裁定が下り、code-fixer が修正を適用した。
本周は裁定の実施状況を実際にコードを読んで確認し、新規不変条件違反の有無を検査する。

---

## 再確認: 前周 findings の修正状況

### F-01 — `recordRestack` が `no-local-tip` 早期リターン前に呼ばれ `localTipOid: ""` の記録が disk に残る

**前周 Severity**: medium / fixable  
**Operator 裁定**: "F-01 — recordRestack 呼び出しを localTipOid 取得成功時のみ実行するガードで囲む"

**現在の実装** (`src/core/step/checkpoint-restack.ts` lines 170–220 を Read で確認):

```typescript
// ── Step 2: local tip + unpublished commits ──────────────────────────────
const localTipResult = await spawnFn("git", ["rev-parse", "HEAD"], { cwd });
const localTipOid = localTipResult.stdout.trim();
const localTipFailed = (localTipResult.exitCode ?? 1) !== 0 || !localTipOid;

// ...unpublished commits logic (only if !localTipFailed)...

// Early exit: no local tip means we cannot build a restack tree and there
// is no valid localTipOid to include in the journal record (CheckpointRestackRecord
// requires a non-empty 40-char SHA per spec). Skip both record and tree build.
if (localTipFailed) {
    return { kind: "skipped", reason: "no-local-tip" };
}

// ── Step 3: journal record BEFORE tree construction (D5) ────────────────
// Appended after localTipOid is confirmed valid (non-empty).
const restackRecord: CheckpointRestackRecord = {
    ...,
    localTipOid,   // ← confirmed non-empty here
    ...
};
if (params.recordRestack) {
    try {
        await params.recordRestack(restackRecord);
    } catch (err) { ... }
}
```

**結論**: **修正済み**。`localTipFailed` 早期リターンは Step 3 の `recordRestack` 呼び出しより前に配置されており、`localTipOid: ""` を含む journal record が disk に残ることはなくなった。コメントも意図を明示している。✅

---

### F-02 — Operator 裁定アクション（Option A）の実施状況

**前周 Severity**: medium / decision-needed  
**Operator 裁定**: "(1) halt 時の warn メッセージに「以降の push も同じ理由で拒否される可能性がある。ローカル branch を手当てしてから resume すること」を追加、(2) design.md の Risks に本トレードオフを記載（code-fixer は design.md に書けないため operator が別途実施）"

**現在の実装** (`src/core/step/commit-push.ts` lines 910–928 を Read で確認):

```typescript
case "published":
    stderrWrite(
        `Info: checkpoint-restack: published restacked checkpoint for ${slug} ` +
        `at ${restackOutcome.restackedOid} (parent: ${restackOutcome.parentOid}, ` +
        `${restackOutcome.unpublishedCount} unpublished commit(s), graft: ${restackOutcome.graft})`,
    );
    stderrWrite(
        `Warning: checkpoint-restack: 以降の push も同じ理由で拒否される可能性がある。ローカル branch を手当てしてから resume すること`,
    );
    break;
```

**結論 (1)**: **修正済み**。裁定で要求された正確な文言が stderrWrite として追加されている。✅  

**F-02(2) design.md 追記について**: operator 裁定 (code-fixer step) に「design.md への記載は行わない。design.md Risks 追記は operator が pipeline 外で別途実施する。この裁定を根拠に、design.md 未記載は本 round では needs-fix としないこと」と明記されている。**本 round では再指摘しない**。✅

---

### F-03 — `checkpointRestacks` が空時 `undefined`（`lineage` / `operatorEvents` は常に配列）

**前周 Severity**: low / fixable  
**Operator 裁定**: "F-03 — checkpointRestacks を常に配列で emit する"

**現在の実装** (`src/store/event-journal.ts` lines 347, 457 を Read で確認):

```typescript
// fold() 内初期化:
const checkpointRestackRecords: CheckpointRestackRecord[] = [];

// fold() return 文:
return {
    ...
    checkpointRestacks: checkpointRestackRecords,  // 常に配列（条件なし）
    ...
};
```

**結論**: **修正済み**。`checkpointRestacks` は常に（空でも）配列として返される。`lineage`・`operatorEvents` と同等の扱いになった。✅

なお `FoldResult` インターフェースの `checkpointRestacks?` は optional のままだが、コメントに「Optional so pre-existing hand-built FoldResult literals compile without change」と理由が記載されており設計意図通り。`TC-014-c` テストの assertion (`undefined || length === 0`) は空配列で pass する。

---

### F-04 — published restack commit の `state.json.synthesizedCommits` stale が設計文書に未記録

**前周 Severity**: low / decision-needed  
**Operator 裁定**: "F-04 は code 側で対応可能な範囲でのみ修正し、design.md への記載は行わない。design.md への既知事項記載は operator が pipeline 外で別途実施する。この裁定を根拠に、design.md 未記載は本 round では needs-fix としないこと。"

**コード側修正** (`src/core/runtime/local.ts` lines 761–774 を Read で確認):

```typescript
const persistBeforePush: ((oid: string) => Promise<void>) | undefined = slugOpts
    ? async (oid: string) => {
        await this.updateJobState(state.jobId, (s) => appendSynthesizedCommit(s, oid), slugOpts);
        // Keep the caller's in-memory state consistent with the disk ledger so any
        // later wholesale store.persist of this state cannot roll back the append.
        const ledger = (state.synthesizedCommits ??= []);
        if (!ledger.includes(oid)) ledger.push(oid);
    }
    : undefined;
```

`persistCommit` として `restackCheckpointOntoPublishedTip` に渡されるこの callback は、restack OID・graft merge OID 両方について disk 側と in-memory 側を同期更新する。これにより「halt 経路の wholesale store.persist が台帳追記を巻き戻す」問題はコード側で解消済み。  
**「published restack commit の tree に含まれる state.json は restack OID 自体を synthesizedCommits に持たない」**という設計上の semantic inconsistency は変わらないが、これは functional bug ではなく（restack OID は origin に存在するため rev-list range に入らない）、design.md に既知事項として記載される予定。

**結論**: コード側の修正は実施済み。design.md 未記載は裁定通り本 round では指摘しない。✅

---

## 新規不変条件検査

前周まで指摘がなかった以下の不変条件を今周で追加検査した。

### I-1: egress backstop 不変条件の保持

**検査対象**: `git rev-list HEAD --not --remotes=origin` の全 OID が `synthesizedCommits` に存在すること

**検証**:

graft 後のローカル branch tip は `mergeOid`（graft commit）であり、その ancestry には次の OID が含まれる:
- `mergeOid`（graft merge commit）
- `checkpoint_commit`（C1: halt 時の checkpoint commit）
- 未 push の work commit 群（ step N+1 以降の中間 commit）

これらは全て `synthesizedCommits` に追記されているか確認:
- `checkpoint_commit`: `commitFinalState` 内の `persistBeforePush(C1)` ✓
- `mergeOid`: `_doGraft` 内の `persistCommit(mergeOid)`（`update-ref` より前） ✓
- work commits: 各 step の `commitAndPush` の `persistBeforePush` ✓
- restack commit 自体: origin に push 済みなので `--not --remotes=origin` の range 外 ✓

**結論**: egress backstop 不変条件は保持されている。

### I-2: attach quiescence 不変条件の保持

**検査対象**: `origin/<branch>` の tip が `attachQuiescentPolicy` を通過すること

restack push 後 `origin/<branch>` tip = `restackedOid`。
`restackedOid` の tree には `localTipOid` の change folder が overlay されており、state.json の `status: "awaiting-resume"` が含まれる。
`attachQuiescentPolicy` が参照する `status` フィールドはこの値を読む。

**結論**: attach quiescence 不変条件は保持されている。✓

### I-3: counter reversal 不変条件の保持

**検査対象**: `fold(eventsFromRestackCommit).historyCount` ≥ `state._journal.historyCount`（逆転がないこと）

`checkpoint-restack` record は `historyCount` / `stepCounts` を増やさない（`lineage` / `operator-event` と同じ journal-only 扱い）。  
restack commit の events.jsonl には `checkpoint-restack` record が 1 件追加されているが、`fold()` は `historyCount` を増やさない。state.json の `_journal.historyCount = N` に対して `fold().historyCount = N` となり逆転は生じない。

**結論**: counter reversal 不変条件は保持されている。✓

### I-4: attach resume policy（必須入力ファイル存在）の保持

**検査対象**: resume step の `reads()` 必須入力が restack checkpoint tree に存在すること

D2 により overlay 単位は管理パスのみではなく change folder 全体（`specrunner/changes/<slug>/`）。  
`localTipOid` の tree から ls-tree で得た全エントリを temp index に反映しているため、commit 済みの成果物ファイル（`spec.md`, `tasks.md`, `design.md` 等）は restack commit の tree に含まれる。

**結論**: attachResumePolicy の必須入力存在要件は保持されている。✓

### I-5: 差分封じ込め不変条件の保持

**検査対象**: restack commit が未 push 作業 commit の内容を publish しないこと

D4 の containment check (`git diff --name-only <parentOid> <restackedOid>`) が全差分パスを `specrunner/changes/<slug>/` 配下に限定することを確認。  
`changeDirPrefix = changeFolderPath(slug) + "/"` の prefix 比較は、類似 slug（例: `<slug>-extra/`）のパスを誤って許容しない（`"<slug>-"` は `"<slug>/"` で始まらない）。  

**結論**: 差分封じ込め不変条件は構造的（D3 の temp index 操作）かつ実行時（D4 の containment check）の両層で保持されている。✓

### I-6: worktree 汚染不変条件

**検査対象**: restack が worktree / HEAD index を変更しないこと

D3 の temp index 操作（`GIT_INDEX_FILE` 環境変数）を使用しており、実際の `.git/index` は変更されない。  
ただし `recordRestack` が WORKTREE の `events.jsonl` に append することにより、restack 後は events.jsonl が HEAD（graft commit）に対して dirty になる。  
この dirty 状態は次 step の `commitAndPush`（managed paths の staging を含む）によって自然にコミットされ、pipeline に悪影響を与えない。`JobJournal.persist()` の delta 計算も `checkpoint-restack` record を重複 append しない（`historyCount` / `stepCounts` に寄与しないため delta = 0）。

**結論**: worktree 汚染（source code の消失・混入）は発生しない。events.jsonl の dirty 状態は意図的かつ安全。✓

### I-7: `GIT_INDEX_FILE` overlay の SpawnFn 互換性

**検査対象**: `SpawnFn`（`src/util/spawn.ts`）が `env` overlay をサポートすること

`SpawnOptions.env?: Record<string, string | undefined>` が定義されており、実装は `{ ...stripSecrets(process.env), ...opts.env }` でマージする。  
`stripSecrets` は `/_TOKEN$/i`, `/_API_KEY$/i`, `/_SECRET$/i` のみを除去し、`GIT_INDEX_FILE` は除去対象外。  

**結論**: `GIT_INDEX_FILE` は subprocess に正常に渡される。✓

---

## 判定まとめ

| Finding | 前周状態 | 本周状態 | 判定 |
|---------|---------|---------|------|
| F-01 recordRestack guard | UNRESOLVED | FIXED | ✅ |
| F-02(1) warn 文言追加 | UNRESOLVED | FIXED | ✅ |
| F-02(2) design.md Risks 追記 | UNRESOLVED | operator 担当（本 round 対象外） | ✅ |
| F-03 checkpointRestacks 常に配列 | UNRESOLVED | FIXED | ✅ |
| F-04 stale synthesizedCommits design 記載 | UNRESOLVED | code 修正済み、design.md は operator 担当 | ✅ |
| I-1〜I-7 新規不変条件 | 未検査 | 全件 保持確認 | ✅ |

**前周 findings は全件解消またはオペレーター裁定で本 round 対象外と確認した。新規不変条件違反は検出されなかった。**
