# cross-boundary-invariants Review — evidence-authorship-enforcement

- **iteration**: 1
- **verdict**: needs-fix

---

## 観点

変更が**変更していない**コードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。実装そのものは正しくテストも green のまま、既存機構との相互作用にだけ欠陥が宿るクラスのバグを対象とする。

---

## F-01 【needs-fix / high】 signal handler が anchor holder を迂回する — SIGINT resume で false tamper detection

### ファイル
`src/core/runtime/local.ts:1439-1448` (`registerCleanup` の `makeStore` クロージャ)

### 違反する不変条件

> 「pipeline-owned journal への全 write は `anchorHolder` を注入した `JobStateStore` 経由で行われ、in-process anchor holder は常に pipeline が authored した journal の最新 bytes を反映する」

`registerCleanup` の `makeStore` クロージャ（line 1441）は次のように構築する:

```ts
return new JobStateStore(jobId, cwd, slugOpts);
```

`slugOpts = this.slugStoreOpts()` は `{ slug, stateRoot }` であり、`anchorHolder` を含まない。`this.journalAnchor` が `LocalRuntime` のフィールドとして存在するにもかかわらず、`makeStore` に渡されていない。

### 経路

1. pipeline 実行中に SIGINT/SIGTERM が届く
2. `signalCleanup` が `makeStore()` を呼んで anchor holder なしの store を生成
3. `store.appendInterruption(...)` → events.jsonl に interruption 行を append（holder 未更新）
4. `store.persist(awaiting-resume state)` → state.json を overwrite（holder 未更新）
5. `process.exit(130)` → `commitFinalState` は**呼ばれない** → origin anchor は更新されない

### resume 時の破綻

prior checkpoint が存在する（= origin anchor が存在する）ジョブで SIGINT 後に resume すると:

| | bytes |
|---|---|
| origin anchor | checkpoint 時点の digest |
| on-disk journal | checkpoint bytes + signal handler 追記分 |

`verifyResumeJournalAuthenticity` が不一致を検出 → tamper と判定 → `restoreResumeJournal` が checkpoint bytes で on-disk を上書き → `PrepareError` でブロック。

**2 回目の resume は成功するが**、signal handler が書いた interruption record は消え、ジョブは checkpoint 状態から再開する。

### テストとの乖離

T6「false-positive なし」が "意図的な awaiting-resume 停止からの resume" を対象とする。SIGINT は signal handler という設計済みの停止機構を経由した「意図的な awaiting-resume 遷移」であり、crash とは性格が異なる。しかし実装では anchor holder が更新されないため、crash と同等の扱い（first resume block）になる。

### 修正方針

`makeStore` クロージャに `anchorHolder` を含める:

```ts
return new JobStateStore(jobId, cwd, { ...slugOpts, anchorHolder: this.journalAnchor });
```

ただし、これだけでは `commitFinalState`（anchor push）を経ずに `process.exit(130)` するため origin anchor は依然として stale になる。完全な修正は signal handler が exit 前に `pushEvidenceAnchor` を呼ぶか、あるいは resume 時の absent-anchor 規則に「signal 由来の interruption record のみが delta の場合は skip」を追加することで対応する。いずれも設計判断を要する（options 欄参照）。

---

## F-02 【decision-needed / medium】 stale-running 復元 write が authenticity check 前に on-disk を書き換える

### ファイル
`src/core/command/resume.ts:130-153` (stale detection) vs `src/core/command/resume.ts:197-256` (authenticity check)

### 違反する不変条件

> 「resume authenticity check は on-disk の状態を変更する前に実行し、on-disk が check 対象として確定している」

`resume.ts` は次の順序で実行する:

```
1. isStaleRunning → true
2. staleStore.persist(awaiting-resume state)   ← on-disk を書き換える
3. verifyResumeJournalAuthenticity             ← 書き換え後の on-disk を検査
```

`staleStore` は anchor holder なしで生成され（`resolveStateStoreByJobId` または直接構築）、on-disk に awaiting-resume への history entry を書く。prior checkpoint が存在する場合:

- origin anchor = checkpoint digest  
- on-disk = checkpoint bytes + stale-recovery write

→ 不一致 → tamper 判定 → restore（stale-recovery write を消去）→ resume ブロック

2 回目の resume は成功する（on-disk = checkpoint state = awaiting-resume）。

### 設計意図との整合

「stale-running」はプロセスが cleanup なしに死んだ crash シナリオであり、設計 D8 の「crash resume は fail-closed (accepted)」に分類できる。その場合、first resume block は意図通り。

しかし stale-recovery が「on-disk を変更してから authenticity check」する現状の順序は、check 後に stale-recovery を行えばより安全かつ意図が明確になる:

```
1. verifyResumeJournalAuthenticity  ← 先に check（on-disk 未変更）
2. isStaleRunning → 必要なら stale-recovery
```

---

## O-01 【観測 / low】 `commitAndPush` pathspec 除外は事前 staged ファイルを unstage しない

### ファイル
`src/core/step/commit-push.ts:52-56`

```ts
const excludeArgs = managedPaths.map((p) => `:(exclude)${p}`);
const addResult = await gitExecResult(infra.spawnFn, cwd, ["add", "-A", "--", ".", ...excludeArgs]);
```

`git add -A -- . :(exclude)<path>` は already-staged ファイルを unstage しない。agent が事前に `git add specrunner/changes/<slug>/events.jsonl` で journal を stage していた場合、pipeline の `git add` がその stage を引き継ぎ、tampered journal が agent code commit に混入する。

ただし、後続の `verifyNodeJournalAuthorship` の committed-tree tooth（`diffPathsBetweenCommits`）がこれを検出し halt するため、bypass 経路にはならない。detection → restore → checkpoint で authentic bytes に上書きされる。

**セキュリティ上は問題ない**が、「tampered journal が branch 履歴に一時的に記録される」という副作用があることを観測として記録する。修正するなら `git restore --staged <paths>` を `git add` 前に挿入する。

---

## O-02 【観測 / low】 durable anchor push の失敗は silent degradation になる

### ファイル
`src/git/evidence-anchor-ref.ts:54-107` (`pushEvidenceAnchor`)

`pushEvidenceAnchor` は best-effort（throw しない）で、push 失敗時は stderr に warning を出力するだけ。push が連続失敗すると origin anchor が stale のまま残り、resume 時に `readEvidenceAnchor` が absent を返して skip（無検証）になる。

fail-open にはならない（absent → skip は設計 D7 で「ref 不在は agent が誘発できない」を根拠に安全とされる）が、network 障害が継続する環境では検証がサイレントに無効化される。

設計上 accepted だが、skip が起きたことを journal に記録する観測性向上が将来的に望ましい。

---

## 全体評価

実装は設計 D1〜D8 を概ね忠実に反映しており、per-node / resume / attach の各経路で invariant enforcement の骨格が確立している。

F-01 が唯一の needs-fix 所見。`registerCleanup` の `makeStore` クロージャが `anchorHolder` を欠いており、SIGINT/SIGTERM 停止後の resume で意図せず tamper detection が発火する経路がある。T6（false-positive なし）との整合性を設計者が明示的に確認・判断する必要がある。

F-02 は ordering の改善提案だが、stale-running を crash として扱う場合は現状許容範囲。

O-01 / O-02 は情報共有のみで action 不要。
