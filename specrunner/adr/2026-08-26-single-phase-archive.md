# ADR-20260826: plain archive を 1 回で完結させ、merge 後の再 archive 契約を撤回する

## ステータス

accepted

Supersedes:
- [ADR-20260821-archive-state-after-merge](2026-08-21-archive-state-after-merge.md) — plain archive の `archived` 遷移を merge 境界に移す設計全体を撤回し、1 相完結に置き換える

Amends:
- [ADR-20260603-archive-command-client-closed](2026-06-03-archive-command-client-closed.md) — `runPlainArchive` 合成層でも `GitHubClient` 依存を持たない（client-closed を archive 経路全体に拡張）
- [ADR-20260821-archive-state-after-merge](2026-08-21-archive-state-after-merge.md) — D2（merge 状態確認）・D3（`runPlainArchive` の 2 相フロー編成）・D5（PR なし job を `archived` にする）・D6（merge 判定失敗の fail-safe）を本 ADR の決定で置き換える

## コンテキスト

### 2 相契約の問題

[ADR-20260821-archive-state-after-merge](2026-08-21-archive-state-after-merge.md) は plain `job archive` の `archived` 遷移を PR merge 境界まで遅延させ、remote execution 向けに次の 2 相操作を正規化した。

```
awaiting-archive
  → archive（archive record を feature branch に push）
  → awaiting-archive のまま exit 0 ＋「merge 後に再実行せよ」のメッセージ
  → GitHub UI で PR merge
  → archive を再実行
  → archived + cleanup
```

この設計には複数の構造的問題があった。

1. **同じコマンドが merge 前後で別の意味を持つ**: operator は「今どちらの相か」を自分で判断しなければならない。
2. **plain archive 合成層が `GitHubClient` に依存し続ける**: `runPlainArchive` は `getPullRequest` を呼んで PR state（MERGED / OPEN）を判定し、それを terminal transition の条件にしていた。orchestrator 単体の client-closed 不変は守られているが、plain 経路全体としては GitHub PR state に依存する状態だった。
3. **job lifecycle と PR lifecycle を同期させていた**: `archived` が「SpecRunner の archive 処理完了」ではなく「PR が main に merge された」を意味していた。2 つは独立した状態機械であり、同期させる理由はない。
4. **remote branch 削除が単相化の障害**: `runPostMergeCleanup` は remote feature branch を削除する（`git push origin --delete <branch>`）。merge 前にこれを実行すると PR が閉じられ archive commit が main へ届く経路が消滅する。merge 前後の両方で cleanup を安全に走らせるには remote 削除を分離する必要があった。

### 正しい操作モデル

```
pipeline 完了
  ↓
awaiting-archive
  ↓
archive
  - specrunner/changes/ → archive/ へ move
  - archive commit を feature branch に commit / push
  - local worktree / sidecar 等を cleanup（remote branch は残す）
  - awaiting-archive → archived
  ↓
GitHub UI で人間が PR merge
  ↓
完了
```

`archived` は「SpecRunner 側の archive 処理が完了した」ことだけを表す。PR が OPEN のままでも `archived` にできる。PR の OPEN / MERGED は GitHub 側の独立した事実として扱う。

### 既存コードから確認済みの制約

- `archiveChangeFolder` / `commitArchive` / `markJobArchived` はいずれも冪等。
- `archiveRecorded`（`sourceChangeDir` の親 basename が `archive` か否か）は git のローカル事実から導出でき、PR state に依存しない。
- `git ls-remote` は `TRANSPORT_SUBCOMMANDS` に登録済みで token 付き実行が可能。
- `merge-completion.ts` の `completeAfterMerge` / `mergedBeforeRecordEscalation` は `merge-then-archive.ts` の 4 箇所で使われ続ける。

## 決定

### D1: plain archive から GitHub PR state 検出を構造的に除去する

`PlainArchiveInput` から `githubClient` / `owner` / `repo` を削除し、`runPlainArchive` が `GitHubClient` 型を一切 import しない module にする。`src/cli/archive.ts` の非 `--with-merge` 分岐からも client 構築と origin 解決を除去する。**`githubToken` の解決は残す** — push の transport auth に必要であり、これは GitHub API ではなく git transport の資格情報である。

これにより plain archive は orchestrator と同じ **client-closed** 性を回復し、`architecture/components.md` の ArchiveOrchestrator 不変条件と archive 経路全体で整合する。

**採用理由**: 受け入れ条件「plain archive は GitHub PR state の MERGED 判定を terminal transition の条件にしない」を、実行時の分岐条件ではなく **依存の不在** として表現する。分岐を残したまま「使わない」約束にすると、将来の変更で条件が復活する余地が残る。型に依存が無ければ復活できない。

**却下案**:
- PR state 読み出しを warning 目的でのみ残す: client 依存が残り D1 の構造保証を失う。ネットワーク往復を archive の必須経路に残すことにもなる。警告は D6 の無条件 advisory で十分に果たせる。
- `skipMergeCheck` flag を追加する: 死んだ分岐と設定ミスの余地を残す。plain archive に 2 つの意味を保持し続けることになり、本変更の目的そのものに反する。

### D2: terminal transition は「archive record push 成功」を唯一の条件にする

record（folder move → commit → push）が成功した時点で `markJobArchived` を呼び、`awaiting-archive → archived` を確定する。PR が OPEN でも CLOSED でも MERGED でも同じ。`archived` の意味は「SpecRunner 側の archive 処理が完了した」に固定され、「変更が main に入った」は含意しない。

順序は **push 成功 → transition → cleanup** に固定する。record / push が失敗した場合は transition も cleanup も行わず escalation（exit 1）で終わる。cleanup が worktree を撤去すると state 書き込み先が消えるため、transition は cleanup より前に置く。

**採用理由**: job lifecycle と PR lifecycle は別の状態機械であり、同期させない（request の「設計上の訂正」）。push 成功を境界にするのは、それが「archive の成果物が PR に載った」ことを SpecRunner 単独で確認できる最後の点だからである。

**却下案**:
- transition を push より前に置く: push 失敗時に terminal になった job が残る。却下。
- commit 成功で transition し push は best-effort: push 失敗時に「local だけ archived」な job が生まれ、PR に folder move が載らない（要件違反）。却下。

### D3: cleanup から remote branch 削除を分離し、plain archive は remote を消さない

`src/core/archive/post-merge-cleanup.ts` を `src/core/archive/cleanup.ts` に改名し、`runPostMergeCleanup` → `runArchiveCleanup` にリネームしたうえで入力に `deleteRemoteBranch?: boolean`（既定 `true`）を追加する。

- **plain archive**: `deleteRemoteBranch: false`。worktree 撤去 / liveness・managed marker・sidecar 削除 / local branch 削除までを行い、`git push origin --delete <branch>` は実行しない。
- **`--with-merge`**: `deleteRemoteBranch` 未指定（= `true`）。merge 直後に呼ばれるため既存挙動を維持する。

remote feature branch の削除は **GitHub 側の governance に委譲**する（merge 時の auto-delete head branch 設定、または operator の手動削除）。

module 名の改名を伴うのは、この module が merge 前にも呼ばれるようになるためである。`post-merge-cleanup` という名前を残すと「merge 後にしか走らない」という誤読を招き、将来 remote 削除が無条件で戻される危険がある。

**採用理由**: 単相化の唯一の破壊的障害が remote branch 削除である。PR state を見ずに安全側へ倒す唯一の方法は「plain archive は remote を消さない」を無条件にすること。

**却下案**:
- PR state を見て merge 済みのときだけ remote を消す: D1（client-closed）に反する。
- plain archive は cleanup を一切行わない: 要件「archive 実行時に既存の local cleanup を完了する」に反し、worktree が恒久的に残る。
- module 名を維持して flag だけ足す: `post-merge-cleanup` が merge 前に呼ばれる状態が残り名前が事実に反する。

### D4: PR を持たない job も同一経路に統合する

旧実装は `prNumber` 不在の job を特別扱いし、record 後に `markJobArchived` を呼ぶが cleanup は行わなかった（remote branch 削除が破壊的なため）。D3 で remote 削除が plain 経路から消えたため、この分岐は不要になる。PR の有無にかかわらず **record → transition → cleanup** の単一経路に統合する。

**採用理由**: 分岐を残す理由（cleanup の破壊性）が D3 で消滅した。要件は cleanup の完了を PR の有無で条件付けていない。経路が 1 本になることで、テストすべき組み合わせも減る。

### D5: 記帳済み job のべき等な後始末（旧 2 相契約の残置 job）

旧契約の残置 job（archive record push 済み・PR merge 済み・status `awaiting-archive`）に対し、専用コマンドを追加せず、同じ `job archive` の 1 回実行で `archived` + cleanup に到達させる。`archiveRecorded` を用いて 2 つの経路を持つ。

**Path A（記帳経路 — 通常）**: record working tree が使用可能なとき。`runArchiveOrchestrator` → transition → cleanup。既に記帳済みなら mv も commit も skip され、残りは push・transition・cleanup になる。

push 段に次の規則を入れる（ls-remote idempotent push guard）:
> mv と commit の**両方が skip された**（= この実行が新しい記帳を生んでいない）場合に限り、push 前に `git ls-remote --heads origin <branch>` を実行する。該当 ref が無ければ push を skip し warning を出す。ref があれば従来どおり push する。新規記帳を生んだ実行では push は従来どおり**必須**であり、失敗は escalation である。

**Path B（degraded 経路）**: `archiveRecorded === true` かつ record working tree が使えないとき（worktree ディレクトリが存在しない、または `--no-worktree` モードで local feature branch が無い）。orchestrator を呼ばず、finishable gate → `markJobArchived(slug, cwd)` → cleanup の順で best-effort に終端する。transition 失敗は warning に留め cleanup を続行し exit 0 とする。これは remote runner（GitHub Actions）の残置 job 取り込みが通る経路である。

**採用理由**: 要件「べき等な後始末として扱い、専用の移行コマンドを追加しない」を満たす。`archiveRecorded` は既存の導出であり新しい状態を増やさない。Path B を best-effort にするのは、残置 job にとって「終端させること」が目的であり、書き込み先の不在で失敗させると CLI 経由で回収不能な job class を作ってしまうためである。

**却下案**:
- 専用の migration コマンド追加: 要件が明示的に禁止。
- push を常に best-effort にする: 新規記帳が push されないまま `archived` になりうる（要件違反）。
- Path B を設けず worktree 不在を escalation のまま: local worktree を失った残置 job が CLI で終端できない。

### D6: PR merge に関する operator 向け情報は「無条件の advisory」に限定する

PR state の観測ではなく**無条件の 1 行 advisory** で manifest する。record 成功時の stdout は:
- archive commit を push した branch と PR 番号（あれば）
- 次の操作は GitHub 上での PR merge であること
- PR が既に merge / close 済みの場合、この commit は base branch に届かないこと

を伝える。「merge 後にもう一度 archive せよ」に相当する案内は出さない。

**採用理由**: 事実ベースの警告には PR state の読み出しが必要で D1 と両立しない。一方この advisory は archive 実行時点で常に真であり（archive → merge が正の操作順である以上、PR が既に merged なのは異常系）、operator に必要な情報を過不足なく伝える。

### D7: `merge-completion.ts` は `--with-merge` 専用として残す

`completeAfterMerge` は `merge-then-archive.ts` の 3 箇所で使われ、いずれも**実際に merge 後**の呼び出しである。`mergedBeforeRecordEscalation` も `--with-merge` Step 2 で使われ続ける。plain 経路からの import（`plain-archive.ts`）は削除する。module の JSDoc から「plain archive と共有」の記述を除去し、`--with-merge` 専用であることを明記する。`completeAfterMerge` は D3 の `runArchiveCleanup` を `deleteRemoteBranch` 未指定（`true`）で呼ぶ。

**採用理由**: 「通常操作契約として使わない」を満たしつつ、`--with-merge` の post-merge 処理を 3 箇所にインライン複製する退行を避ける。削除は `--with-merge` 側に純粋なコストしか生まない。

**却下案**: 削除して `merge-then-archive.ts` にインライン化 — 同一処理が 3 箇所に複製され、`--with-merge` 経路の drift を招く。却下。

### D8: 操作順 archive → merge を operator 面に反映する

1. **workflow_dispatch**（`.github/workflows/specrunner-dispatch.yml`）: `archive` の説明を「完走した job を issue 番号から 1 回の実行で取り込む」に書き換え、「2 相」「merge 後・head branch 削除済み」の記述を除去する。
2. **`deriveNextAction`**（`src/core/job-list/operations-view.ts`）: `awaiting-archive` の次アクションを `prMerged` に依存させず、常に `job archive <slug>` を返す。`CATEGORY_META` の `"awaiting-archive"` エントリのラベルを `"merge・archive 待ち"` から `"archive・merge 待ち"` に変更する。`buildStatusCell` の `awaiting-archive (PR merged)` 注記は維持する（GitHub 側の事実の表示であり次アクションの条件ではない）。

**採用理由**: `prMerged === true` を待つ現行実装は旧操作順の残骸で、新契約では「merge されるまで次アクション無し」という誤った案内になる。

### D9: 状態機械 / CLI 面 / checkpoint policy は変更しない

`VALID_TRANSITIONS`（`awaiting-archive → archived`）・`REOPEN_TRANSITIONS`・`TERMINAL_STATUSES`・`attachArchivePolicy`（`awaiting-archive` + PR number を要求）・コマンド / flag 構成は無変更。変わるのは「`archived` を書く瞬間」と「cleanup を走らせる瞬間」だけである。

副作用として `job reopen` の可能窓が変わる。reopen は `awaiting-archive` かつ PR OPEN を要求するため、**reopen 可能窓は「archive 実行前まで」に固定**される（従来は「merge 前まで」）。これは関連 #1082 で意図された帰結であり、reopen 側のコード変更は不要。

## 検討した代替案

### A1: PR state 読み出しを warning 目的でのみ残す

`getPullRequest` を呼んで「既に MERGED ならば archive commit が main に届かない可能性がある」と stderr に warning を出す案。

- **Pros**: operator への実際の状態ベースの警告が出せる。
- **Cons**: client 依存が残り D1 の構造保証を失う。ネットワーク往復を archive の必須経路に残すことにもなる。
- **Why not**: 無条件 advisory（D6）が警告の目的を果たせる。依存の不在を型で表現する方が将来の保全性が高い。

### A2: PR を MERGED のときだけ remote branch を削除する

D1 を妥協し、PR state を見て merge 済みならば remote を消し、未 merge ならば消さない案。

- **Pros**: D3 の改名や flag 追加が不要。
- **Cons**: D1（client-closed）に反する。「merge 済みか否かを見る」という単相化が是正しようとした構造的依存を残す。
- **Why not**: PR state を見ずに安全側（remote 削除しない）へ倒すことで構造保証と操作安全性を同時に達成できる。

### A3: plain archive は cleanup を一切行わない

worktree / branch 削除を plain archive の責務から外し、operator が手動で cleanup する案。

- **Pros**: 実装が最もシンプル。remote 削除の問題も消える。
- **Cons**: 要件「archive 実行時に既存の local cleanup を完了すること。merge 後の再実行を cleanup の前提にしないこと」に直接反する。worktree が恒久的に残る。
- **Why not**: cleanup を完結させることが要件として明示されている。

### A4: `archive-recorded` 中間 status を新設する

`awaiting-archive` と `archived` の間に新 status を導入し、「記帳済みだが未 merge」を状態機械上で表現する案。

- **Pros**: 記帳済みかどうかが状態から直接読み取れる。`archiveRecorded` を folder 位置から推論する必要がなくなる。
- **Cons**: `VALID_TRANSITIONS`・`TERMINAL_STATUSES`・`doctor`・`reconcile`・`cancel`・`ps`・`inbox` など状態集合を消費する全コンポーネントへの波及が大きい。「merge なしで中間 status のまま恒久的に残る」job class が生じうる。
- **Why not**: `archiveRecorded` は folder 位置（`sourceChangeDir` の親 basename が `archive` か否か）から導出でき、状態集合を増やさずに同等の判定が可能。状態機械を最小に保つ原則（D9）を優先する。

### A5: `skipMergeCheck` flag を `runPlainArchive` に足す

`PlainArchiveInput` に `skipMergeCheck?: boolean` を追加し、`true` の場合のみ PR state 取得をスキップする案。非 `--with-merge` 分岐からこのフラグ付きで呼ぶことで、既存の GitHub API 依存を「死んだ分岐」として残しつつ挙動を変える。

- **Pros**: 変更範囲を `runPlainArchive` の呼び出し側（`src/cli/archive.ts`）と入力型に限定できる。`getPullRequest` を使う合成ロジック（MERGED / !archiveRecorded / OPEN の 3 分岐）を削除せずに保持できるため、将来 merge 状態に基づく分岐を再導入したい場合にコスト低。
- **Cons**: `skipMergeCheck: false`（既定）の分岐が死んだコードとして残り、「使わない約束」が型でなくコメントやドキュメントにしか表現されない。設定ミス（フラグを渡し忘れる）で merge 前に MERGED 判定分岐が走る余地が残る。`GitHubClient` 依存が `PlainArchiveInput` に残るため、orchestrator と同じ client-closed 性を plain 経路で回復できない。
- **Why not**: D1 の採用理由「依存の不在として表現する」に直接反する。「分岐を残したまま使わない」約束は将来の変更で条件が復活する余地を残す。型から依存が消えれば復活できない、という構造保証を得るためには削除しかない。

### A6: `merge-completion.ts` を削除し `merge-then-archive.ts` にインライン化する

`src/core/archive/merge-completion.ts`（`completeAfterMerge` / `mergedBeforeRecordEscalation`）を削除し、3 箇所の呼び出し先（`merge-then-archive.ts` Step 2 resume・wait ループ中の merge 検出・Step 6 merge 成功後）に処理をインライン展開する案。plain 経路から import を消す今回の機会に module ごと削除する。

- **Pros**: module 数が減る。`merge-completion` という「plain / with-merge 共有」を示唆する名前が消える。
- **Cons**: 同一の post-merge 完了処理（`markJobArchived` best-effort + `runArchiveCleanup`）が `--with-merge` の 3 箇所に複製され、将来の変更（例: cleanup 引数の追加）で drift が生じるリスクが高まる。3 箇所を常に同期して変更しなければならない保守負担が生まれる。
- **Why not**: `merge-completion.ts` は plain 経路が import しなくなれば「`--with-merge` の 3 箇所だけが使う共有実装」として名前と実態が一致する。D7 でその旨を JSDoc に明記することで意味の混乱も解消できる。削除は `--with-merge` 側への純粋なコスト（複製による drift リスク）でしかなく、得られる構造的利点がない。

## リスク / トレードオフ

- **archive 後に worktree が消えるため、rebase を後から行えない**: 操作順を「(必要なら) rebase → archive → merge」とし、`guide merge` の既存記述と一致させる。archive 後に rebase が必要になった場合は `job attach --branch <branch>` で worktree を復元できる（remote branch は D3 により残っている）。
- **local feature branch が merge 前に削除される**: archive commit は push 済みで remote に存在するため復旧可能。cleanup の stdout に「remote branch は残す」旨を出し、`git fetch origin <branch>` で復元できることを示す。
- **remote feature branch が merge 後に残る（GitHub の auto-delete 未設定の repo）**: これは意図した委譲（D3）。GitHub repo 設定の "Automatically delete head branches" を有効にすることを推奨する。
- **PR が既に MERGED の job に archive を実行すると folder move が main に届かない**: D6 の advisory で operator に明示する。job は `archived` + cleanup で終端するため state 上の不整合は残さない。
- **`archived` が durable に永続しない**: `markJobArchived` は record working tree に書き、cleanup がその worktree を撤去するため `archived` は git に残らない。これは `--with-merge` 経路の既存現実と同じであり、本変更による新規退行ではない（Open Question として分離）。

## Open Questions

- **Q1**: `archived` を archive commit（feature branch）に含めて durable にするか。transition 後に state.json の差分を 2 つ目の commit として push すれば、merge 後の main で `archived` が読めるようになる。本変更では要件「push 成功後に遷移」を優先して見送るが、後続 issue の候補として残す。
- **Q2**: `--with-merge` も remote branch 削除を GitHub の auto-delete に委譲すべきか。委譲すれば `deleteRemoteBranch` flag ごと不要になるが、`--with-merge` の既存挙動を変える回帰リスクがあるため本変更では扱わない。
- **Q3**: `ArchiveInput.deferArchivedTransition`（deprecated・値は無視される）を削除するか。scope 外とし、後続の清掃に委ねる。

## Migration Plan

コード / state のマイグレーションは不要。以下は運用手順のみ。

1. **旧 2 相契約の残置 job**（archive record push 済み・PR merge 済み・`awaiting-archive`）: `specrunner job archive <slug>`（または `--from-issue <n>`）を 1 回実行する。D5 の Path A / Path B のいずれかで `archived` + cleanup に到達する。追加操作は不要。
2. **archive record push 済み・PR OPEN の残置 job**: 同じく 1 回実行で完結する。Path A を通り、push は `Everything up-to-date` になる。
3. **GitHub repo 設定**: plain archive が remote branch を削除しなくなるため、Settings → General → "Automatically delete head branches" を有効にすることを推奨する。未設定でも機能上の問題はなく、merge 済み branch が残るだけである。
4. **rollback**: 本変更は state schema・遷移表・CLI 面を変更しないため、revert のみで戻せる。revert 後、単相 archive で `archived` になった job は terminal 短絡（`Already finished (archived).`）で扱われる。

## 影響

### Positive

- plain `job archive` が 1 回の実行で folder move → commit/push → `awaiting-archive → archived` → local cleanup まで完結する。operator の 2 回実行義務と「今どちらの相か」の判断負担が消える。
- plain archive 経路全体が client-closed になり、GitHub が到達不能な環境でも実行できる。
- `deriveNextAction` が常に `job archive <slug>` を返すことで、`job ls` の次アクション案内が merge 状態に依存しなくなる。
- D3 により remote branch が merge 前に誤って削除されるリスクが構造的に消滅する。
- 旧 2 相契約の残置 job がコマンド追加なしに 1 回の archive で終端できる。

### Negative / Known Debt

- **remote feature branch が archive 後に残り続ける（GitHub の auto-delete 未設定の場合）**: 意図した委譲（D3）。GitHub repo 設定で対処可能。
- **`archived` の durable 化は見送り（Q1）**: main ブランチ上の state.json が `awaiting-archive` を保持し続ける現状は変わらない。これは `--with-merge` 経路の既存現実と同じであり、新たな退行ではない。

## 参照

- Request: `specrunner/changes/single-phase-archive/request.md`
- Design: `specrunner/changes/single-phase-archive/design.md`
- Spec: `specrunner/changes/single-phase-archive/spec.md`
- Supersedes: [ADR-20260821-archive-state-after-merge](2026-08-21-archive-state-after-merge.md)
- Amends: [ADR-20260603-archive-command-client-closed](2026-06-03-archive-command-client-closed.md)
- Related: [ADR-20260603-with-merge-wait-until-green](2026-06-03-with-merge-wait-until-green.md) — `--with-merge` の CI wait ロジック（本変更で無変更）
- Related: [ADR-20260821-archive-from-issue](2026-08-21-archive-from-issue.md) — archive face の remote 取り込み（本変更の単相契約と整合する）
