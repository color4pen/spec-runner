# job resume --from-issue: Development リンクと checkpoint identity による issue 起点再開

## Meta

- **type**: new-feature
- **slug**: issue-target-resume-from-issue
- **base-branch**: main
- **adr**: true

## 背景

escalation で awaiting-resume になった job の checkpoint は origin の feature branch に publish されており、`job attach --branch` → `job resume` で別環境から再開できる。しかし呼び出し側が「どの branch を attach すべきか」を人手で特定する必要がある。issue 起点の運用（GitHub Actions の workflow_dispatch、将来の `/resume` コメント発火）では、issue 番号だけで再開が完結してほしい。

issue-target 層（先行 request: issue-target-start-face）の原則に従う:

> **issue は request source（start 時）または job locator（既存 job 操作時）である。実行開始後の job identity / state の正本は remote checkpoint にある。**

resume は「既にあるものへ戻る」操作である。**issue 本文は一切読まない**（issue は編集可能であり、本文由来の再構成は start 後の編集で壊れる）。branch 命名規則の逆引きもしない。発見は GitHub 自身が持つ **Development リンク** の index で行い、確定は **checkpoint identity の照合** で行う。issue → job binding の真正性をこの照合で確定することが issue-target 層の存在理由である。

## 現状コードの前提

- 先行 request `issue-target-start-face` により: `core/issue-target/` 層が存在し、issue-linked start は feature branch を Development linked branch として登録している（登録は best-effort であり、リンク不在の job も存在しうる）。
- 先行 request `checkpoint-verification-policy-split` により: rebind primitive は「generic integrity 検証 → use-case verification policy → 実体化」の構成で、attach-resume policy（`status === "awaiting-resume"` + resumePoint 解決 + resume step reads() 入力検査）が交換可能な単位として存在する。
- `src/core/notify/issue-notifier.ts:78-82` — escalation 通知コメントは機械可読 marker `<!-- specrunner:notification kind="escalation" jobId="<jobId>" version="1" -->` を含み、full jobId を持つ。marker は HTML コメントにすぎず、それ単独では issue → job binding の真正性を保証しない。
- GitHub の Development リンク参照（2026-08-20 に GraphQL introspection で確認）: `issue.linkedBranches` と `issue.closedByPullRequestsReferences`（closing keyword でリンクされた PR）。GitHub 仕様上、linked branch から PR が作られると Development 表示は branch から PR に置き換わるため、**両方を解決する必要がある**。PR 側のリンクは `src/core/pr-create/body-template.ts:75` の `Fixes #<issueNumber>` により現行実装で既に成立している。
- **外部 API の変更可能性**: GitHub の linked branch（Development リンク）機能は Public Preview であり、GitHub 自身が変更可能性を明記している。本 request は Development リンクを **optional な index** としてのみ扱い、identity の正本には使わない（正本は checkpoint）。
- `src/state/schema/types.ts:412` — `JobState.branch: string | null`。checkpoint 内の state は自分の branch 名と `issueNumber`（同 :458）を持つ。
- `src/adapter/github/github-client.ts` — 現行 client は REST（fetch ベース）のみ。GraphQL 参照は同じ fetch で `/graphql` へ POST する形で追加可能。

## 要求

### 1. locator 解決の連鎖

`job resume --from-issue <n>` は以下の連鎖で job を特定する。**issue 本文は読まない**:

1. issue のコメントから escalation marker を走査し、**full jobId** を得る。複数 marker は作成時刻が最新のものを採用する。marker 不在 → 「再開可能な escalation が無い」ことを明示するエラーで副作用ゼロ停止
2. issue の Development リンクから候補 branch を列挙する: `linkedBranches` の branch、および `closedByPullRequestsReferences` の PR head branch
3. 候補 branch の checkpoint を読み、**checkpoint identity で確定する**:
   - `state.jobId === marker の jobId`（full 一致）
   - `state.issueNumber === 要求された issue 番号`
   - `state.branch === 当該 branch 名`
4. 候補 0 件（リンク不在）は fail-closed で停止し、`job attach --branch <branch>` による手動経路を案内する。identity 不一致・複数候補の同時 full 一致も fail-closed（何が照合に失敗したかを明示するエラー文言）

リンク不在時の fallback は単なるエラー処理ではなく、**Public Preview である GitHub Development API への依存を optional index に留める**ための設計判断である（Development リンクが消えても・仕様変更しても、checkpoint と `job attach --branch` だけで再開は常に成立する）。この位置付けを ADR に明記すること。

### 2. rebind と resume の合成

- 確定した branch に対し、attach-resume policy での rebind（generic 検証 → policy 検証 → 実体化）を実行し、通常の resume に合流する
- ローカルに対象 jobId の job state が既にあれば rebind を skip して通常 resume に合流する（冪等な再入）
- rebind の検証失敗は既存のエラー経路をそのまま伝播する

### 3. flag の排他と直交

- positional `<slug>` と `--from-issue` の同時指定は usage エラー
- `--prompt` / `--detach` とは併用可能（既存の resume 契約がそのまま成立する）
- その他の resume flag（`--from` / `--apply-canon` / `--adopt-commits` / `--force`）の挙動は変更しない

### 4. ヘルプ・guide の追随

`job resume` の usage テキストと CLI 組み込み guide の該当 topic に `--from-issue` の契約（locator 解決規則・rebind 内包・排他・リンク不在時の `job attach --branch` 誘導）を反映する。

## 受け入れ基準

- [ ] ローカル state 無しの環境相当で: marker → full jobId → Development リンクから候補列挙 → checkpoint identity 3 照合 → rebind → resume 到達、の連鎖がテストで pin される（linked branch 形と linked PR head 形の両方）
- [ ] `state.issueNumber` 不一致・`state.jobId` 不一致の checkpoint がそれぞれ fail-closed で拒否される（テストで pin する）
- [ ] Development リンク 0 件は `job attach --branch` を案内する明示的エラーで停止し、escalation marker 不在は副作用ゼロの明示的エラーで停止する（テストで pin する）
- [ ] 複数 marker 時に作成時刻が最新のものが選択される（テストで pin する）
- [ ] resume --from-issue の経路で issue 本文の read が行われないことがテストで pin される
- [ ] ローカルに同 jobId の state がある場合、rebind が skip されて通常 resume に合流する（テストで pin する）
- [ ] positional slug との排他 usage エラー（テストで pin する）
- [ ] 既存の attach / resume / inbox のテストが無改変で green
- [ ] `tests/unit/architecture/` が green（新 allowlist エントリを追加しない）
- [ ] `bun run typecheck` / `bun run test` green

## スコープ外

- `job archive --from-issue`（awaiting-archive 用 verification policy の実装を含む）
- `issue_comment`（`/resume` コメント）による自動トリガー workflow
- start / resume を状態判定で統合する `job run --from-issue` 型 dispatcher
- escalation marker の format 変更
- Development リンクの登録側（先行 request: issue-target-start-face）とリンク掃除（`deleteLinkedBranch`）
- inbox の発見ロジック（label 検索・/resume gating・冪等性）の変更
- `.github/workflows/` の変更
- 実行元 checkout branch のガード（rebind は検証済み checkpoint OID から実体化するため、checkout branch は実装基点に影響しない）
