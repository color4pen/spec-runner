# Design: archive を 1 回で完結させ、merge 後の再 archive 契約を撤回する

## Context

### 現状（2 相契約）

`src/core/archive/plain-archive.ts` の `runPlainArchive` は、plain `job archive <slug>` を
「archive record を積む操作」と「merge 後の terminal 化」の 2 相に分割している。

- L112-158: `githubClient` + `owner` + `repo` + `prNumber` が揃うとき `getPullRequest` を呼び、
  `state === "MERGED"` かつ `archiveRecorded` なら `completeAfterMerge`（`markJobArchived` +
  `runPostMergeCleanup`）で終端する。`MERGED` かつ `!archiveRecorded` は
  `mergedBeforeRecordEscalation` で exit 1。
- L163-175: `runArchiveOrchestrator` で archive record を feature branch に commit / push する。
- L186-194: `prNumber` があれば `awaiting-archive` のまま exit 0 とし、
  「`After the PR is merged, re-run: specrunner job archive <slug>`」を stdout に出す。
- L196-215: `prNumber` が無い job のみ、record 直後に `markJobArchived` する（cleanup はしない）。

`.github/workflows/specrunner-dispatch.yml` L33-37 の `action=archive` 説明も
「2 相の実行を前提とする」「2 回目（merge 後・head branch 削除済み）」と、この契約を明文化している。

### 構造上の問題

同じ `job archive` コマンドが merge 前後で別の意味を持ち、operator は「今どちらの相か」を
自分で判断する必要がある。job lifecycle（`awaiting-archive → archived`）と
PR lifecycle（`OPEN → MERGED`）という独立した 2 つの状態機械を同期させたことが原因である。

`architecture/components.md` の ArchiveOrchestrator 不変条件（**client-closed** —
GitHubClient に依存せず、外部状態の待ち・polling を含まず決定的に完結する）は
orchestrator 単体では守られているが、plain 経路の合成 module が GitHubClient を持ち込んだことで
「archive 操作全体としては GitHub PR state に依存する」状態になっている。

### 制約（既存コードから確認済みの事実）

- `runPostMergeCleanup`（`src/core/archive/post-merge-cleanup.ts` L111）は
  **remote feature branch を削除する**（`git push origin --delete <branch>`）。
  merge 前にこれを実行すると PR が閉じられ、archive commit が main へ届く経路が消滅する。
  単相化の最大の障害はここにある。
- `archiveChangeFolder` / `commitArchive` はいずれも `{ ok, skipped }` を返し冪等。
  `markJobArchived` も `noop` 判定つきで冪等。
- `resolveArchiveJobContext`（`src/core/archive/job-context.ts`）の `archiveRecorded` は
  `sourceChangeDir` の親 basename が `archive` か否かで導出され、**status に依存しない**。
  `JobCatalog.listWithSourceDirs` は main checkout と `.git/specrunner-worktrees/*` の両方を走査し、
  `updatedAt` 最新を採るため、feature branch worktree 側の archive record も観測できる。
- `merge-completion.ts` の `completeAfterMerge` / `mergedBeforeRecordEscalation` は
  `merge-then-archive.ts`（`--with-merge`）から計 4 箇所で使われている（L244 / L251 / L467 / L763）。
- `src/core/job-list/operations-view.ts` L228 の `deriveNextAction` は
  `awaiting-archive` に対して `prMerged === true` のときだけ `job archive <slug>` を提示する
  （merge → archive の旧操作順の残骸。#1049 以前から存在）。
- `git ls-remote` は `src/git/transport-auth.ts` の `TRANSPORT_SUBCOMMANDS` に登録済みで、
  token 付き実行が可能。

## Goals / Non-Goals

**Goals**:

1. plain `job archive <slug>` / `--from-issue <n>` が **1 回の実行**で
   folder move → commit/push → `awaiting-archive → archived` → local cleanup まで完結する。
2. terminal transition の条件から GitHub PR state（MERGED 判定）を完全に除去する。
3. archive 実行が PR を壊さない（remote feature branch を消さない）ことを構造的に保証する。
4. 旧 2 相契約の残置 job が、新しい plain archive を 1 回実行するだけで
   `archived` + cleanup に到達する（専用の移行コマンドを追加しない）。
5. workflow_dispatch `archive` と CLI の operator 向け文言から 2 相の案内を除去し、
   操作順 **archive → merge** を単一の正とする。
6. `--with-merge` の既存契約・挙動を回帰させない。

**Non-Goals**:

- archive folder move の廃止
- archive commit を main へ直接書くこと
- GitHub UI merge の自動化 / webhook / daemon による merge 後処理
- 新しい archive / finalize コマンドの追加、新 job status の追加
- PR merge 状態と job status の同期機構の追加
- `archived` を feature branch の archive commit に永続化すること（Open Questions Q1 参照）
- `architecture/` 配下（out-of-loop / CODEOWNERS 管理）の改訂

## Decisions

### D1: plain archive から GitHub PR state 検出を構造的に除去する

`PlainArchiveInput` から `githubClient` / `owner` / `repo` を削除し、
`runPlainArchive` が `GitHubClient` 型を一切 import しない module にする。
`src/cli/archive.ts` の非 `--with-merge` 分岐からも client 構築（L277-279）と
origin 解決（L269-275）を除去する。**`githubToken` の解決は残す** — push の transport auth に必要で、
これは GitHub API ではなく git transport の資格情報である。

これにより plain archive は orchestrator と同じ **client-closed** 性を回復し、
`architecture/components.md` の ArchiveOrchestrator 不変条件（外部状態の待ち・polling を持たない）と
archive 経路全体で整合する。

**Rationale**: 受け入れ条件「plain archive は GitHub PR state の MERGED 判定を terminal transition の
条件にしない」を、実行時の分岐条件ではなく **依存の不在**として表現する。分岐を残したまま
「使わない」約束にすると、将来の変更で条件が復活する余地が残る。型に依存が無ければ復活できない。

**Alternatives considered**:

- **PR state 読み出しを warning 目的でのみ残す**（要件 9 の「operator へ警告として表面化してよい」を
  事実ベースで満たす案）。却下: client 依存が残り D1 の構造保証を失う。ネットワーク往復を
  archive の必須経路に残すことにもなる。警告は D6 の無条件 advisory で十分に果たせる。
- **`skipMergeCheck` flag を `runPlainArchive` に足す**。却下: 死んだ分岐と設定ミスの余地を残す。
  plain archive に 2 つの意味を保持し続けることになり、本変更の目的そのものに反する。

### D2: terminal transition は「archive record push 成功」を唯一の条件にする

record（folder move → commit → push）が成功した時点で `markJobArchived` を呼び、
`awaiting-archive → archived` を確定する。PR が OPEN でも CLOSED でも MERGED でも同じ。
`archived` の意味は「SpecRunner 側の archive 処理が完了した」に固定され、
「変更が main に入った」は含意しない。

順序は **push 成功 → transition → cleanup** に固定する。
record / push が失敗した場合は transition も cleanup も行わず escalation（exit 1）で終わる。
cleanup が worktree を撤去すると state 書き込み先が消えるため、transition は cleanup より前に置く。

**Rationale**: job lifecycle と PR lifecycle は別の状態機械であり、同期させない（request の
「設計上の訂正」）。push 成功を境界にするのは、それが「archive の成果物が PR に載った」ことを
SpecRunner 単独で確認できる最後の点だからである。

**Alternatives considered**:

- **transition を push より前に置き、状態変更を archive commit に含める**: `archived` が PR に載って
  durable になる利点があるが、要件 3「archive record push 成功後に遷移」に反し、push 失敗時に
  terminal になった job が残る。却下（durable 化そのものは Q1 として分離）。
- **commit 成功で transition し push は best-effort**: push 失敗時に「local だけ archived」な
  job が生まれ、PR に folder move が載らない（要件 2 違反）。却下。

### D3: cleanup から remote branch 削除を分離し、plain archive は remote を消さない

`src/core/archive/post-merge-cleanup.ts` を `src/core/archive/cleanup.ts` に改名し、
`runPostMergeCleanup` → `runArchiveCleanup` にリネームしたうえで
入力に `deleteRemoteBranch?: boolean`（既定 `true`）を追加する。

- plain archive: `deleteRemoteBranch: false`。worktree 撤去 / liveness・managed marker・sidecar 削除 /
  **local** branch 削除までを行い、`git push origin --delete <branch>` は実行しない。
- `--with-merge`: `deleteRemoteBranch` 未指定（= `true`）。merge 直後に呼ばれるため既存挙動を維持する。

remote feature branch の削除は **GitHub 側の governance に委譲**する（merge 時の
auto-delete head branch 設定、または operator の手動削除）。要件 5「PR merge は GitHub UI /
GitHub governance に完全に委譲」の自然な帰結である。

module 名の改名を伴うのは、この module が merge 前にも呼ばれるようになるためである。
`post-merge-cleanup` という名前を残すと「merge 後にしか走らない」という誤読を招き、
将来 remote 削除が無条件で戻される危険がある。

**Rationale**: 単相化の唯一の破壊的障害が remote branch 削除である。PR が OPEN のまま
head branch を消せば PR は閉じられ、archive commit が main に到達する経路が失われる。
PR state を見ずに安全側へ倒す唯一の方法は「plain archive は remote を消さない」を無条件にすること。

**Alternatives considered**:

- **PR state を見て merge 済みのときだけ remote を消す**: D1（client-closed）に反する。
- **plain archive は cleanup を一切行わない**: 要件 4「archive 実行時に既存の local cleanup を
  完了する」に反し、worktree が恒久的に残る。
- **module 名を維持して flag だけ足す**: 変更量は最小だが、`post-merge-cleanup` が merge 前に
  呼ばれる状態が残り名前が事実に反する。改名のコストは import 元と test の mock path に限られる。
- **local branch も残す**: cleanup の意義が薄れる。archive commit は push 済みで remote に存在するため
  local branch 削除は復旧可能（`git fetch origin <branch>` / `job attach --branch`）。

### D4: PR を持たない job も同一経路に統合する

旧 `runPlainArchive` は `prNumber` 不在の job（design-only profile 等）だけを特別扱いし、
record 後に `markJobArchived` を呼ぶが cleanup は行わなかった（remote branch 削除が破壊的なため）。
D3 で remote 削除が plain 経路から消えたため、この分岐は不要になる。
PR の有無にかかわらず **record → transition → cleanup** の単一経路に統合する。

**Rationale**: 分岐を残す理由（cleanup の破壊性）が D3 で消滅した。要件 4 は cleanup の完了を
PR の有無で条件付けていない。経路が 1 本になることで、テストすべき組み合わせも減る。

**Alternatives considered**: `prNumber` 不在時のみ cleanup を skip する現行挙動の維持。却下:
worktree が残り続ける job class を温存するだけで、得るものがない。

### D5: 記帳済み job のべき等な後始末（旧 2 相契約の残置 job）

旧契約の残置 job（archive record push 済み・PR merge 済み・status `awaiting-archive`）に対し、
専用コマンドを追加せず、同じ `job archive` の 1 回実行で `archived` + cleanup に到達させる。
`archiveRecorded`（folder が `archive/` 配下にあるか。local な git 事実であり PR state ではない）
を用いて 2 つの経路を持つ。

**Path A（記帳経路 — 通常）**: record working tree が使用可能なとき。
`runArchiveOrchestrator` → transition → cleanup。既に記帳済みなら mv も commit も skip され、
残りは push・transition・cleanup になる。

このとき push が問題になる。merge 済みで GitHub が head branch を削除していると、
`git push origin <branch>` は削除済み branch を**再作成**してしまう（debris）。
そこで orchestrator の push 段に次の規則を入れる:

> mv と commit の**両方が skip された**（= この実行が新しい記帳を生んでいない）場合に限り、
> push 前に `git ls-remote --heads origin <branch>` を実行する。
> 該当 ref が無ければ push を skip し warning を出す。
> ref があれば従来どおり push する（`Everything up-to-date` になる）。
> ref がある（または ls-remote が失敗した fail-open の）状態での push 失敗は
> 従来どおり escalation / exit 1 とする。「新しい記帳を生んでいない」ことは
> 「remote が record を持っている」ことを意味しない — 前回実行が commit まで成功して
> push だけ失敗した場合、record commit は local にしか存在しないため、
> push 成功前に archived / cleanup へ進めてはならない。

新規記帳を生んだ実行（mv または commit が走った実行）では push は従来どおり**必須**であり、
失敗は escalation である（D2 の順序保証）。crash 後の再実行（commit 済み・push 未了）は
commit skip・mv skip だが remote ref は存在するため push が実行され、成功すれば正しく復旧し、
再び失敗すれば escalation で停止する（record を失わない）。

**Path B（degraded 経路）**: `archiveRecorded === true` かつ record working tree が使えないとき。
具体的には:

- `noWorktree === false` かつ（`worktreePath === null` または worktree ディレクトリが存在しない）
- `noWorktree === true` かつ（`branch === null` または local に `refs/heads/<branch>` が無い）

この場合 orchestrator を呼ばず（呼べば worktree 解決 / checkout で escalation になる）、
finishable gate → `markJobArchived(slug, cwd)` → cleanup の順で best-effort に終端する。
transition 失敗は warning に留め cleanup を続行し exit 0 とする。
これは remote runner（GitHub Actions）の残置 job 取り込みが通る経路である
（`archive --from-issue` の base-borne archive record fallback で slug が解決され、
local worktree は存在しない）。

**Rationale**: 要件 10 は「べき等な後始末として扱い、専用の移行コマンドを追加しない」と明示している。
`archiveRecorded` は既存の導出であり新しい状態を増やさない。Path B を best-effort にするのは、
残置 job にとって「終端させること」が目的であり、書き込み先の不在で失敗させると
CLI 経由で回収不能な job class を作ってしまうためである。

**Alternatives considered**:

- **専用の migration コマンド追加**: 要件 10 が明示的に禁止。
- **push を常に best-effort にする**: 新規記帳が push されないまま `archived` になりうる
  （要件 2 違反）。却下。
- **Path B を設けず、worktree 不在を escalation のままにする**: local worktree を失った残置 job が
  CLI で終端できない。remote runner の取り込みが成立しない。却下。
- **`git ls-remote` の代わりに push 失敗を無条件に許容**: 削除済み branch の再作成（debris）が残る。

### D6: PR merge に関する operator 向け情報は「無条件の advisory」に限定する

要件 9 の「archive record commit が main に届かない可能性を operator へ警告として表面化してよい」は、
PR state の観測ではなく**無条件の 1 行 advisory** で満たす。record 成功時の stdout は:

- archive commit を push した branch と PR 番号（あれば）
- 次の操作は GitHub 上での PR merge であること
- PR が既に merge / close 済みの場合、この commit は base branch に届かないこと

を伝える。「merge 後にもう一度 archive せよ」に相当する案内は出さない
（要件 7 / 受け入れ条件）。

**Rationale**: 事実ベースの警告には PR state の読み出しが必要で D1 と両立しない。
一方この advisory は archive 実行時点で常に真であり（archive → merge が正の操作順である以上、
PR が既に merged なのは異常系）、operator に必要な情報を過不足なく伝える。

**Alternatives considered**: 警告を出さない。却下: 要件 9 が「PR が既に MERGED の job に archive を
実行した場合の挙動を設計で明示すること」を求めており、operator が folder move の未着を
知る手段が無くなる。

### D7: `merge-completion.ts` は `--with-merge` 専用として残す

要件 6 の選択（削除 / `--with-merge` 専用として残す）については **`--with-merge` 専用として残す**を採る。

- `completeAfterMerge` は `merge-then-archive.ts` の 3 箇所（Step 2 resume / wait ループ中の
  merge 検出 / Step 6 merge 成功後）で使われ、いずれも**実際に merge 後**の呼び出しである。
  ここでは名前と意味が一致している。
- `mergedBeforeRecordEscalation` も `--with-merge` Step 2 で使われ続ける
  （`--with-merge` は「これから merge する」ので、記帳前 merge は依然として順序エラー）。
- plain 経路からの import（`plain-archive.ts` L28）は削除する。

module の JSDoc から「plain archive と共有」の記述を除去し、
`--with-merge` 専用であることを明記する。`completeAfterMerge` は D3 の
`runArchiveCleanup` を `deleteRemoteBranch` 未指定（`true`）で呼ぶ。

**Rationale**: 「通常操作契約として使わない」（要件 6）は満たしつつ、`--with-merge` の
post-merge 処理を 3 箇所にインライン複製する退行を避ける。削除は `--with-merge` 側に
純粋なコストしか生まない。

**Alternatives considered**:

- **削除して `merge-then-archive.ts` にインライン化**: 同一処理が 3 箇所に複製され、
  `--with-merge` 経路の drift を招く。却下。
- **plain 経路の移行用に残す**: D5 の Path B は `completeAfterMerge` を使わない
  （transition 失敗の扱いと state root が異なる）ため、移行専用の用途は発生しない。

### D8: 操作順 archive → merge を operator 面に反映する

2 相契約 / 旧操作順（merge → archive）を前提にした operator 向け文言を更新する。

1. **workflow_dispatch**（`.github/workflows/specrunner-dispatch.yml` L33-37）:
   `archive` の説明を「完走した job を issue 番号から 1 回の実行で取り込む」に書き換え、
   「2 相」「1 回目 / 2 回目」「merge 後・head branch 削除済み」の記述を除去する。
   PR merge は archive 後に GitHub UI で行う独立操作であることを明記する。
   **workflow の実行部（`bun ./bin/specrunner.ts job archive --from-issue "$ISSUE"`）は無変更** —
   既に 1 回しか呼んでおらず、単相化は CLI 側の契約変更で達成される。
2. **`deriveNextAction`**（`src/core/job-list/operations-view.ts` L228）:
   `awaiting-archive` の次アクションを `prMerged` に依存させず、常に `job archive <slug>` を返す。
   `CATEGORY_META` の `"awaiting-archive"` エントリのラベルを `"merge・archive 待ち"` から
   `"archive・merge 待ち"` に変更する — 操作順が archive → merge であることを反映し、
   旧操作順（merge → archive）を示唆するラベルを是正する。
   `buildStatusCell`（L333）の `awaiting-archive (PR merged)` 注記は **維持する** —
   これは GitHub 側の事実の表示であり、次アクションの条件ではない。
3. **完了通知 / 完了時ヒント**: `buildCompletionComment`（`src/core/notify/issue-notifier.ts` L236-239）と
   `job wait` / progress の `next: specrunner job archive <slug>` は既に merge 状態に依存しておらず
   **無変更**。

**Rationale**: 要件 9 が操作順を `archive → merge` と定めた以上、`awaiting-archive` の job に対する
推奨アクションは常に archive である。`prMerged === true` を待つ現行実装は旧操作順の残骸で、
新契約では「merge されるまで次アクション無し」という誤った案内になる。

**Alternatives considered**: `deriveNextAction` を scope 外とする。却下: `job ls` が
「archive は merge 後」と案内し続け、受け入れ条件「merge 後にもう一度 archive の案内がない」の
趣旨に反する。変更は 1 行 + テスト 2 件で完結する。

### D9: 状態機械 / CLI 面 / checkpoint policy は変更しない

`VALID_TRANSITIONS`（`awaiting-archive → archived`）・`REOPEN_TRANSITIONS`・`TERMINAL_STATUSES`・
`attachArchivePolicy`（`awaiting-archive` + PR number を要求）・コマンド / flag 構成は無変更。
変わるのは「`archived` を書く瞬間」と「cleanup を走らせる瞬間」だけである。

副作用として `job reopen` の可能窓が変わる。reopen は `awaiting-archive` かつ PR OPEN を要求するため、
**reopen 可能窓は「archive 実行前まで」に固定**される（従来は「merge 前まで」）。
これは request の「関連: #1082」で意図された帰結であり、reopen 側のコード変更は不要。

**Rationale**: 状態集合を増やさずに単相化を達成できる。`attachArchivePolicy` が
`awaiting-archive` を要求する点は、archive 実行**前**の rebind を前提とする以上そのまま成立する。

**Alternatives considered**: `archive-recorded` 中間 status の新設。却下:
`archiveRecorded` を folder 位置から導出する既存機構で足りる。状態集合の拡大は
`doctor` / `reconcile` / `cancel` / `ps` / `inbox` に波及する。

## Risks / Trade-offs

- **[archive 後に worktree が消えるため、rebase を後から行えない]** → Mitigation:
  操作順を「(必要なら) rebase → archive → merge」とし、`guide merge` の既存記述
  （rebase は worktree 内で archive より前）と一致させる。archive 後に rebase が必要になった場合は
  `job attach --branch <branch>` で worktree を復元できる（remote branch は D3 により残っている）。
  `--with-merge` を使う `rebase-finish` skill は本変更の影響を受けない。

- **[local feature branch が merge 前に削除される]** → Mitigation: archive commit は push 済みで
  remote に存在するため復旧可能。cleanup の stdout に「remote branch は残す」旨を出し、
  `git fetch origin <branch>` で復元できることを示す。

- **[remote feature branch が merge 後に残る（GitHub の auto-delete 未設定の repo）]** →
  Mitigation: これは意図した委譲（D3）。GitHub repo 設定の
  "Automatically delete head branches" を有効にすることを Migration Plan に記す。
  `--with-merge` 経路は従来どおり remote を削除するため、この差異は plain 経路に限定される。

- **[PR が既に MERGED の job に archive を実行すると folder move が main に届かない]** →
  Mitigation: D6 の advisory で operator に明示する。job は `archived` + cleanup で終端するため
  （要件 9 の最低条件）、state 上の不整合は残さない。folder の再配置は base への直接 commit が
  必要であり、これは archive の設計不変（非目標）の外にある operator 作業として扱う。

- **[`archived` が durable に永続しない]** → Mitigation: `markJobArchived` は record working tree に
  書き、cleanup がその worktree を撤去するため `archived` は git に残らない。これは
  `--with-merge` 経路の既存現実（本 repo の `specrunner/changes/archive/*/state.json` が
  すべて `awaiting-archive`）と同じであり、本変更による新規退行ではない。Q1 として分離する。

- **[cleanup module 改名による回帰]** → Mitigation: 改名はシンボル名とパスのみで、本体ロジックは
  `deleteRemoteBranch` 分岐の追加だけ。既存の `post-merge-cleanup.test.ts` を
  import path のみ更新して green に保つことを合格条件にする。

- **[`--with-merge` の回帰]** → Mitigation: `--with-merge` の振る舞いに関する既存テスト
  （`src/core/archive/__tests__/merge-then-archive.test.ts` / `tests/unit/core/archive/` 配下）を
  **アサーション無変更**（mock path / symbol 名の追従のみ）で green に保つことを合格条件にする。

- **[Path B の条件判定が過剰に発火する]** → Mitigation: Path B は `archiveRecorded === true` を
  前提条件に持つ。未記帳 job は必ず Path A を通るため、通常の archive が degraded 経路に
  落ちることはない。テストで「archiveRecorded === false + worktree 不在 → Path A（escalation）」を固定する。

## Open Questions

- **Q1**: `archived` を archive commit（feature branch）に含めて durable にするか。
  transition 後に state.json の差分を 2 つ目の commit として push すれば、merge 後の main で
  `archived` が読めるようになる。本変更では要件 3（push 成功後に遷移）を優先して見送るが、
  「archive commit を main へ直接書く」非目標には抵触しないため、後続 issue の候補として残す。

- **Q2**: `--with-merge` も remote branch 削除を GitHub の auto-delete に委譲すべきか。
  委譲すれば `deleteRemoteBranch` flag ごと不要になり cleanup が 1 種類になるが、
  `--with-merge` の既存挙動を変える回帰リスクがあるため本変更では扱わない。

- **Q3**: `ArchiveInput.deferArchivedTransition`（deprecated・値は無視される）を削除するか。
  本変更後も orchestrator は transition しないため意味は変わらないが、
  `merge-then-archive.ts` L265 の呼び出しと併せて除去できる死んだ入力である。
  scope 外とし、後続の清掃に委ねる。

## Migration Plan

コード / state のマイグレーションは不要。以下は運用手順のみ。

1. **旧 2 相契約の残置 job**（archive record push 済み・PR merge 済み・`awaiting-archive`）:
   `specrunner job archive <slug>`（または `--from-issue <n>`）を 1 回実行する。
   D5 の Path A / Path B のいずれかで `archived` + cleanup に到達する。追加操作は不要。
2. **archive record push 済み・PR OPEN の残置 job**: 同じく 1 回実行で完結する。
   Path A を通り、push は `Everything up-to-date` になる。
3. **GitHub repo 設定**: plain archive が remote branch を削除しなくなるため、
   Settings → General → "Automatically delete head branches" を有効にすることを推奨する。
   未設定でも機能上の問題はなく、merge 済み branch が残るだけである。
4. **rollback**: 本変更は state schema・遷移表・CLI 面を変更しないため、revert のみで戻せる。
   revert 後、単相 archive で `archived` になった job は terminal 短絡
   （`Already finished (archived).`）で扱われる。
