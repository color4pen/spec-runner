# ADR-20260821: plain archive の `archived` 遷移を merge 境界に移す

## ステータス

superseded by [ADR-20260826-single-phase-archive](2026-08-26-single-phase-archive.md)

Amends:
- [ADR-20260603-archive-command-client-closed](2026-06-03-archive-command-client-closed.md) — D5（Phase 3: `status → archived` を archive record push 後に行う）を廃止し、orchestrator が terminal transition を行わない構造に置き換える
- [ADR-20260628-archive-on-branch-first](2026-06-28-archive-on-branch-first.md) — D3（「job status を記帳時点で `archived` に確定させる」）を plain archive 経路について撤回する
- [ADR-20260713-archive-recover-unmerged](2026-07-13-archive-recover-unmerged.md) — D1（`deferArchivedTransition` を `--with-merge` 経路専用の opt-in とする）を拡張し、defer を全経路で無条件化・フィールドを deprecated 扱いにする

## コンテキスト

[ADR-20260713-archive-recover-unmerged](2026-07-13-archive-recover-unmerged.md) は `--with-merge` 経路に限り `deferArchivedTransition: true` を渡すことで記帳時の `archived` 遷移を遅延させた。plain `job archive` は `deferArchivedTransition` が未指定（= `false`）のまま残り、archive record を feature branch に push した時点で `awaiting-archive → archived` に遷移する設計を維持していた。

この非対称な設計は、GitHub Actions 等から「archive record を PR に積む操作」として plain archive を使う運用で不整合を生んでいた。

```
awaiting-archive
  → archive record commit / push
  → archived          ← ここで terminal
  → CI failure / PR 未 merge
```

job status は `archived`（terminal）だが変更は main に入っていない状態になる。`archived` は `TERMINAL_STATUSES` かつ `VALID_TRANSITIONS` 上の出口なし状態のため、正規経路での復帰が不可能だった（`job reopen` の operator 経路のみ）。

`job archive --from-issue <n>`（[ADR-20260821-archive-from-issue](2026-08-21-archive-from-issue.md)）の導入により、GitHub Actions 上で archive record を作る execution face が正規経路として成立した。remote execution では「Actions が archive record を積み、CI を確認したうえで最終 merge は GitHub UI で人間が行う」運用も想定されるため、plain archive の意味を「archive record の準備」と「merge 後の terminal transition」に明確に分離する必要が生じた。

### 成立している前提

- archive の各素片（`archiveChangeFolder` / `commitArchive` / `markJobArchived`）は既に冪等。
- `runPostMergeCleanup` は worktree 撤去 / branch 削除 / sidecar 削除を best-effort・冪等に行う。
- `merge-then-archive.ts` の「archive 記録済みシグナル」は `sourceChangeDir` の親 basename が `archive` か否かで判定しており、status に依存しない（[ADR-20260713](2026-07-13-archive-recover-unmerged.md) D2）。
- `archive --from-issue` の `attachArchivePolicy` は `status === "awaiting-archive"` かつ `pullRequest.number` 在を要求しており、本変更後の contract（record 後も `awaiting-archive`）と初めて完全に整合する。

### 不変条件

- archive orchestrator（`src/core/archive/orchestrator.ts`）が `GitHubClient` に依存しない（client-closed）不変は維持する。
- `VALID_TRANSITIONS`・`TERMINAL_STATUSES`・`attachArchivePolicy` は無変更。状態集合を増やさない。

## 決定

### D1: archive orchestrator から terminal transition を完全に除去し「記帳のみ」に固定する

`runArchiveOrchestrator` は `markJobArchived` を一切呼ばない。責務を「change folder の mv → draft 掃除 → design-layer hook → archive commit → feature branch への push → headSha 返却」に限定する。

`ArchiveInput.deferArchivedTransition` フィールドは **deprecated 入力として残す**が、値にかかわらず無視する。[ADR-20260713](2026-07-13-archive-recover-unmerged.md) D1 が `deferArchivedTransition: true` で呼ぶ `merge-then-archive.ts` の呼び出し契約を壊さないための互換保持であり、フィールドの JSDoc に「無条件 defer のため入力は無視される / 呼び出し契約互換のためのみ残存」と明記する。

**採用理由**: 「plain 経路は defer が既定」ではなく「orchestrator は transition しない」という構造にすることで、要件「terminal transition は merge 後のみ」を呼び出し側の設定ミスで破れない形にできる。plain / with-merge のどちらから呼んでも record は同じ意味になる。

**却下案**:
- `deferArchivedTransition` の既定値を `true` に反転する: フィールドの意味は保つが `false` を渡す呼び出し側が存在しない死んだ分岐が残り、「`false` を渡せば merge 前に terminal にできる」抜け道が残る。
- フィールドを削除する: `merge-then-archive.ts:283` の呼び出しと `merge-then-archive.test.ts` TC-001 が壊れ「with-merge テスト無変更 green」の受け入れ基準に反する。
- transition を `markJobArchived` 内の内部条件（PR 状態確認）に押し込む: `core/finish` が `GitHubClient` に依存することになり client-closed 不変を最も広い範囲で破壊する。

### D2: merge 境界の検出は GitHub API の PR 状態で行い、plain 経路専用の合成 module に置く

merge 済みかどうかは `githubClient.getPullRequest(owner, repo, prNumber).state === "MERGED"` で判定する。`--with-merge` の Step 2 と同一の判定素材・同一の意味（`merge-then-archive.ts:251-260`）。この判定は orchestrator ではなく D3 の新規合成 module（`src/core/archive/plain-archive.ts`）で行い、orchestrator の `GitHubClient` 非依存は維持する。

**採用理由**: 「merge されたか」は GitHub 側の事実であり PR 状態が唯一の権威。`--with-merge` と同じ問い合わせを使うことで 2 経路の merge 境界定義が一致する。

**却下案**:
- git のみで判定（`git merge-base --is-ancestor <archiveSha> origin/<base>`）: squash merge では feature commit が base の祖先にならないため成立しない。
- base branch 上の archive folder の存在確認（`git cat-file -e origin/<base>:specrunner/changes/archive/<dated>/state.json`）: squash でも成立するが fetch が必要で folder 名の date 規則に依存し権威性で PR 状態に劣る。
- webhook / GitHub Actions からの状態注入: 要件で明示的に非採用（コマンド再実行による正規経路を優先）。

### D3: plain 経路を `runPlainArchive` に集約し「merge 状態確認 → record または完了」の順で編成する

新 module `src/core/archive/plain-archive.ts` を追加し、CLI の非 `--with-merge` 分岐（`src/cli/archive.ts`）はここを呼ぶ。CLI 面（コマンド / flag）は増やさない。フローは以下の順序で構成する。

```
runPlainArchive:
  1. job context 解決（slug → state / branch / worktreePath / prNumber / archiveRecorded / recordDir）
     - 未発見 → exit 2
     - status が terminal → "Already finished (<status>)." で exit 0
  2. merge 状態確認（githubClient + prNumber が揃うときのみ）
     - MERGED かつ archiveRecorded → completeAfterMerge（markJobArchived + runPostMergeCleanup）→ exit 0
     - MERGED かつ !archiveRecorded → 順序エラー escalation → exit 1
     - それ以外（OPEN / CLOSED / 判定不能）→ 3 へ
  3. runArchiveOrchestrator（record only。status は awaiting-archive のまま）
  4. record 成功後の終端処理
     - prNumber あり → awaiting-archive のまま exit 0 ＋「merge 後に再実行せよ」のメッセージ
     - prNumber なし → markJobArchived（D5）→ exit 0（cleanup は行わない）
```

merge 状態確認を record より**前**に置くことで、(a) merge 済み・branch 削除済みの状態で `git push` して escalation になるのを防ぎ、(b) out-of-band merge 後の再実行が「record せずに完了だけする」経路になる。`--from-issue` は最終段で `runArchive()` を呼ぶため、この変更を自動的に継承する。

**採用理由**: 要件「既存コマンドの再実行で完結」と「重複 archive commit を作らない」を、状態機構を増やさずに実行順序だけで満たせる。

**却下案**:
- `runMergeThenArchive` に `skipMerge` 相当の flag を足す: CI wait / protected paths / minimumAssurance など with-merge 固有の分岐が plain 経路に露出し、with-merge 回帰リスクが最大化する。
- 判定と編成を `src/cli/archive.ts` に直接書く: CLI 層はテストしづらく `core` 側の同種編成（merge-then-archive）と非対称になる。
- record 後にもう一度 PR を再確認して 1 コマンドで完結させる: merge が「record → CI → 人間の merge」を挟む以上、同一プロセス内で待つのは `--with-merge` の再発明になる。

### D4: job context 解決と post-merge 完了処理を共有 module に抽出する

- `src/core/archive/job-context.ts`: `resolveArchiveJobContext({ cwd, slug })` → `{ state, prNumber?, branch, worktreePath, noWorktree, archiveRecorded, recordDir }` または not-found。`archiveRecorded` / `recordDir` の導出規則（`sourceChangeDir` の親 basename が `archive` か否か・`noWorktree ? cwd : (worktreePath ?? cwd)`）を単一定義にし、`merge-then-archive.ts` と `plain-archive.ts` の双方がこれを使う。
- `src/core/archive/merge-completion.ts`: `completeAfterMerge(...)`（`markJobArchived` を best-effort で呼び、失敗時は warning のみで `runPostMergeCleanup` は必ず走らせる）と、record 前 merge の場合の順序エラー escalation 生成を実装する。`merge-then-archive.ts` の 3 箇所（Step 2 の resume・wait ループ中の merge 検出・Step 6）をこの共有実装に置き換える。

抽出は behavior-preserving refactor とし、既存 `merge-then-archive.test.ts` を 1 行も変えずに green であることを合格条件にする。

**採用理由**: 「2 経路の terminal 境界を一致させる」という本変更の本質を実現するために、境界判定と post-merge 完了処理を 2 箇所に複製すると同じ drift を再生産する。

**却下案**: plain 側で約 40 行を複製する（実装は速いが `archiveRecorded` の導出規則が 2 箇所に分かれ、本変更が是正しようとした構造的欠陥そのものを再導入する）。

### D5: PR を持たない job は record 時点で `archived` にする（cleanup は行わない）

`state.pullRequest?.number` が無い job（`design-only` profile 等、PR を作らずに `awaiting-archive` に終端しうる job）は待つべき merge 境界が存在しない。この場合に限り record 成功後に `markJobArchived` を呼ぶ。ただし `runPostMergeCleanup` は**行わない**（branch を消すと merge 前提のない job に対して破壊的になるため）。

**採用理由**: merge 境界のない job まで `awaiting-archive` に固定すると正規経路で terminal にできない job class を作ってしまう。PR が存在しないなら統合対象も存在しない、と読む。`attachArchivePolicy` が PR number を archive の前提として要求している既存規律とも整合する。

**却下案**:
- PR 無しでも `awaiting-archive` を維持: 要件の字面には忠実だが、design-only job が終端できない機能退行を生む。
- PR 無しは escalation（exit 1）: 既存利用者にとって破壊的で要件のどこも要求していない。
- PR 無しでも cleanup まで行う: branch を消してしまうため merge 前提のない job に対して破壊的。

### D6: merge 判定ができない環境では fail-safe に `awaiting-archive` を維持して成功する

以下はいずれも「record は成功・terminal transition は保留」として exit 0（stderr に warning・stdout に次アクション）を返す。escalation にはしない。

- GitHub token / origin 解決に失敗し `githubClient` を組み立てられない（plain 経路では token は best-effort 解決という既存挙動を踏襲）
- `getPullRequest` が例外を返す（ネットワーク / 権限）

**採用理由**: plain archive の主目的は archive record の作成と push であり、それは成功している。判定不能を理由に record を失敗扱いにすると Actions から「record を積む」用途が壊れる。逆に判定不能を理由に terminal にすると本変更が是正しようとする不整合そのものになる。「不明なら terminal にしない」が安全側。

**却下案**: `--with-merge` と同様に `getPullRequest` 失敗を escalation にする（with-merge は「これから merge する」ので API が使えなければ続行不能。plain は record を完了しているため続行可能であり同列に扱う理由がない）。

### D7: merge 後の後処理は既存 `runPostMergeCleanup` をそのまま再利用する

worktree teardown / liveness marker・managed marker・sidecar 削除 / local・remote branch 削除は `runPostMergeCleanup` に閉じたまま、plain 経路も D4 の `completeAfterMerge` 経由で同じ関数を呼ぶ。plain 経路が merge 前に cleanup を呼ぶ箇所は存在しない（呼び出しが merge 検出分岐の内側のみという構造で担保）。

### D8: 状態機械・checkpoint policy・CLI 面は変更しない

`VALID_TRANSITIONS`（`awaiting-archive → archived`）・`TERMINAL_STATUSES`・`attachArchivePolicy`（awaiting-archive + PR number を要求）・コマンド / flag 構成はいずれも無変更。変わるのは「`archived` を書く瞬間」だけである。`--from-issue` の attach policy が `awaiting-archive` を要求していることは、本変更後の contract（record 後も awaiting-archive）と初めて完全に整合する。

## 検討した代替案

### A1: `deferArchivedTransition` の既定値を `true` に反転する

plain archive を呼ぶ caller が `deferArchivedTransition` を省略した場合でも defer が働くよう、フィールドの default を `true` に変える案。

- **Pros**: フィールドの意味を保ちつつ plain 経路の挙動を変えられる。変更範囲が最小。
- **Cons**: `false` を渡す caller が存在しない死んだ分岐が残り、「`false` を渡せば merge 前に terminal にできる」抜け道が残存する。orchestrator が「transition する可能性のある module」のまま変わらず、構造的不変として表現できない。
- **Why not**: D1 の採用理由参照。呼び出し側の意図で破れない構造が優先。

### A2: `runMergeThenArchive` に `skipMerge` flag を追加して plain 経路から呼ぶ

`--with-merge` の実装を plain 経路でも再利用し、merge 処理のみ skip する案。

- **Pros**: 合成 module の新規追加が不要。
- **Cons**: CI wait / protected paths / minimumAssurance / integrity check という with-merge 固有の分岐と引数が plain 経路に露出する。`skipMerge: true` と `skipMerge: false` の組み合わせ爆発がテスト難度を上げる。with-merge テストの回帰リスクが最大化する。
- **Why not**: with-merge の複雑性を plain 経路に混入させない（D3 の方針）。

### A3: plain archive が record 後に PR を再確認して 1 コマンドで完結させる

record push 後に同一プロセス内で PR 状態を再確認し、merge 済みであれば immediately に `completeAfterMerge` を呼ぶ案。

- **Pros**: 利用者が 1 コマンドで完結できる（再実行不要）。
- **Cons**: merge が「record → CI → 人間の merge」を挟む以上、同一プロセス内で待つのは `--with-merge` の再発明。plain の非 polling 原則（D3・要件 4）に反する。
- **Why not**: 再実行を正規経路とすることで確定済み（D3）。polling は `--with-merge` に閉じたままにする。

### A4: `archive-prepare` のような新 CLI コマンドを追加して操作を分離する

「archive record を積む」操作と「merge 後の terminal 化」を別コマンドに分離し、`specrunner job archive-prepare <slug>` のような形で record 専用の入口を設ける案。

- **Pros**: コマンドごとの責務が明確になり、既存の `job archive` の意味を変えずに済む。
- **Cons**: CLI 面が増え、利用者が覚えるコマンドが増える。`--from-issue` / `--with-merge` など既存の拡張点との対称性が崩れる。archive 操作が「どのコマンドを使うか」という選択問題を発生させ、概念の簡潔さが失われる。
- **Why not**: request.md が「新しい `archive-prepare` のようなコマンドは原則追加しない。CLI 面を増やすより、`job archive` の状態意味を merge 境界に合わせる」と明示的に設計方針を宣言している。`job archive` の意味を統一する方が、コマンドを分割するより長期的に扱いやすい。

### A5: `archive-recorded` 中間 status を新設して記帳済みを型で表現する

`awaiting-archive` と `archived` の間に `archive-recorded`（または `awaiting-merge`）という新しい status を導入し、「記帳済みだが未 merge」を状態機械上で表現する案。

- **Pros**: 記帳済みかどうかが状態から直接読み取れる。`archiveRecorded` フラグを folder 位置から推論する必要がなくなる。
- **Cons**: `VALID_TRANSITIONS`・`TERMINAL_STATUSES`・`doctor`・`reconcile`・`cancel`・`ps`・`inbox` など状態集合を消費する全コンポーネントへの波及が大きい。「merge なしで `archive-recorded` のまま恒久的に残る」job class が生じうる。新 status が出口なし状態になる懸念があり、既存コードの terminal/non-terminal 判定ロジックの全箇所を修正する必要がある。
- **Why not**: folder 位置（`sourceChangeDir` の親 basename が `archive` か否か）が記帳の副作用そのものを直接観測するシグナルとして既に機能しており（[ADR-20260713](2026-07-13-archive-recover-unmerged.md) D2）、新 status なしに同等の判定が可能。状態機械を最小に保つ原則（D8）を優先する。

## 影響

### Positive

- plain `job archive` の record が feature branch に push された状態から、out-of-band merge 後に同じコマンドを再実行するだけで `archived` + cleanup まで完結できる。手動 worktree 撤去・branch 削除が不要になる。
- `archived` は「対象変更が merge 済みで後処理を完了した」状態として `--with-merge` と plain 両経路で一致した意味論を持つ。
- `--from-issue` の attach policy（`awaiting-archive` + PR number 要求）と record 後 contract が初めて整合する（record 後も `awaiting-archive` を維持するため、remote runner が archive record を積んだ後に `--from-issue` で完結させる経路が成立する）。
- `completeAfterMerge` と `resolveArchiveJobContext` の共有化により、`merge-then-archive` と `plain-archive` の merge 境界定義が単一実装に収束し、将来の drift を構造的に防ぐ。

### Negative / Known Debt

- **運用フローが 2 phase になる（plain archive 1 回では終わらない）**: record 成功時に「PR merge 後に同じコマンドを再実行すると archived + cleanup まで完了する」旨を stdout に明示することで補う。in-repo の `guide merge` / `rebase-finish` skill は `--with-merge` 前提のため影響を受けない。
- **merge 済み base branch 上の `state.json` が `awaiting-archive` を保持する**: `markJobArchived` は record 用 worktree に書き込み、cleanup で worktree が撤去されるため `archived` は git に永続しない。これは `--with-merge` 経路の既存現実（本 repo の `specrunner/changes/archive/*/state.json` が全て `awaiting-archive`）に plain 経路が揃う変化であり、新たな退行ではない。永続化には base への直接 commit が必要で archive の設計不変に反するため今回は扱わない（別変更で対処）。
- **本変更以前に旧意味で `archived` になった job**: terminal 短絡（`Already finished (archived).`）を維持し、残存 worktree / branch の掃除は手動対応に委ねる。

## 参照

- Request: `specrunner/changes/archive-state-after-merge/request.md`
- Design: `specrunner/changes/archive-state-after-merge/design.md`
- Amends: [ADR-20260603-archive-command-client-closed](2026-06-03-archive-command-client-closed.md) — D5 を廃止（orchestrator が `status → archived` を行う Phase 3 の除去）
- Amends: [ADR-20260628-archive-on-branch-first](2026-06-28-archive-on-branch-first.md) — D3 を plain archive 経路について撤回（記帳時 `archived` 確定の廃止）
- Amends: [ADR-20260713-archive-recover-unmerged](2026-07-13-archive-recover-unmerged.md) — D1 を拡張（`deferArchivedTransition` を deprecated 化し defer を全経路で無条件化）
- Related: [ADR-20260821-archive-from-issue](2026-08-21-archive-from-issue.md) — archive face の remote 取り込み（本変更の契約と初めて完全に整合する）
- Related: [ADR-20260603-with-merge-wait-until-green](2026-06-03-with-merge-wait-until-green.md) — `--with-merge` の CI wait ロジック（本変更で無変更）
