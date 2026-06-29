# ADR-20260629: orphan worktree（state 無し）の検出と掃除の設計

## ステータス

accepted

## コンテキスト

local runtime で job を起動する際、`WorktreeManager.create`（`src/core/worktree/manager.ts`）が git worktree とブランチを生成した後、`bootstrapState` 永続と liveness sidecar 書込が続く（`src/core/runtime/local.ts`）。この生成〜永続の窓でプロセスが死ぬと、`.git/specrunner-worktrees/<slug>-<jobId8>/` の worktree とブランチが残るが対応する job state / sidecar が存在しない。この「state 無し orphan worktree」は既存ツールでは掃除できない。

- `job cancel <jobId>` は `loadStateByJobId` で state を解決してから masking するため、state が無い orphan を対象にできない。
- `specrunner doctor` の `orphan-sidecars` check は `.specrunner/local/<slug>/` 配下の sidecar を診断するもので、worktree は対象外。state 無し orphan はそもそも sidecar を持たない。

結果として利用者は手動で `git worktree remove` / `git branch -D` する必要があり、実運用で複数回発生していた。

また同様の問題として、`archived` / `canceled` 状態（terminal）の job に紐づく worktree が cleanup 未完了で残るケースも `job cancel`（rejects archived）/ `job archive`（再 archive 不可）では掃除できず、同じ手動操作が必要だった。

## 決定

### D1: orphan の定義 — non-terminal job state に対応しない worktree

`.git/specrunner-worktrees/` 配下の worktree ディレクトリを **orphan** と判定する基準を次のように定義する。

`JobStateStore.list(repoRoot, { includeArchived: true })` が返す全 job state のうち、non-terminal ステータス（`running` / `awaiting-resume` / `awaiting-archive` / `failed` / `terminated`）を持つものについて `${getJobSlug(state)}-${state.jobId.slice(0, 8)}` を計算し「保護済みセット」を構築する。worktree ディレクトリの basename がこのセットに含まれない場合を orphan とする。

この定義は次の 2 ケースを単一ルールで捕捉する。

- **state 無し orphan（主たる症状）**: state がどこにも存在しないため保護済みセットに現れない。
- **terminal 残留（cleanup 未完了）**: `archived` / `canceled` job は terminal であり保護済みセットに含まれない。`job cancel`（rejects archived）/ `job archive`（再 archive 不可）がこれを扱えないため `job prune` が正しい所有者となる。

`JobStateStore.list` を再利用することで、orphan 判定が store の知るすべての state 保存場所を自動的に追跡する。ディレクトリ名から slug + jobId を逆パース（slug はハイフンを含み分割が曖昧）する案は却下した。

### D2: 列挙は `git worktree list --porcelain` で行う

candidate worktree のセットは `git worktree list --porcelain` の出力から `.git/specrunner-worktrees/` 配下のエントリを抽出して得る。これにより絶対パスとブランチ名を一度に取得でき、stray な非 worktree ディレクトリを誤検出しない。

crash シナリオでは `git worktree add` が完了した後にプロセスが死ぬため、worktree は git の管理下に正しく登録されており `git worktree list` が信頼できる列挙源となる。

`readdir` + 個別ブランチ照会の案は、ブランチ取得に追加 git 呼出が必要なうえ登録済み worktree と stray ディレクトリを区別できないため却下した。未登録の stray ディレクトリ（先行 removal の残骸など）は `job prune` が実行する `git worktree prune` のベストエフォートスイープで対処し、主要シナリオとは別課題とした。

### D3: 検出は `doctor` に read-only check として追加（`doctor --fix` は却下）

orphan worktree の **検出** は `specrunner doctor` の `commonChecks` に新 check `orphan-worktrees`（category: `storage`、non-required）として追加する。この check は `orphan-sidecars` check と同じ read-only 哲学に従う — orphan を報告し `specrunner job prune` への操作ヒントを提示するが、一切変更しない。

`doctor` フレームワークの契約は「診断専用（read-only）」であり、`doctor --fix` のような fix-mode を導入すると診断とミューテーションの責務が混在する。この契約は今後も維持する。

**却下案 — `doctor --fix`**: doctor の read-only 契約を崩す。将来の check が副作用を持つ前提で実装され始め、診断結果の再現性が失われるリスクがある。

### D4: 掃除は専用 `job prune` コマンド（dry-run 既定 + `--force` で実削除）

orphan worktree の **掃除** は `job` 名前空間の専用コマンド `job prune` が担う。

- **既定（dry-run）**: 対象の orphan worktree をパスとブランチ名付きで列挙し、何も変更しない。
- **`--force`**: 各 deletable orphan について `WorktreeManager.remove`（`git worktree remove --force` + `rm -rf`）と `git branch -D` を実行する。remote ブランチは対象外（orphan ブランチは通常 push されていない）。削除はベストエフォートかつ idempotent — 個別失敗は警告に留め処理を継続し、再実行は no-op となる。

`job prune` は `job.guardedSubcommands` に追加し、worktree 内からの実行を標準の worktree-guard エラーで拒否する。スキャンと削除の対象はリポジトリルートの `.git/specrunner-worktrees/` であるため、worktree 内から実行させてはならない。

**却下案 — `job cancel` 拡張**: cancel は `jobId` → `state` の解決を前提とした設計であり、state 無し orphan を扱う拡張点がない。解決不能な入力に対する cancel の意味論が壊れる。

**却下案 — `doctor --fix`**: D3 の理由と同じく doctor の read-only 契約を崩す。

### D5: work-protection guard — `--force` でも override 不可

`--force` であっても、以下のいずれかに該当する orphan worktree は削除をスキップし警告する。

- `git -C <worktree> status --porcelain` が非空（uncommitted / untracked な変更がある）
- `git -C <worktree> rev-list --count HEAD --not --remotes` が 0 より大きい（remote に届いていないローカルコミットがある）

orphan は通常空だが、bulk delete で万一の未 push 作業を失わないための安全底面として `--force` に依存しない設計とした。

remote-tracking ref が存在しない場合、`rev-list HEAD --not --remotes` は HEAD の全履歴を「未 push」と判定するため、その worktree は保守的にスキップされる。通常の spec-runner フローでは `origin` が存在するため空 orphan は正常に prune できる。既知の制限として文書化する。

### D6: 検出ロジックは共有モジュール `src/core/worktree/orphan.ts` に集約

orphan の列挙・分類（D1/D2）と work 保護検査（D5）を `src/core/worktree/orphan.ts` 一箇所に実装し、`orphan-worktrees` doctor check と `job prune` runner の両方がこのモジュールを import する。モジュールは `spawn` 関数と `listStates` 関数を注入可能なパラメータとして受け取り、実ファイルシステムに触れることなくユニットテスト可能にする。

二重実装を持つと orphan 判定の定義が diverge するリスクがある。共有モジュールにより、判定基準の変更が check と prune に自動的に伝播する。

## 検討した代替案

### A1: `doctor --fix` で検出と掃除を統合する

doctor に `--fix` フラグを追加し、orphan-worktrees check が検出と削除を担う案。

- **Pros**: コマンドが一つで済む
- **Cons**: doctor の read-only 契約を崩す。将来の check が副作用を前提に実装される可能性が生まれ、診断の再現性が失われる。
- **Why not**: `job prune` を独立させることで doctor の契約は不変のまま維持され、掃除の副作用が明示されたコマンドに局所化される。

### A2: `job cancel` を state 無し orphan に対応するよう拡張する

`job cancel` が `jobId` を解決できないとき worktree のフォールバック削除を試みる案。

- **Pros**: 既存コマンドで対処できる
- **Cons**: `cancel` の意味論（jobId → state 解決 → cleanup）が崩れる。解決できない入力に対して副作用を持つのは予測不能。cancel の失敗経路と orphan 削除の成功経路が混在する。
- **Why not**: `job prune` という独立したコマンドに orphan 掃除の責務を持たせる方が意味論的に明確で、既存の cancel フローを汚染しない。

### A3: 都度手動 `git worktree remove` / `git branch -D` を運用手順として継続する

ツールを追加せずドキュメントで対処する案。

- **Pros**: コード変更ゼロ
- **Cons**: 実運用で複数回発生しており、手動ステップが正確かつ一貫して実行される保証がない。work-protection guard も存在しないため誤削除リスクがある。
- **Why not**: ツールで検出・掃除できることが運用の信頼性を上げ、未 push 作業の保護も担保できる。

## 影響

### Positive

- `specrunner doctor` が orphan worktree を検出し、掃除コマンドへのヒントを提示するため、手動の git 操作なしに状況を把握できる。
- `specrunner job prune` によりツールで安全に掃除できる。dry-run 既定・work-protection guard の 2 段構えで誤削除リスクを最小化する。
- `doctor` の read-only 契約が明示的に確認され、将来の check が read-only であることの先例として機能する。
- state 無し orphan と terminal 残留（cleanup 未完了）の 2 パターンが単一の定義と単一のコマンドで対処される。

### Negative

- remote-tracking ref が存在しないリポジトリでは、空の orphan であっても保守的にスキップされ手動 `git branch -D` が必要になる（既知の制限）。
- `git worktree add` が完了する前に中断した場合（未登録の stray ディレクトリ）は `git worktree list` に現れないため `job prune` でも回収できない。`git worktree prune` のベストエフォートスイープで部分的に対処するが、保証はない（将来課題）。

### Known Debt

- **orphan 窓そのものを縮める runtime 変更（state 先行永続）の未実装**: setupWorkspace の hot path に触れる変更は別件とし、本 ADR は症状（既存 orphan の検出・掃除）に絞る。
- **未登録 stray ディレクトリの回収保証なし**: `git worktree list` に現れない stray ディレクトリの確実な回収は未対処。頻発するようであれば別 request で扱う。
- **`job prune --json` 出力の未実装**: スクリプトからの利用に有益だが今回はスコープ外。必要なら別 request で追加する。

## 参照

- Request: `specrunner/changes/orphan-worktree-doctor/request.md`
- Design: `specrunner/changes/orphan-worktree-doctor/design.md`
- Related: [ADR-20260521-job-cancel-audit-trail-over-delete](2026-05-21-job-cancel-audit-trail-over-delete.md) — `job cancel` の意味論（audit trail 重視、state 解決前提）
- Related: [ADR-20260605-no-worktree-execution-mode](2026-06-07-no-worktree-execution-mode.md) — worktree 内実行ガードの仕組み
