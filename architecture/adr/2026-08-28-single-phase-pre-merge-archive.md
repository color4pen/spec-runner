# ADR-20260828: archive を merge 前に完結する単相操作にする（「merge 済み前提」の廃止）

## ステータス

accepted（実装は request `single-phase-archive`（#1083）で着地済み。本 ADR はその構造決定の正典化）

## 関係する既存 ADR（amend / supersede）

本 ADR は既存 ADR を全面 supersede せず、「merge 済みが archive の前提条件である」という前提部分のみを amend する。

- **ADR-20260612（merge-archive-separation）**: D1 の「merge されたことは archive の前提条件ではあるが、トリガーではない」のうち**前提条件の部分を廃止**する。archive が人間の明示的な finalize ジェスチャーであること（D1 後段）、--with-merge が合成コマンドであること（D2）、pipeline の終端が awaiting-archive であり merge にも archive にも自動で進まないこと（D3）は**そのまま有効**。
- **ADR-20260603（client-closed-archive）**: D2 の「merge 済みを archive の前提条件として扱う」を**廃止**。D4 の「archive 配置の commit は別経路で main に入る（folder archive は feature PR に同梱しない）」を**反転**する（下記 D4）。archive の client-closed 性（D1）・merge を CLI の責務外に置くこと（D2 前段）・status 名 `awaiting-archive`（D3）・opt-in merge 経路（D5）は**そのまま有効**であり、本 ADR はむしろ client-closed 性を判定面まで完全化する。

## コンテキスト

旧構造では archive は「merge 済み change の片づけ」であり、plain archive が GitHub PR state を照会して MERGED を確認してから terminal transition を確定する 2 相の運用だった。これは次の問題を生んだ。

- **client-closed の不徹底**: 片づけの必須経路に GitHub API 照会（外部状態の読み取り）が残り、ADR-20260603 D1 の「外部状態の待ち・polling を含まず決定的に完結する」と実態が乖離していた。
- **leftover job**: merge → branch 削除後に archive しようとすると worktree / local branch が失われており、片づけが degraded 状態で残る 2 相特有の事故が起きた。
- **main への別経路 commit**: archive 配置の commit が merge 後の main に別経路で積まれる構造は、「main への書き込みは PR 経由」という運用と摩擦していた。

## 決定

### D1: archive は merge 前に完結する単相（single-phase）操作とする

`job archive <slug>` は 1 回の実行で record（change folder の archive 配置 → archive commit → **feature branch へ push**）→ `awaiting-archive → archived` の確定 → worktree 撤去まで行う。PR は OPEN のままでよい。

### D2: terminal transition の唯一の条件は archive record push の成功とする

`awaiting-archive → archived` は record push が成功した時点で確定し、PR state（OPEN / MERGED / CLOSED）に依存しない。plain archive は `GitHubClient` 型を import しない module とし、PR state 照会の分岐を**依存の不在**として構造的に排除する（分岐を「使わない」約束ではなく、型が無ければ復活できない形にする）。

### D3: `archived` の意味を「SpecRunner 側の片づけ完了」に固定する

`archived` は「変更が main に入った」を含意しない。merge されたかどうかは GitHub 側の状態であり、job status に二重持ちしない（ADR-20260603 D3 と同じ原則の帰結）。

### D4: archive commit は feature PR に同梱され、merge によって main に入る

remote feature branch は archive で削除しない（OPEN な PR のために保存する）。archive 配置 commit は同一 feature PR の一部として merge で main に着地し、merge 後の main に archive 用の別 commit を積む経路は持たない。

### D5: opt-in merge 経路（--with-merge）は record → CI green 待ち → merge → cleanup の順で編成する

「merge してから archive」ではなく「record してから merge」。この経路のみ GitHubClient(port) に依存する点は ADR-20260603 D5 のまま。

## 帰結

- 運用順序が「**archive → merge**」になる。archive record が PR の head に載ってから merge するため、merge は archive 済みレイアウトごと main に着地する。
- plain archive はネットワーク照会ゼロで決定的に完走し、client-closed が判定面まで貫徹される。
- **reopen 窓の変化**: `job reopen` は awaiting-archive のみを対象とするため、archive を merge 前に実行した後は reopen できない（archived は terminal）。archive 後の手戻りは新しい issue / job として扱う。archive の起動が人間の明示ジェスチャーであること（ADR-20260612 D1）が、この不可逆点の選択を人間に残す。
- 旧 2 相の leftover（merge + branch 削除後に archive されず残った job）には degraded path（best-effort の archived 遷移 + cleanup）で片づけのみ行う。
- 却下した代替（merge 済み確認を warning として残す）: client 依存が必須経路に残り D2 の構造保証を失う。無条件の advisory 表示で十分に代替できる。
