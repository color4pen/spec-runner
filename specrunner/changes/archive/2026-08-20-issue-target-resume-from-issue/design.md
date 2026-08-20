# Design: job resume --from-issue

## Context

escalation で `awaiting-resume` になった job の checkpoint は origin の feature branch
に publish され、`job attach --branch <branch>` → `job resume <slug>` で別環境から再開
できる。だが呼び出し側が「どの branch を attach すべきか」を人手で特定する必要がある。
issue 起点運用（workflow_dispatch、将来の `/resume`）では issue 番号だけで再開が完結して
ほしい。

先行 request が土台を提供している（fact-check attestation で確認済み）:

- `core/issue-target/`（`start.ts`）: issue-linked start が feature branch を Development
  linked branch として登録する（best-effort、リンク不在の job も存在しうる）。
- `core/attach/`（`orchestrator.ts` / `verify-checkpoint.ts` / `checkpoint-policy.ts`）:
  rebind primitive は「generic integrity 検証 → 交換可能な use-case policy → 実体化」。
  `attachResumePolicy` が `status==="awaiting-resume"` + resumePoint 解決 + resume step
  reads() 入力検査を担う。`runAttachVerification` は fetch → OID 解決 → read → verify を
  行い、local state を作らずに `VerifiedCheckpoint` を返す。
- `issue-notifier.ts`: escalation コメントは機械可読 marker
  `<!-- specrunner:notification kind="escalation" jobId="<jobId>" version="1" -->` を含み
  full jobId を持つ。`buildMarker(kind, jobId)` が唯一の生成点。marker は HTML コメントに
  すぎず、それ単独では issue → job binding の真正性を保証しない。
- GitHub Development リンク（2026-08-20 introspection 確認、request 側で明示）:
  `issue.linkedBranches` と `issue.closedByPullRequestsReferences`。linked branch から PR が
  作られると Development 表示は branch から PR に置き換わるため両方を解決する必要がある。
  PR 側リンクは `pr-create/body-template.ts` の `Fixes #<issueNumber>` で現行成立済み。
- `github-client.ts`（adapter）: `graphqlEndpoint()` + `createLinkedBranch` で GraphQL POST の
  下地がある。`request()` middleware（401/429/5xx/same-origin）を再利用できる。
- state schema: `JobState.branch: string | null`、`JobState.issueNumber?: number | null`、
  `state.jobId`。checkpoint 内の state は自分の branch 名・issueNumber・jobId を持つ。

**核心原則（issue-target 層）**: issue は request source（start 時）または job locator
（既存 job 操作時）である。実行開始後の job identity / state の正本は remote checkpoint に
ある。resume は「既にあるものへ戻る」操作であり、**issue 本文は一切読まない**。発見は
GitHub の Development リンク（optional な index）で行い、確定は checkpoint identity の照合で
行う。issue → job binding の真正性をこの照合で確定することが本層の存在理由である。

### 制約

- **既存テスト無改変**: attach / resume / inbox の既存テストと、`GitHubClient` を全実装する
  ~30 個の typed mock factory（`: GitHubClient` を返す）を壊してはならない。
- **arch allowlist を増やさない**: `tests/unit/architecture/` が green のまま。すなわち
  (a) `src/core/issue-target/` は `cli/`・`adapter/` を import しない（module-boundary
  TC-001 / B-1）、(b) src/ の新規 `process.cwd()` 直読みを増やさない（CWD ratchet）。
- スコープ外: archive --from-issue、`/resume` 自動トリガー、run --from-issue dispatcher、
  marker format 変更、Development リンク登録側 / 掃除、inbox 発見ロジック、`.github/workflows/`、
  実行元 checkout branch のガード。

## Goals / Non-Goals

**Goals**:

- `job resume --from-issue <n>`: issue 番号だけで、marker → full jobId → Development リンク
  → checkpoint identity 3 照合 → rebind → 通常 resume の連鎖を成立させる。
- issue 本文を読まずに locate する（comments と Development リンクのみ）。
- リンク不在・identity 不一致・複数一致・marker 不在を、それぞれ意味の異なる fail-closed
  エラーで停止する（副作用ゼロ）。
- ローカルに対象 jobId の state があれば rebind を skip して冪等に再入する。
- positional `<slug>` と排他、`--prompt` / `--detach` と直交。
- usage テキストと CLI 組み込み guide に契約を反映する。

**Non-Goals**:

- 上記スコープ外項目すべて。
- `attachResumePolicy` / `verifyCheckpoint` / marker format の変更（再利用のみ）。
- Development リンクを identity の正本に昇格させること（あくまで index）。

## Decisions

### D1: locate 責務は issue-target の resume face（新 `core/issue-target/resume.ts`）に置く

`start.ts` と対称に、resume 側の「issue → job locator」変換を core/issue-target に置く。
公開する純関数:

- `resolveEscalationJobId(...)`: comments を走査し escalation marker から full jobId を得る
  （複数は createdAt 最新を採用）。marker 不在 → typed error。
- `resolveResumeBranchFromIssue(...)`: Development リンクから候補 branch を列挙し、各候補の
  checkpoint identity を照合して 1 本に確定する。0 件 / 不一致 / 複数一致 → typed error。
  確定 branch・slug・checkpointOid を返す。

**Rationale**: cli を import できない層（module-boundary TC-001）に置くことで、port と
spawnFn を注入した単体テストが可能になり、start face と実装様式が揃う。
**Alternatives**: cli に直書き → 単体テスト困難・boundary 逸脱で却下。

### D2: Development リンク列挙は `GitHubClient` に足さず、専用の狭い port を注入する

新メソッドを `GitHubClient` port の必須メソッドとして足すと、`: GitHubClient` を全実装する
~30 個の既存 typed mock がすべて typecheck で落ち、「既存テスト無改変」に反する。よって
resolver は狭い locator port（`listIssueComments` は既存 `GitHubClient` の signature を `Pick`
で再利用 + 新 `listIssueLinkedBranches` の 2 メソッド）に依存し、production の
`GitHubApiClient` はこの port を構造的に満たす（`listIssueLinkedBranches` を public メソッド
として追加するだけ。`GitHubClient` の shape は不変）。

**Rationale**: Interface Segregation。既存 mock を一切触らずに新依存を導入できる。
**Alternatives**: (a) `GitHubClient` 必須メソッド追加 → 既存 mock 全滅で却下。(b) optional
メソッド（`listIssueLinkedBranches?`）→ resolver に runtime guard が必要で配線バグを隠すため
却下。

### D3: identity 確定（軽量 3 照合）と rebind（full verify + 実体化）を分離する

候補選定は checkpoint の state.json を軽量 parse して 3 フィールドで照合する:

- `state.jobId === marker の jobId`（full 一致）
- `state.issueNumber === 要求 issue 番号`
- `state.branch === 当該候補 branch 名`

3 つすべて一致した候補のみ「確定」。確定 branch に対して `runAttachVerification`
（既定の `attachResumePolicy`）→ `runtime.setupWorkspace(attachCheckpoint)` の rebind を実行し、
その検証失敗は既存エラー経路をそのまま伝播する。

**Rationale**: 「どの branch か」を先に identity で選び、そのうえで「再開可能か」を既存の
厳密検証（journal/projection integrity・awaiting-resume・reads()）に委ねる。照合は候補が
job branch でないリンク（手作りの linked branch 等）を read エラーとして黙ってスキップでき、
rebind は正しい branch の policy 違反を握り潰さず伝播できる。
**Alternatives**: 確定時に full `verifyCheckpoint` を回す → 選定と policy が混ざり、identity は
合うが未 quiescent な正しい branch が「候補外」として黙殺され fail-closed 文言が誤誘導する
ため却下。

### D4: marker → jobId の直後に「ローカル jobId 一致 state」short-circuit を置く

marker から full jobId を得た直後に `loadStateByJobId(repoRoot, jobId)` を試み、存在すれば
その slug へ直行して通常 resume に合流する（Development リンク列挙・identity 照合・rebind を
すべて skip）。存在しなければ D3 の経路へ進む。

**Rationale**: 冪等な再入。ローカルに既に materialize 済みなら remote 照合は不要。
**Alternatives**: 常に rebind → 二重 materialize・無駄な remote 呼び出しで却下。

### D5: issue 本文は読まない — Development リンクは issue 番号で GraphQL 解決する

`listIssueLinkedBranches` は `repository(owner,name){ issue(number){ linkedBranches …
closedByPullRequestsReferences … } }` を issue **番号**で問い合わせ、node ID を得るための
`getIssue`（body を返す）を呼ばない。marker は comments（`listIssueComments`）から得る。
resolve 経路全体で `getIssue` は一切呼ばれない。

**Rationale**: issue は編集可能。本文由来の再構成は start 後の編集で壊れる。
**Alternatives**: branch 命名規則の逆引き・本文再 parse → 編集耐性なしで却下。

### D6: Development リンクは optional index、正本は checkpoint（ADR-worthy）

Development リンク（linked branch）機能は Public Preview で GitHub 自身が変更可能性を明記
している。本設計はリンクを **発見の index** としてのみ使い、identity の正本には使わない
（正本は checkpoint）。リンクが消えても・仕様変更しても、checkpoint と `job attach --branch`
だけで再開は常に成立する。よって候補 0 件（リンク不在）は単なるエラーでなく、この位置付けを
体現する fail-closed であり、`job attach --branch <branch>` の手動経路を案内する。この設計判断は
ADR として記録する（配置は adr-gen に委ねる）。

**Rationale**: 外部 Preview API への依存を index に留め、正本経路を常に残す。
**Alternatives**: リンクを identity の根拠にする → API 変更で再開不能になり却下。

### D7: CLI orchestrator は cwd/repoRoot を注入で受け、新規 `process.cwd()` を持たない

新 `src/cli/resume-from-issue.ts` は cwd/repoRoot を引数で受け、内部で `process.cwd()` を
直読みしない。`process.cwd()` は `command-registry.ts` の resume handler で既存 CWD allowlist
エントリと同一の literal（`cwd: process.cwd(),`）としてのみ出現させる。detach handling は
from-issue.ts と同様「親が locate（副作用ゼロ）で slug を確定 → `detachSelf` → 子が本実行」。

**Rationale**: CWD ratchet に新エントリを足さない（acceptance 基準）。detach は locate が
read-only なので親で slug 確定してから切り離せる。
**Alternatives**: 新ファイルで `?? process.cwd()` → 新 allowlist エントリが必要で却下。

### D8: fail-closed を 3 種の typed error で区別する

- marker 不在 → `RESUME_FROM_ISSUE_NO_MARKER`（「再開可能な escalation が無い」/ 副作用ゼロ）
- Development リンク 0 件 → `RESUME_FROM_ISSUE_NO_LINK`（`job attach --branch` を案内）
- identity 不一致 / 複数 full 一致 / 全候補 read 不能 → `RESUME_FROM_ISSUE_UNCONFIRMED`
  （何が照合に失敗したか・候補 branch 名を明示）

**Rationale**: acceptance が 3 種の異なる停止を pin する。文言を分けると誤誘導しない。
`error-codes.test.ts` は特定コードの有無のみ検査するため新コード追加で壊れない。
**Alternatives**: 単一コード + message 差分 → テスト pin が弱く却下。

### D9: marker spoofing は identity 照合で無害化する（author gating を足さない）

comments は誰でも投稿でき、偽の marker で任意 jobId を注入しうる。だが確定は
`state.jobId===marker && state.issueNumber===要求 && state.branch===候補` の 3 照合で、
偽 jobId は（本物の）Development リンク上に一致 checkpoint を持たず fail-closed になる。
よって author gating は不要（足すと正規 bot コメント判定の複雑化・誤除外を招く）。

**Rationale**: 真正性は marker でなく checkpoint identity が担保する（本層の存在理由）。
**Alternatives**: authorAssociation で bot コメントに限定 → 過剰・誤除外リスクで却下。

## Risks / Trade-offs

- **[GraphQL フィールドの drift（Public Preview）]** → Development リンク列挙が空/エラーでも
  identity 正本は checkpoint 側。0 件は `job attach --branch` 誘導へ fail-closed（D6）。
  transport/GraphQL エラーは `createLinkedBranch` と同様 fail-closed で throw し、黙って
  0 候補に落とさない（誤誘導防止）。
- **[detach 経路で locate が二度走る]** → locate は read-only（fetch + state.json read + GraphQL）
  なので親・子で二度実行しても副作用ゼロ。from-issue の guard 二度実行と同性質で許容。
- **[marker spoofing]** → D9 で identity 照合により無害化。
- **[候補 branch を複数 fetch する I/O]** → Development リンクは `first:50` で有界、
  1 候補 1 fetch + 1 read と軽量。
- **[rebind が非 quiescent branch で失敗]** → 既存 `attachResumePolicy` エラーをそのまま伝播
  （request 明記）。resume-from-issue 固有の握り潰しはしない。

## Open Questions

- 3 種 fail-closed の exit code: locator/前提失敗として base-branch guard と揃え `ARG_ERROR`(2)
  を提案（`RESUME_FROM_ISSUE_*` を EXIT_CODE_MAP に登録）。GENERAL_ERROR(1) でも可。実装時に確定。
- `RESUME_FROM_ISSUE_UNCONFIRMED` 文言に候補 branch 名を列挙する範囲（全件 or 先頭 N 件）。
  可読性のため先頭数件 + 件数表示を提案。

## Migration Plan

新規 opt-in flag の追加のみ。既存の `job resume <slug>` / `job attach` / inbox 挙動は不変。
state schema・checkpoint format・marker format は変更しないため後方互換で、rollback は
flag 経路の revert で完結する（永続データ移行なし）。
