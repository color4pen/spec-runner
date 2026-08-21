# Design: plain archive の状態遷移を merge 境界に合わせる

## Context

### 現状

`specrunner job archive <slug>` には 2 つの経路がある。

| 経路 | 実装 | `archived` 遷移の位置 |
|------|------|----------------------|
| plain `job archive <slug>` | `src/core/archive/orchestrator.ts` | archive record commit を作る時点（`orchestrator.ts:242-258`、`deferArchivedTransition` が false のため `markJobArchived()` を呼ぶ） |
| `job archive --with-merge <slug>` | `src/core/archive/merge-then-archive.ts` | PR merge 成功後（`deferArchivedTransition: true` で record 時の遷移を抑止し、`merge-then-archive.ts:782-788` で `markJobArchived` + `runPostMergeCleanup`） |

plain 経路の実際の副作用は「change folder を `specrunner/changes/archive/<date>-<slug>/` へ mv し、feature branch に commit して `git push origin <feature-branch>` する」であり（`orchestrator.ts:349-361`）、base branch には一切触らない。つまり plain archive が作るのは **PR に積まれる archive record** であって、変更の取り込みそのものではない。にもかかわらず job status は record 時点で terminal (`archived`) になる。

この結果、次の不整合が起こりうる。

```text
awaiting-archive → archive record commit / push → archived → CI failure / PR unmerged
```

`archived` は `TERMINAL_STATUSES`（`src/state/lifecycle.ts:58`）かつ `VALID_TRANSITIONS` 上の出口なし状態なので、この状態に落ちた job は正規経路で復帰できない（`job reopen` の operator 経路のみ）。

### 前提として成立していること

- `job archive --from-issue <n>`（`src/cli/archive-from-issue.ts`）は `attachArchivePolicy`（`src/core/attach/checkpoint-policy.ts:128-143`）で `status === "awaiting-archive"` かつ `pullRequest.number` あり、を要求して remote checkpoint を rebind し、最後に `runArchive()` を呼ぶ（`archive-from-issue.ts:179-184`）。つまり **archive record を Actions 側の execution face で作る**前提は既に成立している。
- archive の各素片は既に冪等である。`archiveChangeFolder`（`src/core/finish/archive-change-folder.ts:37-43`、active folder 不在なら `skipped: true`）、`commitArchive`（`src/core/finish/commit-archive.ts:47-50`、staged 差分なしなら `skipped: true`）、`markJobArchived`（`src/core/finish/job-state-update.ts`、既に archived なら noop）。
- `runPostMergeCleanup`（`src/core/archive/post-merge-cleanup.ts`）は worktree 撤去 / branch 削除 / sidecar 削除を best-effort・冪等に行い、job status は書かない。
- `merge-then-archive.ts:251-260` は「archive record 済みか」を `sourceChangeDir` の親 basename が `archive` か否かで判定し、MERGED 検出時に crash-resume（transition + cleanup）と order error（record 前に merge された）を切り分ける。この判定素材は `JobStateStore.listWithSourceDirs(cwd, { includeArchived: true })` から得られ、worktree 内の archive folder も走査対象である（`src/store/job-catalog.ts` の worktree archive 走査）。

### 制約

- archive 本体（`src/core/archive/orchestrator.ts`）が GitHubClient に依存しない（client-closed）という不変は維持する（`orchestrator.ts:4` のコメントで宣言されている）。
- `core/archive` package 自体は既に GitHubClient に依存する module（`merge-then-archive.ts`）を持つため、merge 境界を観測する module を同 package に追加しても新しい layer / DSM edge は生じない。
- 既存の archive / from-issue / with-merge テストは（plain archive の旧意味を pin する 1 件を除き）無変更で green であること。特に `merge-then-archive.test.ts` の TC-001 は `runArchiveOrchestrator` が `deferArchivedTransition: true` を伴って呼ばれることを pin しており、`ArchiveInput` からこのフィールドを削除すると壊れる。
- `tests/unit/cli/help-flag-dispatch.test.ts` は `ARCHIVE_USAGE` に `"Archive the completed change folder"` が含まれることを pin している。

## Goals / Non-Goals

**Goals**:

1. plain `job archive` が archive record commit を作成・push しても job status を `awaiting-archive` に保つ。
2. `archived` への terminal transition を「対象 PR が merge 済み」であることの確認後に限定する。
3. out-of-band（GitHub UI 等）で merge された場合に、`job archive <slug>` / `job archive --from-issue <n>` の**再実行**で `archived` + post-merge cleanup まで完結できる。
4. archive record 済み・PR 未merge の状態からの再実行を冪等にする（archive commit を重複させない）。
5. `--with-merge` の既存経路（record → CI wait → merge → archived → cleanup）を意味・出力ともに維持する。
6. plain / `--with-merge` 両経路が「merge 境界」「archive record 済み判定」「post-merge 完了処理」で同一実装を共有し、以後 drift しない構造にする。

**Non-Goals**:

- 新しい CLI コマンド（`archive-prepare` 等）や新しい job status の追加。`VALID_TRANSITIONS` / `TERMINAL_STATUSES` は無変更。
- webhook / event 駆動の新しい状態機構の導入（要件 4 で明示的に後回し）。
- plain `job archive` に CI 待ち・polling・merge 実行を持たせること（それは `--with-merge` の責務）。
- merge 後の `archived` status を base branch に commit して**永続化**すること（後述 R-2 / Q-1。base への直接 commit は archive の設計不変に反するため今回は扱わない）。
- `attachArchivePolicy` / `--from-issue` の解決規則の変更。

## Decisions

### D1: archive orchestrator から terminal transition を取り除き、「記帳のみ」に固定する

`runArchiveOrchestrator` は `markJobArchived` を一切呼ばない。責務を「change folder の mv → draft 掃除 → design-layer hook → commit → feature branch へ push → headSha 返却」に限定する。`orchestrator.ts` の module docstring からも `markJobArchived` を除く。

`ArchiveInput.deferArchivedTransition` フィールドは **受け取るが無視する deprecated 入力として残す**。理由は、`merge-then-archive.test.ts` の TC-001 が呼び出し側の契約（`deferArchivedTransition: true` を渡すこと）を pin しており、この with-merge テストは無変更 green が要件だから。フィールドの JSDoc に「deferral は無条件になったため入力は無視される / 呼び出し契約互換のためだけに残る」と明記する。

- **Rationale**: 「plain 経路は defer が既定」ではなく「orchestrator は transition しない」という構造にすることで、要件 2（terminal transition は merge 後のみ）を**呼び出し側の設定ミスで破れない形**にできる。plain / with-merge のどちらから呼んでも record は同じ意味になる。
- **Alternatives considered**:
  - `deferArchivedTransition` の既定値を `true` に反転する: フィールドは意味を保つが、`false` を渡す呼び出し側が存在しない死んだ分岐が残り、かつ「呼び出し側が false を渡せば merge 前に terminal にできる」抜け道が残る。
  - フィールドを削除する: 設計上は最もきれいだが `merge-then-archive.ts:283` の呼び出しと TC-001 が壊れ、「with-merge テスト無変更 green」の受け入れ基準に反する。
  - transition を `markJobArchived` 側の内部条件（PR 状態を見る）に押し込む: `core/finish` が GitHubClient に依存することになり、client-closed 不変を最も広い範囲で壊す。

### D2: merge 境界の検出は GitHub API の PR 状態で行い、plain 経路専用の合成 module に置く

merge 済みかどうかは `githubClient.getPullRequest(owner, repo, prNumber).state === "MERGED"` で判定する。`--with-merge` の Step 2 と同一の判定素材・同一の意味（`merge-then-archive.ts:251-260`）。

この判定を行う場所は `src/core/archive/orchestrator.ts` ではなく、新しい合成 module（D3）とする。orchestrator の GitHubClient 非依存は維持される。

- **Rationale**: 「merge されたか」は GitHub 側の事実であり、PR 状態が唯一の権威。`--with-merge` と同じ問い合わせを使うことで 2 経路の merge 境界定義が一致する。
- **Alternatives considered**:
  - git のみで判定（`git merge-base --is-ancestor <archiveSha> origin/<base>`）: squash merge では feature commit が base の祖先にならないため成立しない。
  - base branch 上の archive folder の存在確認（`git cat-file -e origin/<base>:specrunner/changes/archive/<dated>/state.json`）: squash でも成立するが、fetch が必要で、folder 名の date 付与規則に依存し、他 job の archive record と誤認する余地がある。権威性でも PR 状態に劣る。
  - webhook / GitHub Actions からの状態注入: 要件 4 で明示的に非採用。

### D3: plain 経路を `runPlainArchive` に集約し、「merge 状態確認 → record または完了」の順で編成する

新 module `src/core/archive/plain-archive.ts` を追加し、CLI の非 `--with-merge` 分岐（`src/cli/archive.ts`）はここを呼ぶ。CLI 面（コマンド / flag）は増やさない。

```text
runPlainArchive:
  1. job context 解決（slug → state / branch / worktreePath / noWorktree / prNumber / archiveRecorded / recordDir）
     - 見つからない → exit 2（既存メッセージ踏襲）
     - status が terminal → "Already finished (<status>)." で exit 0（既存 orchestrator の短絡と同義）
  2. merge 状態確認（githubClient + owner/repo + prNumber が揃うときのみ）
     - MERGED かつ archiveRecorded → completeAfterMerge（markJobArchived + runPostMergeCleanup）→ exit 0
       ※ record は行わない（merge 済み・削除済み branch への push を避ける）
     - MERGED かつ !archiveRecorded → order error escalation → exit 1
     - それ以外（OPEN / CLOSED / 判定不能）→ 3 へ
  3. runArchiveOrchestrator（record only。status は awaiting-archive のまま）
     - 失敗 → その結果をそのまま返す
  4. record 成功後の終端処理
     - prNumber あり → awaiting-archive のまま exit 0 ＋「merge 後に再実行せよ」のメッセージ
     - prNumber なし → markJobArchived（D5）→ exit 0（cleanup は行わない）
```

merge 状態確認を record より**前**に置くのが要点。`--with-merge` の Step 2 / Step 3 と同じ順序であり、(a) merge 済み・branch 削除済みの状態で `git push` して escalation になるのを防ぎ、(b) out-of-band merge 後の再実行が「何も record せずに完了だけする」経路になる。

- **Rationale**: 要件 4（既存コマンドの再実行で完結）と要件 5（重複 archive commit を作らない）を、状態機構を増やさずに順序だけで満たせる。`--from-issue` は最終段で `runArchive()` を呼ぶため、この変更を自動的に継承する。
- **Alternatives considered**:
  - `runMergeThenArchive` に `skipMerge` 相当の flag を足す: CI wait / protected paths / minimumAssurance / integrity check という with-merge 固有の分岐が全部 plain 経路に露出し、要件 3（with-merge 維持）に対する回帰リスクが最大化する。
  - 判定と編成を `src/cli/archive.ts` に直接書く: CLI 層はテストしづらく、`core` 側に置かれている同種の編成（merge-then-archive）と非対称になる。
  - record 後にもう一度 PR を再確認して 1 コマンドで完結させる: merge が「record → CI → 人間の merge」を挟む以上、同一プロセス内で待つのは `--with-merge` の再発明になる。再実行を正規経路とする（Q-3）。

### D4: 「job context 解決」と「post-merge 完了処理」を共有 module に抽出する

- `src/core/archive/job-context.ts`: `resolveArchiveJobContext({ cwd, slug })` → `{ state, prNumber?, branch, worktreePath, noWorktree, archiveRecorded, recordDir }` または not-found。`merge-then-archive.ts` の Step 1 と `plain-archive.ts` の双方がこれを使う。`archiveRecorded` / `recordDir` の導出規則（`sourceChangeDir` の親 basename、`noWorktree ? cwd : (worktreePath ?? cwd)`）を単一定義にする。
- `src/core/archive/merge-completion.ts`: `completeAfterMerge(...)`（`markJobArchived` を best-effort で呼び、失敗時は警告のみで `runPostMergeCleanup` は必ず走らせる）と、record 前に merge された場合の order error escalation 生成（resume command のみ呼び出し側で差し替え）。`merge-then-archive.ts` の 3 箇所（Step 2 の resume、wait ループ中の merge 検出、Step 6）を置き換える。

抽出は **behavior-preserving refactor** とし、既存 `merge-then-archive.test.ts` を 1 行も変えずに green であることを合格条件にする（module mock は絶対 module id 単位で効くため、`markJobArchived` / `runPostMergeCleanup` の mock は間接 import 経由でも有効）。

- **Rationale**: 今回の変更の本質は「2 経路の terminal 境界を一致させる」ことであり、境界判定を 2 箇所に複製すると同じ drift を再生産する。
- **Alternatives considered**: plain 側で 40 行程度を複製する（実装は速いが、`archiveRecorded` の導出規則が 2 箇所に分かれ、本 request が是正しようとしている構造的欠陥そのものを再導入する）。

### D5: PR を持たない job は record 時点で `archived` にする（cleanup は行わない）

`state.pullRequest?.number` が無い job（`design-only` profile は pr-create を含まないため PR 無しで `awaiting-archive` に終端しうる）は、待つべき merge 境界が存在しない。この場合に限り record 成功後に `markJobArchived` を呼び、post-merge cleanup は**行わない**（＝今日の plain archive と同じ副作用集合）。

- **Rationale**: merge 境界のない job まで `awaiting-archive` に固定すると、正規経路で terminal にできない job class を作ってしまう（`job cancel` しか出口が無くなる）。「terminal transition には統合の証拠が要る」という原則に対し、PR が存在しないなら統合対象も存在しない、と読む。`attachArchivePolicy` が PR number を archive の前提として要求している既存規律とも整合する。
- **Alternatives considered**:
  - PR 無しでも `awaiting-archive` を維持: 要件 1 の字面には忠実だが、design-only job が終端できない機能退行を生む。
  - PR 無しは escalation（exit 1）: 既存利用者にとって破壊的で、要件のどこも要求していない。
  - PR 無しでも cleanup まで行う: branch を消してしまうため、merge 前提のない job（設計だけ残した branch）に対して破壊的。

### D6: merge 判定ができない環境では fail-safe に `awaiting-archive` を維持する

以下はいずれも「record は成功、terminal transition は保留」として exit 0（stderr に warning、stdout に次アクション）を返す。escalation にはしない。

- GitHub token / origin 解決に失敗し `githubClient` を組み立てられない（plain 経路では token は best-effort 解決という `src/cli/archive.ts` の既存挙動を踏襲）
- `getPullRequest` が例外を返す（ネットワーク / 権限）

- **Rationale**: plain archive の主目的は archive record の作成と push であり、それは成功している。判定不能を理由に record を失敗扱いにすると、Actions から「record を積む」用途が壊れる。逆に判定不能を理由に terminal にすると本 request が是正しようとしている不整合そのものになる。「不明なら terminal にしない」が安全側。
- **Alternatives considered**: `--with-merge` と同様に `getPullRequest` 失敗を escalation にする（with-merge は「これから merge する」ので API が使えなければ続行不能。plain は続行可能なので同列に扱う理由がない）。

### D7: merge 後の後処理は既存 `runPostMergeCleanup` をそのまま再利用する

worktree teardown / liveness・managed marker・sidecar 削除 / local・remote branch 削除は `runPostMergeCleanup` に閉じたまま、plain 経路も D4 の `completeAfterMerge` 経由で同じ関数を呼ぶ。plain 経路が merge 前に cleanup を呼ぶ箇所は存在しない。受け入れ基準「branch/worktree cleanup は merge 前には行われない」は、呼び出し箇所が merge 検出分岐の内側だけであることで構造的に担保される。

### D8: 状態機械・checkpoint policy・CLI 面は変更しない

`VALID_TRANSITIONS`（`awaiting-archive → archived`）、`TERMINAL_STATUSES`、`attachArchivePolicy`（awaiting-archive + PR number）、コマンド / flag 構成はいずれも無変更。変わるのは「`archived` を書く瞬間」だけである。`--from-issue` の attach policy が `awaiting-archive` を要求していることは、本変更後の contract（record 後も awaiting-archive）と初めて完全に整合する。

## Risks / Trade-offs

- **[R-1] 既存の運用フローが 2 phase になる（plain archive 1 回では終わらない）** → plain archive 成功時に「archive record を origin/<branch> に push した。PR #N の merge 後に `specrunner job archive <slug>` を再実行すると archived + cleanup まで完了する」旨を stdout に明示する。`ARCHIVE_USAGE` / README の一行説明も新しい意味に合わせる。in-repo の `guide merge` / `rebase-finish` skill は `--with-merge` 前提なので影響を受けない。
- **[R-2] merge された base branch 上の `state.json` には `awaiting-archive` が残る** → `markJobArchived` は record 用の working tree（worktree）に書き、その worktree は cleanup で撤去されるため `archived` は git に永続しない。これは本変更で新たに生じるのではなく、既存 `--with-merge` 経路の現実（本 repo の `specrunner/changes/archive/*/state.json` は全て `awaiting-archive`）に plain 経路が揃う、という変化である。永続化には base への直接 commit が必要で archive の設計不変に反するため今回は扱わない（Q-1）。受け入れ基準は「`archived` transition + cleanup が実行されること」で判定する。
- **[R-3] no-worktree mode では post-merge の状態書き込みが base checkout を dirty にしうる** → `recordDir === cwd` のため `markJobArchived` が main checkout の tracked file を書き換える。これは既存 `--with-merge` の no-worktree 経路と同じ挙動であり、新規に導入する副作用ではない。挙動を既存に合わせ、共有 module に集約することで将来まとめて是正できるようにする。
- **[R-4] merge 後に remote feature branch が自動削除されていると `--from-issue` の branch 解決が失敗する** → local に同 jobId の state があれば `archive-from-issue.ts` の local short-circuit が効き、rebind を経ずに `runArchive` に到達するため完結できる。local state を持たない runner から merge 後に完結させる経路は今回の scope 外（Q-2）。
- **[R-5] 共有 module 抽出による `--with-merge` 回帰** → 抽出は behavior-preserving に限定し、`merge-then-archive.test.ts` / `orchestrator.test.ts`（旧意味を pin する 1 件を除く）/ `archive-from-issue.test.ts` / `archive-minimum-assurance.test.ts` が無変更 green であることを合格条件にする。escalation 文言も既存文字列を保つ。
- **[R-6] PR は実在するが state に `pullRequest.number` が無い job を D5 が誤って terminal にする** → pr-create が PR を作った直後・state 永続化前に落ちた場合に限られる稀な窓。今日の plain archive と同じ結果（record 時 terminal）であり退行ではない。PR number 不在で terminal にした旨を stdout に明示し、`job show` で確認できるようにする。

## Open Questions

- **[Q-1]** merge 後の `archived` を base branch に永続化すべきか（現状は plain / with-merge とも local な遷移で、cleanup により失われる）。永続化するなら「archive record commit に含める」か「post-merge に base へ commit する」かの二択で、後者は archive の設計不変（base に commit しない）に抵触する。本 request の scope 外とし、必要なら別 request で扱う。
- **[Q-2]** local state を持たない runner（fresh clone の Actions runner 等）から、merge 済み PR に対して `--from-issue` で completion のみを実行する経路を用意すべきか。remote branch 自動削除との相性を含めて検討が要る。
- **[Q-3]** plain archive が record 後に一定時間 PR を再確認して 1 コマンドで完結する mode を将来足すか。今回は「再実行が正規経路」で確定し、polling は `--with-merge` に閉じたままにする。
- **[Q-4]** 本変更以前に旧意味で `archived` になった job（worktree / branch が残存しうる）に対する cleanup 補完コマンドを用意するか。今回は terminal 短絡（`Already finished`）を維持し、手動 `git worktree remove` / `git branch -d` に委ねる。

## Migration Plan

1. **既存 `awaiting-archive` job**: 影響なし。新契約でも `job archive <slug>` は record を作り、merge 後の再実行で完結する。
2. **本変更前に旧意味で `archived` になった job**: `runPlainArchive` は terminal 短絡で `Already finished (archived).` を返し何もしない（今日と同じ）。残存 worktree / branch の掃除は手動（Q-4）。
3. **archive record 済み・PR 未merge の job**: 新契約下では status が `awaiting-archive` のままなので、そのまま再実行で完結できる。record は冪等（folder mv skip / staged 差分なしで commit skip / push は up-to-date）。
4. **`--with-merge` 利用者 / in-repo の `guide merge`・`rebase-finish`**: 変更なし。
5. **rollback**: `src/cli/archive.ts` の非 `--with-merge` 分岐を `runArchiveOrchestrator` 直呼びに戻し、orchestrator の transition 呼び出しを復帰すれば旧契約に戻る。新規 module の追加と共有抽出は独立に保持できる。

なお本変更は「terminal transition の境界を merge に移す」という規範的判断を含み、既存の archive 分離に関する設計判断（archive は client-closed / merge は前提条件であってトリガーではない）を更新する。ADR 化の要否と配置は adr-gen step に委ねる。
