# Cross-Boundary Invariants Review — Iteration 1

<!-- verdict は CLI が typed findings から導出するため、この file には記載しない。 -->

## 検証範囲

- `git diff main...HEAD --stat` で 118 files / 7,766 insertions / 360 deletions の変更範囲を確認した。
- `design.md` と `tasks.md` を読み、job state に固定した GitHub 契約、pipeline 終端の差し替え、attach identity、archive/reopen/resume の新経路を確認した。
- 変更された関数だけでなく、隣接する未変更機構である design-only descriptor、`Pipeline` の共通 terminal 遷移、`CommandRunner` の terminal 表示、checkpoint の fetch → read → verify → materialize 順序、`JobCatalog` の state 探索を追跡した。
- verification step の test/lint/typecheck は、依頼どおり重複実行していない。

## Findings

### F-1 [medium / fixable] PR の不在を GitHub 無効契約と同一視し、GitHub 有効な design-only job の完了表示を壊す

**場所:** `src/core/command/runner.ts:467`

`handleResult` は `awaiting-archive` で `pullRequest.url` が無ければ無条件に GitHub 無効経路として扱う。しかし既存の `DESIGN_ONLY_DESCRIPTOR` は、GitHub が有効でも元から `pr-create` を通らず `design -> end` で完了するため、PR が無いことは GitHub 無効の十分条件ではない。

再現列:

1. `github.enabled` を未指定（既定で enabled）にし、request の pipeline に `design-only` を指定する。
2. 未変更の design-only transition `design:success -> end` が共通 `Pipeline` terminal seam に入り、state は `awaiting-archive` になる。
3. design-only は `pr-create` を実行しないため `state.pullRequest` は存在しない。
4. 新しい `handleResult` の else 分岐が選ばれ、`Pipeline completed (GitHub integration disabled)` と表示される。

これは「design-only 等、元から PR 終端ではない profile の意味は変えない」という契約を破り、job に固定された実際の連携状態とも矛盾する。分岐条件を `getGitHubIntegration(finalState).enabled` にし、GitHub 有効かつ PR なしの既存 terminal 表示を別に維持する必要がある。

### F-2 [medium / fixable] origin digest が port を捨てるため、別 repository の checkpoint identity が一致してしまう

**場所:** `src/git/remote.ts:96`

`normalizeOriginIdentity` は URL の `hostname` と path だけを canonical identity に使い、明示 port を除外する。port が異なる endpoint は同じ host/path でも別 Git server・別 repository になり得るが、GitHub 無効 attach の既存 checkpoint gate はこの digest の一致を repository identity の権威として受け入れる。

再現列:

1. `https://forge.example:8443/team/repo.git` を origin とする GitHub 無効 job を完了し、checkpoint を作る。
2. その feature branch を、別 repository `https://forge.example:9443/team/repo.git` に移送する（mirror/migration で通常に発生し得る）。
3. 2 番目の repository を origin とする checkout で `job attach --branch <branch>` を実行する。
4. attach は 2 番目の origin から branch を fetch し、checkpoint に保存された 1 番目の digest と invoker digest を比較する。
5. 両方とも `forge.example/team/repo` から同一 SHA-256 になり、`verifyCheckpoint` の identity gate を通過して別 repository の job を materialize する。

これにより「repository identity が異なる checkpoint は副作用前に拒否する」という attach の不変条件が破られる。userinfo と transport scheme は除去してよいが、network endpoint を区別する明示 port（または既定 port に正規化した authority）は canonical identity に含める必要がある。SSH URL の明示 port を扱う形式についても同じ規則で固定するべきである。

## 確認済みの隣接不変条件

- GitHub 無効 descriptor の `pr-create` 除去後も、custom reviewer composition は conformance anchor を基準に transition を再構成し、standard/fast の reviewer chain を迂回しない。
- resume は state の `githubIntegration` を bootstrap override に渡すため、後から project config を変更しても job 契約を切り替えない。
- archive の plain path は disabled job で token composition を通らず、既存 `runPlainArchive` の record push → archived → cleanup 順序を維持する。
- enabled/legacy checkpoint は owner/name を要求して fail-closed とし、invoker config の disabled 化だけでは GitHub identity gate を迂回できない。

## 検証できなかった項目

- 実ネットワーク上の異なる port の Git server を起動した再現は行っていない。F-2 は canonicalization と checkpoint verification の決定的なコード列から確認した。
- verification-result.md に記録済みの全 test/lint/typecheck の再実行は行っていない。
