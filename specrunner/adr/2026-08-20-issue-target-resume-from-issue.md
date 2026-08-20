# issue-target resume 面: Development リンクを optional index にとどめ、正本は checkpoint にする

**Date**: 2026-08-20
**Status**: accepted
**Related**:
- `specrunner/adr/2026-08-20-issue-target-start-face.md`（先行: issue-target 層の新設・start 面）
- `specrunner/adr/2026-08-20-checkpoint-verification-policy-split.md`（rebind primitive の policy 分離）
- `specrunner/adr/2026-08-20-job-start-from-issue.md`（`--from-issue` CLI 契約の先行決定）

## Context

escalation で `awaiting-resume` になった job の checkpoint は origin の feature branch に publish されており、`job attach --branch <branch>` → `job resume <slug>` で別環境から再開できる。しかし呼び出し側が「どの branch を attach すべきか」を人手で特定する必要がある。issue 起点の運用（GitHub Actions workflow_dispatch、将来の `/resume` コメント発火）では、issue 番号だけで再開が完結してほしい。

この要求を満たすための設計上の核心問題は **「issue → branch の binding を何を根拠に確定するか」** である。

利用可能な index として GitHub の Development リンク機能がある。issue-target-start-face により feature branch を Development linked branch として登録しており、GraphQL `issue.linkedBranches` および `issue.closedByPullRequestsReferences`（PR head branch）から候補を列挙できる。

ただし **GitHub の linked branch（Development リンク）機能は Public Preview** であり、GitHub 自身が変更可能性を明記している。また escalation コメントに埋め込まれた marker（`<!-- specrunner:notification kind="escalation" jobId="..." -->`）は HTML コメントにすぎず、marker 単独では issue → job binding の真正性を保証しない（誰でも投稿可能）。

## Decisions

### D1: Development リンクは発見の index、identity の正本は checkpoint（ADR の核心）

Development リンクを **発見の index** としてのみ使い、identity の正本には使わない。binding の確定は checkpoint に記録された 3 フィールドの照合で行う:

- `state.jobId === escalation marker の jobId`（full 一致）
- `state.issueNumber === 要求された issue 番号`
- `state.branch === 当該候補 branch 名`

3 つすべて一致した候補のみ「確定」とする。

**リンク不在（候補 0 件）は単なるエラーではなく、この位置付けを体現する fail-closed** である。Development リンクが消えても・仕様変更しても、checkpoint と `job attach --branch <branch>` による手動経路だけで再開は常に成立する。よって候補 0 件の場合は手動経路（`job attach --branch <branch> → job resume`）を明示的に案内する。

**採用理由**: Public Preview API への依存を optional index に留め、正本経路（checkpoint + `job attach --branch`）を常に残すことで、API の変更・廃止に対してサービスが停止しないことを保証する。また marker spoofing（誰でも偽の marker を comment 投稿できる）も、Development リンク上に対応 checkpoint を持たない偽 jobId は identity 照合で必然的に fail-closed になるため、author gating を足さなくても真正性が確保される。

**却下案**: Development リンクを identity の根拠にする → API 変更で再開不能になる。marker の authorAssociation で bot に限定する → 過剰・誤除外リスクがあり、正当な手書きコメントも除外しうる。

### D2: 発見ロジックは `core/issue-target/resume.ts` に置き、狭い port を注入する

resolve 責務を `cli/` に直書きせず、`core/issue-target/resume.ts`（`start.ts` と対称の face）に公開純関数として置く:

- `resolveEscalationJobId(...)`: comments から escalation marker を走査し full jobId を得る（複数は createdAt 最新を採用）
- `resolveResumeBranchFromIssue(...)`: Development リンクから候補 branch を列挙し、identity 照合で 1 本に確定する

依存は狭い locator port（`listIssueComments` は既存 `GitHubClient` から `Pick` で再利用 + 新 `listIssueLinkedBranches` の 2 メソッド）として注入する。`GitHubClient` port の必須メソッドとしては追加しない。

**採用理由**: `GitHubClient` port の必須メソッドとして追加すると、`: GitHubClient` を全実装する約 30 個の既存 typed mock がすべて typecheck で落ち、「既存テスト無改変」に反する。狭い port を使えば `GitHubApiClient` はこの port を構造的に満たすだけでよく（`listIssueLinkedBranches` を public メソッドとして追加）、既存 mock は一切触らずに済む。また `cli/` に直書きすると module-boundary 制約（TC-001: `core/issue-target/` は `cli/` を import しない）に反し、port 注入による単体テストも困難になる。

**却下案**: `GitHubClient` 必須メソッド追加 → 既存 mock 全滅。optional メソッド（`listIssueLinkedBranches?`）→ resolver に runtime guard が必要で配線バグを隠す。

### D3: identity 確定（軽量 3 照合）と rebind（full verify + 実体化）を分離する

候補選定フェーズは checkpoint の state.json を軽量 parse して 3 フィールドで照合するのみ。確定後、既存の `runAttachVerification`（`attachResumePolicy`）→ `runtime.setupWorkspace(attachCheckpoint)` の rebind に委ね、その検証失敗は既存エラー経路をそのまま伝播する。

**採用理由**: 確定時に full `verifyCheckpoint` を回すと、選定と policy が混ざり、identity は合うが未 quiescent な正しい branch が「候補外」として黙殺され fail-closed 文言が誤誘導する。分離することで「どの branch か」の選択と「再開可能か」の検証が独立した責務になる。候補が job branch でないリンク（手作りの linked branch 等）は read エラーとして黙ってスキップでき、rebind は policy 違反を握り潰さず伝播できる。

### D4: marker jobId 確定直後にローカル state short-circuit を置く

marker から full jobId を得た直後に `loadStateByJobId(repoRoot, jobId)` を試み、存在すれば slug へ直行して通常 resume に合流する（Development リンク列挙・identity 照合・rebind をすべて skip）。存在しなければ D1 の経路へ進む。

**採用理由**: ローカルに既に materialize 済みなら remote 照合は不要（冪等な再入）。常に rebind すると二重 materialize・無駄な remote 呼び出しが発生する。

### D5: 3 種の fail-closed を typed error コードで区別する

| 状況 | エラーコード | 文言の核心 |
|------|-------------|------------|
| escalation marker 不在 | `RESUME_FROM_ISSUE_NO_MARKER` | 「再開可能な escalation が無い」、副作用ゼロ |
| Development リンク 0 件 | `RESUME_FROM_ISSUE_NO_LINK` | `job attach --branch <branch>` を案内 |
| identity 不一致 / 複数 full 一致 / 全候補 read 不能 | `RESUME_FROM_ISSUE_UNCONFIRMED` | 何が照合に失敗したか・候補 branch 名を明示 |

**採用理由**: acceptance 基準が 3 種の異なる停止を pin する。単一コード + message 差分ではテスト pin が弱く、文言の誤誘導も防げない。

## Alternatives Considered

### Alternative 1: Development リンクを identity の根拠にする

- **Pros**: checkpoint の軽量 parse が不要になり、候補選定が単純化する。
- **Cons**: Public Preview API の変更・廃止でサービスが停止する。marker spoofing に対して GitHub API が防壁になるという前提が生まれ、その前提が崩れた時の影響が大きい。
- **Why not**: identity の正本は checkpoint にあるという issue-target 層の核心原則に反するため。

### Alternative 2: 候補 0 件時に branch 命名規則から逆引きして fallback する

- **Pros**: Development リンクがない状況でも自動再開を試みられる。
- **Cons**: branch 命名規則の逆引きは issue-target-start-face ADR（D7）で明示的に禁止されている。命名規則が変わると無声に壊れる。issue 本文を読まない原則にも反する可能性がある。
- **Why not**: 先行 ADR の明示的禁止事項に反する。逆引き禁止の根拠（naming drift への脆弱性）はここでも同様に成立する。

### Alternative 3: `GitHubClient` port に必須メソッドを追加する

- **Pros**: 狭い port の追加ファイルが不要。配線がシンプル。
- **Cons**: `: GitHubClient` を全実装する約 30 個の既存 typed mock が typecheck で落ちる。「既存テスト無改変」の受け入れ基準に直接反する。
- **Why not**: 既存テスト維持コストが禁止レベルに達するため。

### Alternative 4: `listIssueLinkedBranches` を `GitHubClient` の optional メソッド（`?`）にする

- **Pros**: 既存 typed mock への `listIssueLinkedBranches` 実装追加が不要。Alternative 3 より影響範囲が小さい。
- **Cons**: resolver 側に `if (client.listIssueLinkedBranches)` の runtime guard が必要になる。guard を書き忘れると production で silently 0 候補に落ちる配線バグを隠す。
- **Why not**: optional にすることで配線ミスの検出が型検査から runtime に後退する。狭い locator port を使えば既存 mock を触らずに済み、かつ型安全が保たれるため選ぶ理由がない。

### Alternative 5: resolve ロジックを `cli/resume-from-issue.ts` に直書きする

- **Pros**: ファイルを増やさない。`core/issue-target/resume.ts` の新設が不要。
- **Cons**: `cli/` に置くと module-boundary 制約（TC-001: `core/issue-target/` は `cli/` を import しない）に反し、port 注入による単体テストが困難になる。`start.ts` との対称性も失われ、将来の archive face が同パターンで追加できなくなる。
- **Why not**: テスト不可能な実装は受け入れ基準（単体テストで pin）を満たせない。

### Alternative 6: 候補選定フェーズで full `verifyCheckpoint`（attach-resume policy 込み）を実行する

- **Pros**: 選定と rebind 可能性の検証を 1 パスで完了できる。
- **Cons**: identity は合うが未 quiescent（`status !== "awaiting-resume"`）な正しい branch が「候補外」として黙殺され、fail-closed 文言が「不一致」と誤誘導する。手作りの linked branch 等が policy エラーで止まったとき、それが「identity 不一致」なのか「policy 違反」なのかが区別できない。
- **Why not**: 選択と policy が混ざると fail-closed 文言が誤誘導し、デバッグを困難にする。分離することで各フェーズの責務が明確になる。

### Alternative 7: escalation marker の author を bot アカウントに限定する（authorAssociation gating）

- **Pros**: 悪意ある marker 投稿を author 層で防げる（ように見える）。
- **Cons**: `authorAssociation` で bot に限定すると、正規の人間オペレーターが手動で再投稿した marker も除外される。bot アカウントの判定は GitHub の role 設定に依存し、環境ごとに異なる。marker の author gating を通過しても spoofing 自体は防げない（bot アカウントを乗っ取れば同じ）。
- **Why not**: 真正性は marker でなく checkpoint identity が担保する（本層の存在理由）。author gating は正規ケースを誤除外するリスクを持ちながら spoofing 耐性を実質的に高めない。

## Consequences

### Positive

- Development リンク API の変更・廃止が起きても、checkpoint + `job attach --branch` の手動経路が常に成立する（サービス継続性の保証）。
- 真正性確認が checkpoint identity 照合に完全に依拠するため、marker spoofing・Development リンク改ざんは checkpoint の 3 フィールド全一致なしに確定できず無害化される。
- 既存の `GitHubClient` typed mock 約 30 個を一切変更せずに新機能を追加できる（Interface Segregation による既存テスト無改変）。
- issue-target 層の resume face が start face と対称の構造で成立し、将来の archive 面も同パターンで追加できる。

### Negative / Known Debt

- リンク不在時は常に手動（`job attach --branch`）が必要。Development リンク登録が best-effort のため、start から resume のタイムラグ中に API 側のリンクが消えることはあり得る。
- detach 経路で locate（read-only）が親・子で二度実行される。副作用ゼロなので許容するが、無駄な API 呼び出しが残る。
- `RESUME_FROM_ISSUE_UNCONFIRMED` の「候補 branch 名を列挙する範囲」（全件 or 先頭 N 件）は実装時に確定した（可読性優先で件数制限付き表示）。

## References

- Request: `specrunner/changes/issue-target-resume-from-issue/request.md`
- Design: `specrunner/changes/issue-target-resume-from-issue/design.md`（特に D6 が本 ADR の直接起源）
