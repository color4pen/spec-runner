# Cross-Boundary Invariants Review — Iteration 2

<!-- verdict は CLI が typed findings から導出するため、この file には記載しない。 -->

## 検証範囲

- `git diff main...HEAD --stat` で 132 files / 10,471 insertions / 380 deletions の変更範囲を確認した。
- `design.md` と `tasks.md` を読み、start 時に固定した契約を resume / reopen / attach / archive で正本にする設計、および認証・identity・pipeline 終端の境界を確認した。
- 新経路から隣接する既存機構へ入る列として、start → terminal publish、halt → resume、terminal → reopen → resume、checkpoint fetch → verify → materialize、plain/merge archive、cancel、job ls を追跡した。
- 前周の `CommandRunner` 完了表示は現在 `state.githubIntegration` で分岐し、origin canonicalization は `url.host` を使って明示 port を保持することを読み直し、両指摘が解消済みであることを確認した。
- verification step の test/lint/typecheck は依頼どおり重複実行していない。

## Findings

### F-1 [medium / fixable] attach の検証前 composition が現在 config を権威にし、保存済み disabled checkpoint を取得できなくする

**場所:** `src/cli/attach.ts:98`

attach は checkpoint を読む前に `composeGitHubIntegration(config, ...)` を呼び、invoker の現在 config が enabled なら token 解決と GitHub owner/name 形式の origin 検査を必須にする。しかし attach 対象の契約は checkpoint 内に固定されており、disabled job では非 GitHub origin が正規の入力である。この先行処理によって、config の後変更が本来不変な既存 job の attach 可否を変えてしまう。

再現列:

1. 非 GitHub origin の repository で `github.enabled: false` の job を開始し、quiescent checkpoint を feature branch に push する。
2. 別 checkout で project config を `github.enabled: true`（または未指定の既定 true）へ変更する。origin は同じ非 GitHub remote のままにする。
3. `job attach --branch <branch>` を実行する。
4. checkpoint の fetch/read/verify より前に `composeGitHubIntegration` が現在 config の enabled を採用し、token を要求した後、非 GitHub origin を `parseRemoteUrl` で拒否する。
5. checkpoint に保存された `githubIntegration.enabled: false` と origin digest を検証する地点へ到達せず、同一 job・同一 origin の attach が失敗する。

これは「config を後から変えても既存 job を暗黙に別モードへ移行しない」「attach では checkpoint から保存済み契約を復元する」という不変条件を破る。fetch はまず forge 非依存 transport で行い、checkpoint を検証して契約を得た後に、enabled checkpoint に限って GitHub credential/client と GitHub identity を要求する二段構成が必要である。enabled checkpoint を invoker config の disabled 化で迂回させない fail-closed 条件は維持する必要がある。

### F-2 [medium / fixable] plain archive が enabled job の保存済み契約を現在 config で再上書きし、既存 token transport を失う

**場所:** `src/cli/archive.ts:285`

plain archive は対象 state から `jobGithubEnabled` を正しく取得しているが、enabled 分岐内の `composeGitHubIntegration` にその値を `overrideEnabled` として渡していない。したがって現在 config が disabled に変わっていると composition は disabled result を返し、環境や credential store に利用可能な GitHub token があっても `archiveToken` は `undefined` になる。直前の merge archive は同じ状況を `overrideEnabled: jobGithubEnabled` で処理しており、plain path だけが保存済み契約を失っている。

再現列:

1. GitHub HTTPS origin で GitHub enabled job を開始し、token による transport auth で `awaiting-archive` まで到達する。
2. job 開始後に project config を `github.enabled: false` へ変更する（job state の保存済み契約は enabled のまま）。credential helper を持たず、既存どおり SpecRunner の token extraheader が push に必要な環境とする。
3. `job archive <slug>` を実行する。
4. state 判定で enabled 分岐へ入るが、`composeGitHubIntegration(config, ...)` は現在 config を読み disabled result を返すため `archiveToken` が設定されない。
5. 未変更の `runPlainArchive` が archive record を commit した後、token 無しで push して失敗する。安全機構により archived 遷移と cleanup は行われないものの、config 変更前なら成立した archive が失敗し、job 固定契約が実行に反映されない。

`--with-merge` と同様に plain archive の composition にも対象 job の保存済み値を明示的に渡す必要がある。disabled job では引き続き credential 解決を一切行わないこと、push 失敗時の非遷移・非 cleanup の順序は維持すること。

## 確認済みの隣接不変条件

- GitHub 無効 descriptor は `pr-create` の inbound transition を `end` に置換するだけで、verification・review・conformance と post-fixer reverification の既存経路を迂回しない。
- terminal `end` は共通 `Pipeline` seam で従来どおり `awaiting-archive` へ遷移し、state persist 後に terminal commit/push を行う。
- resume と reopen は保存済み state 契約を用い、reopen の status/reason/journal/FSM 条件を維持する。
- cancel は disabled job で token を解決せず、enabled/legacy job では従来の best-effort token transport を維持する。
- job ls は GitHub enabled かつ PR を持つ `awaiting-archive` job が存在するときだけ client を構築し、disabled-only の一覧では credential に触れない。
- plain archive の push 失敗時は既存機構が archived 遷移と cleanup を行わないため、F-2 は成果物消失には至らない。

## 検証できなかった項目

- F-1/F-2 のネットワーク認証を伴う実 remote 再現は行っていない。いずれも config/state の分岐と composition の決定的な呼び出し列から確認した。
- `verification-result.md` に記録済みの全 test/lint/typecheck は再実行していない。
