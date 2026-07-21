# ADR-20260722: awaiting-archive job の正規 reopen — 専用コマンド・operator-scoped FSM edge・承認失効原則

## ステータス

採択

## コンテキスト

人間レビューで merge 前の PR に修正が発生することは例外ではなく正規ユースケースである。しかし従来の FSM では `awaiting-archive` からの合法遷移を `archived` / `canceled` のみに限定しており、post-review 修正を正規 pipeline で再検証する経路が存在しなかった。

| 既存の手段 | post-review fix-forward に使えない理由 |
|-----------|---------------------------------------|
| `job resume --from <step>` | `canTransition("awaiting-archive", "running")` が `false` (`src/state/lifecycle.ts:39`) のため resume が前提条件チェックで中断する |
| `job cancel` | `cancelSingleJob` が remote branch を削除し PR とそのレビュー文脈（コメント・履歴）を破壊する。fix-forward に使えない |

`awaiting-archive` は「証跡セット（spec-review / test-case-gen / verification / code-review / conformance）が、パイプラインが完了した時点の revision に対して完結している」状態を意味する。その状態からの再開は、pipeline が自律的に再入できるものではなく、operator の明示的な判断と記録を伴うべき遷移である。

過去の運用では break-glass 復旧（`state.json` の status を手動変更 + PR コメントへの事前記録）を要したケースが存在した。

本変更が依拠する revision 束縛機構は既に導入済みである：

- **reviewer 承認**（`src/core/pipeline/reviewer-status.ts`、`selectPendingMembers`）: approved member は `approvedAtCommit === baselineCommit` の場合のみ skip。不一致・null は pending（fail-closed）。
- **conformance 承認**（`src/core/pipeline/reverification.ts`、`conformanceApprovedForVerifiedRevision`）: 最新 conformance run の `commitOid` と最新 verification run の `commitOid` が一致する場合のみ短絡。不一致・欠落は false（fail-closed）。

どちらも `commitOid` 駆動であり、branch HEAD が進めば stale 承認は自動的に無効化される。

## 決定

### D1: 専用コマンド `job reopen <slug> --from <step> --reason <text>` を追加する

`ReopenCommand`（`src/core/command/reopen.ts`）を `CommandRunner` サブクラスとして実装する。`--from` と `--reason` はともに必須。CLI エントリ（`src/cli/reopen.ts`）は `src/cli/resume.ts` を鏡写しにした構造とする。

`--from` の解決には既存の resume ヘルパー群（`buildAllowedStepSet`、`resolveResumeStep`、`mapMemberToCoordinator`）を再利用する。これにより custom reviewer の動的 step 名解決も引き続き機能する。

**Rationale**: `awaiting-archive` は証跡が完結した状態であり、そこからの再開は operator の意思決定として記録されなければならない。`--reason` 必須と journal 記録により運用監査が可能になる。resume に status-specific 分岐を追加するオーバーロードより、独立した操作として実装することで前提条件ゲートを明確に所有できる。

**却下した代替案**:
- *resume の guard 緩和（awaiting-archive → running を常時許可）*: 証跡完結状態を operator 記録なしに再入可能にするため却下（architect 評価済み）。
- *`job cancel` + 再 run*: remote branch と PR レビュー文脈が破壊されるため却下。

### D2: `REOPEN_TRANSITIONS` を `VALID_TRANSITIONS` とは独立したテーブルとして定義し、opt-in 引数でのみ参照する

`VALID_TRANSITIONS` を変更せず、`REOPEN_TRANSITIONS: ReadonlyMap<JobStatus, ReadonlySet<JobStatus>>` として `{ "awaiting-archive" → {"running"} }` を独立宣言する。`transitionJob` の第 4 引数（`opts?: { allowReopen?: boolean }`）を追加し、`opts.allowReopen === true` のときのみ `REOPEN_TRANSITIONS` を参照する。デフォルト（省略/false）は既存の動作を byte-for-byte 維持する。

`canTransition` は変更しない。`ResumeCommand.prepare()` が呼ぶ `canTransition("awaiting-archive", "running")` は引き続き `false` を返し、resume は reopen 後も awaiting-archive → running を拒否する。

`ReopenCommand` のみが `{ allowReopen: true }` を渡す唯一の呼び出し元となる。

**Rationale**: 「reopen 操作経由でのみ許可する」という要件を実現するには、edge を一般 guard から隔離する必要がある。opt-in テーブル分離により、新 edge の影響範囲を `ReopenCommand` の単一呼び出し元に限定でき、既存の resume / `assertJobFinishable` / exit-guard など多数の `canTransition` 消費者に変更を波及させない。

**却下した代替案**:
- *`VALID_TRANSITIONS["awaiting-archive"]` に `running` を追加 + resume に status 分岐*: `canTransition` 消費者全員に新 edge が見え、resume 側に fragile な status 文字列ガードが必要になるため却下。
- *`transitionJobForReopen` として完全分離した関数*: history-append / patch-merge / status-set のロジックを重複させることになるため却下。

### D3: 前提条件ゲートを fail-closed で設計する（status + PR state の二段確認）

`prepare()` は以下のいずれかを満たす場合に non-zero exit でリジェクトする：

1. status が `awaiting-archive` でない（`archived` / `canceled` は明示メッセージ。その他 status も同様にリジェクト）。
2. `state.pullRequest` が存在しない（PR のない job に対して fix-forward 不可）。
3. PR state が OPEN でない。`GitHubClient.getPullRequest` でライブ取得し、MERGED は要件上の明示拒否、CLOSED（未 merge）も pr-create の OPEN 再利用契約に整合できないため拒否。
4. GitHub token がない、または API エラーで PR state を確認できない → fail-closed でリジェクト（`specrunner login` を案内）。

また、resume と同様に specrunner worktree 内からの呼び出しをリジェクトする。

**Rationale**: 要件上「merged PR を持つ job への reopen は拒否する」とされている。merged であるかを確認するにはライブ API 取得が必要であり、API が応答できない場合に proceeded すると merged PR 上での再開リスクが生じる。fail-closed とすることでそのリスクを排除する。`state.pullRequest` のキャッシュ値は PR が out-of-band で merge された事実を反映しないため、ライブ取得は必須。

**却下した代替案**:
- *`state.pullRequest` のみで merged を判断*: awaiting-archive 後に out-of-band で merge された PR を検出できないため却下。

### D4: reopen は証跡を一切削除・上書きしない（re-execution は新 iteration として追加する）

transition patch は `{ error: null, resumePoint: null, mainCheckoutDrift: null, pid: process.pid }` のみ（resume の patch と同等）。`steps` / `reviewerStatuses` / `decisions` / `biteEvidence` はパッチ対象外。

iteration 別ファイル（`*-result-NNN.md` / `review-feedback-NNN.md`）と append-only `events.jsonl` により、再実行は自然に iteration N+1 として追加される。新たな保存機構は不要。

**Rationale**: 証跡は不変に保つ原則（`achieved-assurance.ts` のパターンと一致）。既存の iteration path と append-only journal が保存保証を既に提供しており、「上書きしない」ことで要件を満たす。

### D5: 承認の失効は record 書き換えでなく既存の commitOid 束縛を通じて実現する

reopen は `reviewerStatuses` / conformance record を書き換えない。承認の無効化は再実行によって自動成立する：

- branch HEAD が進む fix-forward では、`selectPendingMembers` が `approvedAtCommit !== baselineCommit` を検出して stale member を pending へ戻す。
- conformance 承認は旧 `commitOid` に束縛されており、新 verification の `commitOid` と不一致になるため `conformanceApprovedForVerifiedRevision` が false を返す。

実装者は routing の実パスを歩いて両関数が stale 承認を除外することを確認し、テストでピン留めする（TC-011 / TC-012）。commitOid 照合が及ばない経路が見つかった場合のみ明示的失効を追加する。

**Rationale**: `2026-07-21-approval-revision-binding.md` が確立した「承認の有効性判定は commitOid 等値比較で行い、record は不変に保つ」原則と完全に整合する。record rewrite は証跡不変の原則に反し、routing-time guard と record 側の二重管理を生む（ADR `2026-07-21` A3 代替案の却下理由と同じ）。

### D6: reopen 操作を `OperatorEventRecord` として append-only journal に記録する

`EventRecord` union に `{ type: "operator-event", action: "reopen", reason, fromStep, ts }` を追加する（`src/store/event-journal.ts`）。journal seam（`JobJournal.appendOperatorEvent` → `JobStateStore.appendOperatorEvent`）を追加し、`fold()` で `operatorEvents: OperatorEventRecord[]` として収集する。

operator event は status transition より**前**に永続化する。これにより後続のパイプライン実行が失敗・中断されても reopen の audit record は残る。

手書き `FoldResult` リテラルが存在する箇所（`job-journal.ts` の ENOENT ブランチ等）には `operatorEvents: []` を追加する（後方互換フィールドとして enumeration 必須）。

**Rationale**: 「証跡完結状態を再開する」という operator の判断は audit record として残す必要がある。lifecycle transition の history エントリ（`awaiting-archive → running: <reason>`）は状態遷移記録であり、operator audit record としての一流性を持たない。専用 record type により `fold()` で直接クエリ可能になる。

### D7: remote branch と PR は保持する（cancel 系 cleanup を発動しない）

reopen は cancel / cleanup コードを一切呼び出さない。terminal な再実行が pr-create に到達した時点で、既存 OPEN PR を `existing-open` として再利用する（D3 gate が reopen 時点で PR が OPEN であることを保証する）。

**Rationale**: fix-forward ユースケースではレビュー文脈（コメント・履歴）の保持が本質的な要件。cancel 系 cleanup を発動しないことで既存 PR がそのまま維持される。

### D8: runtime / minimumAssurance から独立する

reopen は slug-canonical store から state を解決し、GitHub API と journal seam を通じて操作する。これは local / managed 双方で同一のコードパスである。`minimumAssurance` floor は `job archive --with-merge` 時にのみ評価され、reopen は参照しない。

## 検討した代替案

### Alternative 1: resume の guard 緩和（awaiting-archive → running を常時許可）

`job resume` の前提条件チェックで `awaiting-archive → running` を許可するよう `canTransition` を緩和する案。専用コマンドは不要。

- **Pros**: 新コマンドが不要。`resume.ts` に最小限の変更で済む。`--from` の既存解決ロジックをそのまま使える。
- **Cons**: `awaiting-archive` は pipeline が証跡完結を宣言した状態であり、無条件の再入を許すと operator 記録なしに証跡完結状態を壊せる。`--reason` 必須や audit trail を resume に後付けすることは設計上難しく、resume の「中断からの再開」という意味と衝突する。
- **Why not**: architect 評価済みで明示却下。「reopen は operator の明示判断・記録を伴うべき遷移」という設計方針と根本的に相容れない。

### Alternative 2: `job cancel` + 再 run

既存の `job cancel` で状態を片付けてから `specrunner run` で再実行する、コマンド組み合わせ案。

- **Pros**: 既存コマンドの組み合わせで実現でき、新機能実装が不要。
- **Cons**: `cancelSingleJob` が remote branch を削除する（`src/core/cancel/runner.ts`）。PR とそのレビュー文脈（コメント・レビュアーのスレッド・承認履歴）が失われる。fix-forward の本質である「PR 保持」と相容れない。
- **Why not**: architect 評価済みで明示却下。post-review 修正ユースケースでは GitHub PR レビュー文脈の保持が必須であり、branch 削除は根本的に相容れない。

### Alternative 3: `VALID_TRANSITIONS["awaiting-archive"]` に `running` を追加し、resume 側で awaiting-archive を特別扱い

`VALID_TRANSITIONS` に `awaiting-archive → running` を追加し、`ResumeCommand.prepare()` で status === "awaiting-archive" の場合のみ throw する分岐を追加する案。追加テーブルは不要。

- **Pros**: `REOPEN_TRANSITIONS` という追加テーブルが不要。transition ロジックを単一テーブルに統合できる。
- **Cons**: `canTransition("awaiting-archive", "running")` が `true` になり、resume / `assertJobFinishable` / exit-guard など多数の `canTransition` 消費者に新 edge が見える。resume 側に `if (status === "awaiting-archive") throw` という fragile な status 文字列ガードが必要になる。消費者が増えるたびに同様の分岐が必要になる。
- **Why not**: 変更の影響範囲が `canTransition` の全消費者に広がる。status 文字列ガードは脆弱であり、将来の消費者が guard を追加し忘れると新 edge が意図せず利用される。

### Alternative 4: `transitionJobForReopen` として完全分離した関数を作る

`transitionJob` を変更せず、`transitionJobForReopen` という別関数を新設して `ReopenCommand` 専用の遷移ロジックを実装する案。

- **Pros**: `transitionJob` と完全に独立しており、既存コードへの侵入がゼロ。`allowReopen` 引数を追加しないため `transitionJob` のシグネチャが汚染されない。
- **Cons**: history エントリ追記・status patch merge・`state.json` 書き込みのロジックを `transitionJob` から重複させることになる。将来 `transitionJob` の共通ロジックが変更されたとき、`transitionJobForReopen` に同じ変更が必要になる。
- **Why not**: opt-in 引数（D2 採用案）は既存呼び出し元への影響をゼロに保ちつつロジックを共有できる。共通ロジックの重複は `transitionJob` の持つ invariant 保証を弱めるため却下。

### Alternative 5: GitHub API を呼ばず `state.pullRequest` のキャッシュ値で merged を判断する

`GitHubClient.getPullRequest` を呼ばず、`state.pullRequest` に記録済みの PR 情報だけで「PR が未 merge か」を判断する案。token なし環境でも動作する。

- **Pros**: GitHub token / ネットワーク不要。完全にオフラインで前提条件チェックが完結する。token なし環境でも reopen コマンドが実行できる。
- **Cons**: `state.pullRequest` は pipeline 完了時点の snapshot に過ぎない。`awaiting-archive` 以降に out-of-band（CLI / GitHub UI 等）で merge された PR を検出できない。merged PR 上で reopen が成立し、re-run が merge 済みブランチに対して実行されてしまう。
- **Why not**: 要件上「merged PR への reopen は拒否する」とされており、その検出にはライブ取得が必須。token が取得できない場合は fail-closed（リジェクト）が最も安全であり、エラーメッセージで `specrunner login` を案内する。

### Alternative 6: reopen 時に stale 承認 record を proactive にリセットする（approved → pending へ書き換え）

reopen 実行時に `state.reviewerStatuses` や conformance record の `verdict` を上書き / 削除し、指定 step 以降の承認をリセットしてから pipeline を再開する案。

- **Pros**: 承認失効が明示的・確実。routing 判定関数の commitOid 照合に依存せず、リセット後の state を見るだけで承認なしと分かる。
- **Cons**: `reviewerStatuses` / conformance record を上書き・削除することは証跡不変の原則に反する。`2026-07-21-approval-revision-binding.md` が採択した「record は不変・失効は判定側（routing-time guard）」の原則と矛盾する。承認の audit trail（いつ・誰が・どの revision を承認したか）が消える。
- **Why not**: commitOid 束縛（D5）が既に fail-closed で同等の保証を提供しており、record rewrite は不要かつ有害。`achieved-assurance.ts` と同じパターン（missing-commitOid → absent 扱い、record は削除しない）を踏襲する。

## 帰結

- **新しいライフサイクル操作**: `job reopen` が `job resume` / `job cancel` / `job archive` と並ぶ一流のライフサイクル操作として追加される。`awaiting-archive → running` 遷移は reopen 経由でのみ到達可能。
- **FSM 不変条件の追加（B-17）**: `transitionJob(..., { allowReopen: true })` の唯一の合法呼び出し元は `src/core/command/reopen.ts` に限定される。`canTransition("awaiting-archive", "running")` は引き続き `false` を返す。`core-invariants.test.ts` で機械化済み。
- **operator audit trail**: reopen 操作は `events.jsonl` に `operator-event` として永続化され、`fold()` でクエリ可能。理由・from-step・タイムスタンプを含む。
- **証跡不変原則の強化**: reopen は既存証跡を削除・上書きしない。承認の無効化も record 書き換えでなく routing-time 判定（commitOid 照合）で行う原則を確認・固定した。
- **既知の制約**: CLOSED（未 merge）PR を持つ job は reopen できない。CLOSED PR を reopen した上で fix-forward するユースケースは別 change のスコープ。custom reviewer の `--from <member名>` は resume と同様に CLI パーサーレベルで遮断される（pre-existing 挙動の踏襲）。

## 影響を受けるモジュール

- `src/state/lifecycle.ts` — `REOPEN_TRANSITIONS` 追加、`transitionJob` 第 4 引数追加
- `src/core/command/reopen.ts` — `ReopenCommand` 新規実装
- `src/cli/reopen.ts` — CLI エントリ新規実装
- `src/cli/command-registry.ts` — `reopen` subcommand 登録
- `src/store/event-journal.ts` — `OperatorEventRecord` 型・union 追加、`fold()` 拡張
- `src/store/job-journal.ts` — `appendOperatorEvent` seam 追加
- `src/store/job-state-store.ts` — `appendOperatorEvent` 委譲追加
- `src/core/pipeline/reverification.ts` — `conformanceApprovedForVerifiedRevision` に reopen 後経路のカバレッジ追加
- `architecture/model.md` / `architecture/conformance.md` — B-17 不変条件の追記
- `tests/unit/architecture/core-invariants.test.ts` — B-17 機械化テスト追加

## 参考

- Change: `specrunner/changes/job-reopen-from-awaiting-archive/`
- 関連 ADR: `2026-07-21-approval-revision-binding.md`（commitOid 束縛の基盤）
- 関連 ADR: `2026-05-21-job-cancel-audit-trail-over-delete.md`（cancel が branch を削除する設計）
- 関連 ADR: `2026-06-07-resume-point-as-canonical-source.md`（resume step 解決の先行決定）
