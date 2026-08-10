# Spec: resume operator guidance

## Requirements

### Requirement: 採用系 preflight を統合した単一 halt

`job resume` が dirty protected canon paths を理由に fail-closed halt する時、システムは halt 前に未知 commit（publish-range で synthesizedCommits ledger に無い OID）の検出も実行し、両検出結果を **1 つの** halt 出力に統合 MUST する。dirty canon と未知 commit が併存しても、operator が必要 flag を全て知るための halt は 1 回でなければならない。この統合は Gate 1 が fail-closed halt する経路にのみ適用し、`--apply-canon` 指定時・auto-quarantine 成立時の既存挙動は変更しない。

#### Scenario: dirty canon と未知 commit の併存で 1 回の統合 halt

**Given** worktree に dirty な protected canon path と、ledger 外の未知 commit がともに存在する awaiting-resume ジョブがある
**When** operator が `specrunner job resume <slug>` を flag なしで実行する
**Then** 出力は 1 回の halt であり、その中に dirty canon paths の列挙・未知 commit（shortSha + subject）の列挙・実 slug 入りの `specrunner job resume <slug> --apply-canon --adopt-commits` がすべて含まれる

#### Scenario: dirty canon のみで --apply-canon 案内

**Given** worktree に dirty な protected canon path が存在し、未知 commit は無い awaiting-resume ジョブがある
**When** operator が flag なしで resume する
**Then** halt 出力の完全コマンドは `specrunner job resume <slug> --apply-canon` であり、`--adopt-commits` を含まない

#### Scenario: 未知 commit のみで --adopt-commits 案内

**Given** protected canon は clean で、ledger 外の未知 commit のみが存在する awaiting-resume ジョブがある
**When** operator が flag なしで resume する
**Then** halt 出力の完全コマンドは `specrunner job resume <slug> --adopt-commits` であり、`--apply-canon` を含まない

### Requirement: 統合 halt メッセージの形式

統合 halt メッセージは、既存 `egressResolutionOptions` と同等の丁寧さで次を含む MUST: (a) 検出内訳（dirty canon paths の列挙、未知 commit の shortSha + subject の列挙）、(b) 検出結果に応じた flag のみを含むコピペ可能な完全コマンド 1 行、(c) 取り込まない場合の代替案（dirty canon の discard、未知 commit の push / revert）。

#### Scenario: 代替案の提示

**Given** dirty canon と未知 commit が併存し、operator が flag なしで resume して統合 halt に至った
**When** halt 出力を読む
**Then** 取り込まない選択肢として、dirty canon を discard する方法（例: `git checkout HEAD -- <path>`）と、未知 commit を push または revert して publish range から外す方法が併記されている

### Requirement: preflight は副作用を持たず fail-closed を維持する

preflight の未知 commit 検出は検出のみを行い、commit 作成・ledger（synthesizedCommits）追記・git 履歴変更を一切行わない MUST。preflight の adopt 検出が git exit 128 で失敗した場合は非 git 環境として空扱いとし、exit 128 以外で失敗した場合は検出失敗を halt メッセージに併記したうえで fail-closed（pipeline 非起動）を維持する。`--adopt-commits` は検出が成功して未知 commit が確認できた場合にのみ完全コマンドへ含める。

#### Scenario: halt 前後で git 履歴と ledger が不変

**Given** dirty canon（と任意の未知 commit）を持つ worktree で resume が統合 halt に至る直前の状態がある
**When** flag なしの resume が統合 halt して pipeline を起動せず終了する
**Then** git HEAD・commit 数と state.json の synthesizedCommits は halt 前後で不変である

#### Scenario: 未知 commit 検出失敗時の fail-closed

**Given** dirty canon が存在し、preflight の未知 commit 検出が git exit 128 以外で失敗する
**When** operator が flag なしで resume する
**Then** halt 出力に検出失敗の旨が併記され、`--apply-canon` の案内のみが提示され（`--adopt-commits` は勧めない）、pipeline は起動しない

### Requirement: job resume の詳細ヘルプ

`specrunner job resume --help`（および `-h`）は `NO_DETAILED_HELP_USAGE` ではなく詳細な usage を表示する MUST。usage は `<slug>` 引数の説明（slug で解決し、見つからなければ Job ID prefix として fallback 解決する旨）、11 個の flag（`--from` / `--force` / `--verbose` / `--quiet` / `--prompt` / `--prompt-file` / `--json` / `--no-worktree` / `--apply-canon` / `--adopt-commits` / `--detach`）すべての説明、相互排他 2 組（`--detach`/`--json`、`--prompt`/`--prompt-file`）の明記、`--from` の有効値（および複合 step が `--from` の対象外である注記）を含む。

#### Scenario: 詳細ヘルプの内容

**Given** CLI が利用可能である
**When** `specrunner job resume --help` を実行する
**Then** exit 0 で終了し、出力に "No detailed help available." を含まず、`--from` / `--prompt` / `--prompt-file` / `--apply-canon` / `--adopt-commits` / `--detach` を含む

### Requirement: 未解決 slug の報告文言

resume 経路で入力が slug でも Job ID prefix でも解決できない場合、システムは slug で探した事実が分かる文言（例: "no active job with slug or job ID prefix '<input>'"）で報告する MUST。`JobStateStore.resolveId` 自体のメッセージ（job show / cancel と共用）は変更しない。

#### Scenario: 存在しない slug の resume

**Given** slug でも Job ID prefix でも一致するアクティブジョブが存在しない
**When** operator が `specrunner job resume <存在しない値>` を実行する
**Then** exit 1 で終了し、出力に slug で探した事実が分かる文言（slug または job ID prefix で見つからない旨）が含まれる
