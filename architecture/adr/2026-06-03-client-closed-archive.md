# ADR-20260603: finish を分解し archive を client-closed に（merge を CLI 外へ・1-PR モデル退役）

## ステータス

accepted（実装は request `archive-command` で追従。code 未追従の間の divergence は `divergence-status.md`）

## コンテキスト

旧モデル（1-PR モデル）では `FinishOrchestrator` が 1 コマンドで squash merge と change folder archive を一体で行い、`awaiting-merge → archived` を確定していた。merge が外部かつ非同期な GitHub gate（branch protection / required check）に委ねられると、決定的なローカルの片づけ（folder 配置・worktree 撤去・status 確定）と merge が同一 component に密結合し、merge の不確定性（green/red・タイミング・gate 充足）が片づけ責務に波及する。

## 決定

### D1: archive を client-closed component に切り出す

片づけを `ArchiveOrchestrator`（domain / `core/archive/`）に分離する。責務は change folder の archive 配置・worktree 撤去・`awaiting-archive → archived` の確定のみ。**GitHubClient(port) に依存しない**（merge も PR status 問い合わせも持たない）＝ client-closed。外部状態の待ち・polling を含まず決定的に完結する。

### D2: merge を CLI の片づけ責務外へ出す

merge は GitHub / 人が行う外部イベントとし、job status の遷移として持たない。片づけ既定経路から merge を除く（merge 済みを archive の前提条件として扱う）。

### D3: status `awaiting-merge` を `awaiting-archive` に rename

状態名を「CLI の残務＝archive 待ち」を表す `awaiting-archive` に置換する。GitHub 側 state（merge 済みか）を job status に二重持ちしない。VALID_TRANSITIONS の遷移形は不変（rename のみ）。legacy（`success` / `awaiting-merge`）は load 時 remap。

### D4: 1-PR モデルを退役

完走の最終遷移は archive が client-closed に確定する。merge は前提条件であって遷移ではない。change は feature PR で着地し、archive 配置の commit は別経路で main に入る（folder archive は feature PR に同梱しない）。

### D5（opt-in）: merge 便利経路のみ GitHubClient に依存する別 path

利便のため green 充足を前提に「merge → archive」を編成する opt-in 経路を許容する。この path のみ GitHubClient(port) に依存し、archive 本体の client-closed 性はこの path を含まない。

## 構造的含意

- 新 component `core/archive`（domain 内）。新 layer も DSM の新 edge も生まない（既存 `core/finish` と同層）。
- **archive → GitHubClient の依存を断つ**（client-closed）。GitHubClient(port) を使うのは pipeline の pr-create と D5 の opt-in merge 経路のみ。
- B-9（status 変更は `transitionJob` 経由）不変。status enum / VALID_TRANSITIONS の名称変更は `domain-model.md` と同期。§3 closure / B-1〜B-10 は不変。
- 永続 job state（`.specrunner/jobs/*.json`）の旧 status migration が要る（remap）。in-repo skill（`rebase-finish` / `request-merge`）が新コマンド構成に追従。

## 検討した代替案

- archive を `FinishOrchestrator` 内の分岐に留める — 却下（merge の不確定性が片づけに残り、責務が混ざる）。
- 片づけを read コマンドの lazy reconcile で行う — 却下（read に隠れた side-effect / network が乗り CLI の行儀に反する。片づけは明示コマンドで叩かせる）。
- status を `pr-open` 等の GitHub 状態名に置換 — 却下（GitHub 側 state を job status に二重持ち。CLI の残務＝archive を名に取る方が一貫）。

## 結果

- **Positive**: 片づけが決定的・client-closed になり merge の不確定性から分離。merge を GitHub gate に完全委譲し、CLI から merge 責務が消える。
- **Negative**: status migration（永続 job state）が要る。in-repo skill の追従。folder archive を別経路で main に入れる手当てが要る。

## References

- request: `archive-command`
- 関連 ruling: `finish-respect-branch-protection`（merge gate 尊重の前段）
