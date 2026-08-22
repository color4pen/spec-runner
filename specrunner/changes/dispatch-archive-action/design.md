# Design: dispatch archive action と PR head 経由の archive 経路

## Context

`.github/workflows/specrunner-dispatch.yml` の `workflow_dispatch` は `action` に `start` / `resume` の 2 択しか持たない（行 22-28）。merge 後の取り込み（archive）だけが手元マシン依存で残っており、Actions 完結にならない。

archive を Actions から撃つとき、runner は ephemeral（local state 無し・sidecar index 無し）である。この条件で `job archive --from-issue <n>` が辿る経路は以下:

1. `resolveCompletedJobId` — issue の completed marker から jobId を得る
2. `loadStateByJobId(repoRoot, jobId)` — local short-circuit（`src/cli/archive-from-issue.ts:103-115`）。ephemeral では sidecar が無く、fallback scan も `specrunner/changes/` 直下の active folder しか見ない（`src/core/job-access/load-by-job-id.ts:85` で `archive` / `canceled` を skip）ため `JOB_NOT_FOUND`
3. `resolveArchiveBranchFromIssue` — closing PR を列挙し、PR ごとに `git fetch origin <headRefName>` → `rev-parse` → `readStateJsonFromRef` → 4 点 identity 一致で確定
4. `runAttachVerification` — branch を fetch → rev-parse → checkpoint 読み込み → `verifyCheckpoint`
5. `setupWorkspace({attachCheckpoint})` → `runArchive({slug})`

この経路には現状 4 つの gap がある。

- **G1**: dispatch workflow に archive の入口が無い。
- **G2**: merge 時に head branch が削除されると (3) の `git fetch origin <headRefName>` が失敗し、その PR は skip される。全 PR が skip されて `ARCHIVE_FROM_ISSUE_UNCONFIRMED`（`src/core/issue-target/archive.ts:132-140, 196-201`）。
- **G3**: run #1（PR OPEN 時の archive record）は change folder を `specrunner/changes/archive/<YYYY-MM-DD>-<slug>/` へ `git mv` する（`src/core/finish/archive-change-folder.ts`）。したがって merge 後の PR head tree には active な change folder が存在しない。`resolveCheckpointSlug` は `archive` / `canceled` を除外する（`src/git/checkpoint-ref.ts:21, 85`）ため、head branch が生きていても (3) の `readStateJsonFromRef` が `CHECKPOINT_NOT_FOUND` で throw → skip → `ARCHIVE_FROM_ISSUE_UNCONFIRMED`。**branch 削除とは独立に、record 済み PR の merge 後は PR head 経由で slug を解決できない。**
- **G4**: 仮に (3) が pull ref fallback で成功しても、(4) の `runAttachVerification` が branch 名から無条件に `git fetch origin <branch>` を実行して失敗する（`src/core/attach/orchestrator.ts:58-64`, `ATTACH_FETCH_FAILED`）。

merge 後完了の受け皿は #1051 で既に存在する: `resolveArchiveJobContext` が `listWithSourceDirs(cwd, {includeArchived: true})` で archived record を読み、`archiveRecorded = true` かつ PR が MERGED なら `completeAfterMerge()`（`markJobArchived` + `runPostMergeCleanup`）→ exit 0（`src/core/archive/plain-archive.ts:126-147`）。不足しているのは、ephemeral runner でそこへ到達する経路だけである。

## Goals / Non-Goals

**Goals**:

- dispatch workflow の `action` に `archive` を追加し、`specrunner job archive --from-issue "$ISSUE"` のみを呼ぶ（G1）
- head branch 削除済みでも closing PR を特定できるよう、locator に `refs/pull/<n>/head` fallback を追加する（G2）
- fallback で得た OID を attach 検証に持ち回り、削除済み branch の再 fetch を止める（G4）
- ephemeral runner の merge 後 archive で `completeAfterMerge` に到達し exit 0 にする（G3）
- 4 点 identity の強度、`--with-merge` の挙動、#1051 の awaiting-archive 状態機械を変更しない

**Non-Goals**:

- Actions からの auto-merge、archive での CI 監視
- archive 専用 workflow の新設、webhook / daemon 常駐
- main への `archived` 書き戻し、新 status / 新 marker の追加
- `resolveCheckpointSlug` の除外規則の変更（attach / resume 共有経路に波及するため）
- `job resume --from-issue` / `job attach --branch` の既存 fetch 挙動の変更

## Decisions

### D1: dispatch workflow に `archive` choice と専用分岐を足す

`action` の options に `archive` を追加し、"Run pipeline" step の shell 分岐に `archive` の枝を足す。枝の中身は `bun ./bin/specrunner.ts job archive --from-issue "$ISSUE"` の 1 行のみ。`--with-merge` は付けない。`from` / `prompt` / `force` は archive では使わない。既存の `resume` / `start` 分岐は無改変。

**Rationale**: workflow を状態機械にしない。「merge されたか」「record 済みか」の判定は既に `plain-archive.ts` にあり、workflow 側に複製すると同じ判定が 2 箇所に生まれる。archive 専用 workflow を新設せず既存 dispatch に相乗りするのは、`issue` / permissions / secrets の配線を再実装しないため。

**Alternatives considered**:
- archive 専用 workflow を新設 — 入力・権限・認証の重複。Non-Goal。
- workflow 内で `gh pr view` して merged を確認してから撃つ — CLI 側の判定と二重化し、判定の食い違いが出る。

### D2: locator に PR 単位の `refs/pull/<n>/head` fallback を足す

`resolveArchiveBranchFromIssue` の候補 loop で、`git fetch origin <headRefName>` が非 0 のとき即 skip せず `git fetch origin refs/pull/<prNumber>/head` を試す。成功したら `git rev-parse FETCH_HEAD^{commit}` で OID を確定し、以降（`readStateJsonFromRef` → 4 点 identity）は head branch 経路と完全に同一の処理を通す。fallback も失敗したら従来どおり `logWarn` + skip。

4 点 identity（`state.jobId` / `state.issueNumber` / `state.branch === headRefName` / `state.pullRequest.number === PR.number`）は無改変。`state.branch` は削除済みの branch 名と比較され続けるが、これは PR metadata 上の `headRefName` との照合であり branch の存在に依存しない。

**Rationale**: `refs/pull/<n>/head` は head branch 削除後も残る GitHub 側の ref であり、追加の権限も API も要らない。ローカル refspec を切らず `FETCH_HEAD` を使うのは、後始末の要らない参照で済むうえ、候補 loop が逐次実行で fetch 直後に `rev-parse` するため `FETCH_HEAD` の上書き競合が起きないため。

**Alternatives considered**:
- `git fetch origin refs/pull/<n>/head:refs/specrunner/pr/<n>` で専用 ref を作る — 検証後に消す後始末が要る。並行実行を許すなら将来こちらへ寄せる。
- API で head SHA を取り、`git fetch origin <sha>` — server の `uploadpack.allowReachableSHA1InWant` 設定に依存する。
- identity 検証を緩める — 4 点 identity は本 request の保護対象。却下。

### D3: `runAttachVerification` に任意入力 `checkpointOid` を足し、archive 経路は常に渡す

`AttachVerificationInput` に `checkpointOid?: string` を追加する。指定時は `git fetch` と `git rev-parse` を両方 skip し、そのまま `readCheckpointFromRef(spawnFn, cwd, checkpointOid)` + `verifyCheckpoint` を実行する。未指定時の挙動は現行のまま（`job resume --from-issue` / `job attach --branch` は無改変）。

`archive-from-issue.ts` は `resolved.checkpointOid` を **head branch 経路と fallback 経路の両方で** 渡す。

**Rationale**: 削除済み branch の再 fetch を止めるのが直接の目的（G4）。両経路で渡すのは、locator が既に fetch 済みの OID を持っており、attach 側で再 fetch・再 rev-parse すると「identity を検証した OID」と「materialize する OID」が別コミットになりうる TOCTOU 窓が開くため。片方だけ渡すと分岐が 2 通りに増え、窓が塞がるのも片側だけになる。

**Alternatives considered**:
- fallback 経路でだけ OID を渡す — TOCTOU 窓が head branch 経路に残り、コードパスが 2 系統に分かれる。
- `runAttachVerification` に「fetch 失敗を許容する」flag を足す — 検証前提の fetch を fail-open にする形で、attach 全体の安全性契約を弱める。却下。
- locator から branch ではなく OID だけ返す — `verifyCheckpoint` / `setupWorkspace` が branch 名を必要とするため成立しない。

### D4: merge 後の slug 解決を、checkout 済み base branch の archive record から行う

`runArchiveFromIssue` の中でのみ、`loadStateByJobId` が `JOB_NOT_FOUND` を投げた直後に次を試す:

- `JobStateStore.listWithSourceDirs(repoRoot, { includeArchived: true })` を引き、`state.jobId === jobId` かつ `state.issueNumber === issueNumber` の entry を探す
- 該当が 1 件で、その `sourceChangeDir` が `specrunner/changes/archive/` 配下（= merge 済み archive record）なら、その slug を採用して locator / attach を丸ごと skip し、そのまま `runArchive({slug})` へ進む
- 0 件なら従来どおり locator 経路（D2/D3）へ落ちる。2 件以上なら `ARCHIVE_FROM_ISSUE_UNCONFIRMED` を投げる

`loadStateByJobId` 自体は変更しない（`job resume --from-issue` の解決規則を動かさないため）。

**Rationale**: G3 により、record 済み PR の merge 後は PR head 経由で slug を解決できない。一方 merge 後の base branch checkout には archive record が入っており、`runArchive` 側の `resolveArchiveJobContext` は既に `includeArchived: true` でそれを読んでいる。つまり不足しているのは jobId → slug の対応付けだけで、state の復元経路を新設する必要は無い。信頼の起点は「branch protection を通って merge された base branch の内容」+「issue の completed marker 由来の jobId」+「record の `issueNumber` 一致」であり、PR head tree より弱くない。merge 済み判定自体は従来どおり `plain-archive.ts` が GitHub API で `MERGED` を再確認する。

`resolveCheckpointSlug` の `archive` 除外を外す案を採らないのは、この述語が attach / resume と共有されており、archived folder を active checkpoint として掴む経路が全経路に開くため。

**Alternatives considered**:
- checkpoint reader を path-aware にして PR head の `archive/<date>-<slug>/` を読む — slug 発見手段（tip commit の diff 推定 or issue body の Meta）を新たに要し、`readCheckpointFromRef` / `verifyCheckpoint` の path 前提（`request.md` / `events.jsonl` / `treeFiles`）を全て引数化する必要がある。security-critical な述語への大改修。
- record commit の親（`OID^`）で identity を検証し tip を materialize する — 検証した OID と materialize する OID が割れ、D3 で塞いだ TOCTOU 不変条件を自ら破る。却下。
- run #1 で change folder を移動しない — #1051 の archive record 定義（`archiveRecorded` 判定）そのものを変える。射程外。

**この決定は request の Non-Goal 記述と接するため、Open Questions に上げて裁定を仰ぐ。**

### D5: 新しい status / marker / main commit は足さない

merge 後完了は既存の `awaiting-archive` → `completeAfterMerge` → `archived` で完結させる。main への書き戻し、issue への追加 marker、新 status は導入しない。

**Rationale**: #1051 の状態機械が既に「record → merge → 完了」を表現できており、追加の状態は同じ事実の二重表現になる。

**Alternatives considered**: issue に `archived` marker を追加して冪等性を取る — GitHub 側に真実の複製を作る。record の有無で既に冪等。

### D6: workflow の assertion は依存追加なしのテキスト検証で行う

`archive` choice の存在と、archive 分岐が `job archive --from-issue "$ISSUE"` のみを呼ぶ（`--with-merge` を含まない）ことを、`tests/` 直下の vitest で検証する。YAML parser 依存は足さず、`tests/grep-workflow-actions-pinned.test.ts` / `tests/dependabot-config.test.ts` と同じくファイル読み込み + ブロック抽出 + 文字列/正規表現で判定する。

**Rationale**: 依存極小が本 repo の第一の長所。`Bun.YAML` は `tests/grep-no-bun-imports.test.ts` の方針に反する。検証対象は「choice が 1 つある」「1 行の呼び出しが期待どおり」の 2 点で、構文木を要するほどの複雑さが無い。

**Alternatives considered**: `yaml` パッケージ追加 — この 2 点のために prod/dev 依存を増やす価値が無い。`actionlint` 導入 — 検証したい不変条件は lint の対象外。

## Risks / Trade-offs

- **[Risk] `FETCH_HEAD` は fetch ごとに上書きされ、並行 fetch があると別 PR の OID を読む** → 候補 loop は逐次で、fetch の直後に `rev-parse FETCH_HEAD^{commit}` で OID を確定してから次の候補へ進む。将来 loop を並列化するなら D2 の代替案（専用 refspec）へ切り替える。設計上の天井としてコード内にコメントで明示する。
- **[Risk] D4 は 4 点 identity を通らない経路になる** → jobId（issue の completed marker 由来）+ `issueNumber` の 2 点一致に加え、record が `archive/` 配下にあること（merge 済み record であること）を必須にし、さらに `plain-archive.ts` が GitHub API で PR `MERGED` を再確認する。複数一致は確定させず `ARCHIVE_FROM_ISSUE_UNCONFIRMED` にする。
- **[Risk] D4 が `resume --from-issue` の解決規則に波及する** → `loadStateByJobId` を触らず、`runArchiveFromIssue` 内のローカルな追加解決に閉じる。
- **[Risk] ephemeral runner では record 内の `worktreePath` が別マシンのパスで、`completeAfterMerge` の cleanup が空振りする** → `runPostMergeCleanup` は best-effort で、remote branch 消失も `isRemoteRefNotFound` で許容する設計。warning が出ても exit 0 を維持することを e2e で固定する。
- **[Risk] `--from-issue` の archive を Actions から誰でも撃てるようになる** → 撃てるのは `job archive --from-issue` のみで、merge は行わない（`--with-merge` を渡さない）。完了遷移の前提である PR `MERGED` は API で確認される。
- **[Trade-off] D3 の `checkpointOid` は「呼び出し側が正しい OID を検証済みで渡す」信頼を前提にする** → 任意入力とし、渡すのは locator が identity 検証を通した OID を持っている archive 経路だけに限定する。他経路は現行どおり自前で fetch する。

## Open Questions

1. **D4 を本 change の実装範囲に含めてよいか（要裁定）**
   request の Non-Goal に「新しい main 探索・復元経路は作らない」旨の記述がある一方、受け入れ条件は「PR MERGED + archive record 済みで `completeAfterMerge` が実行され exit 0」を **ephemeral（local state 無し）の end-to-end** で固定することを求めている。G3 により、この 2 つは同時に満たせない。取りうる選択肢:
   - **(A) D4 を採る（推奨）** — 差分が小さく、`runArchive` が既に読んでいる merge 済み record を jobId で引き当てるだけ。state 復元経路の新設ではない。
   - **(B) checkpoint reader を path-aware 化して PR head の archived folder を読む** — slug 発見手段の新設 + security-critical な述語の大改修。
   - **(C) 受け入れ条件を「local state のある環境での merge 後 archive」に緩め、ephemeral は G1/G2/G4 のみ対象にする** — Actions 完結という本来の目的が満たされない。
2. `refs/pull/<n>/head` を許可しない GitHub Enterprise 構成が対象環境に含まれるか。含まれる場合、fallback 失敗時のエラーメッセージに hint を足すか。
