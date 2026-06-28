# ADR-20260628: archive 記帳を feature branch 上で先に実行し、base への直接影響を merge のみに限定する

## ステータス

accepted

Supersedes: [ADR-20260603-archive-command-client-closed](2026-06-03-archive-command-client-closed.md)

## コンテキスト

[ADR-20260603-archive-command-client-closed](2026-06-03-archive-command-client-closed.md) は `job archive` を「archive 記帳を base ブランチに直接 commit + push し、merge から切り離して client-closed・決定的に完走させる」設計として確立した。具体的には orchestrator の Phase 1 が `git checkout <base>` → `git pull --ff-only` → change folder `git mv` → `markJobArchived` → `git commit` → `git push origin <base>` を実行していた。

この設計には構造的な非対称性がある。feature 変更は merge を通じて PR フロー経由（CI green・branch protection 尊重）で base に入るのに、archive 記帳だけが PR を通らず base へ直 push される。結果として:

- base へ直接影響を与える経路が merge 以外に存在する（branch 規律違反）。
- base が protected な環境では archive 記帳の直 push が reject され、archive が完了できない。`--with-merge` を使った場合「PR は merged だが記帳が base に乗らない」中途半端な状態になる。この構造は ADR-20260603 自体が Known Debt として記載していた。

本変更は base への直接影響を **merge のみ** に限定する。archive 記帳（change folder 移動 + job status 遷移 + `chore: archive <slug>` commit）を merge 対象の feature branch 上で先に行い、merge が feature 変更と archive 記帳を同時に base へ運ぶ設計へ移行する。

ADR-20260603 が確立した「archive を GitHub merge から切り離す」性質（client-closed）はこの変更で一部後退する。archive の push 先が base（ローカル完結）から remote feature branch（network 依存）へ変わるためである。一方 job status は archive 実行時点でローカルに確定し merge に依存しないため、archive 単体の完了性は保たれる。

## 決定

### D1: archive 記帳を feature branch の working tree 上で実行する

archive 記帳（change folder `git mv` + `markJobArchived` + `deriveAndWriteUsage` + `git commit`）を feature branch が checkout されている working tree 上で実行する。

- **worktree モード**: 記帳 git 操作の cwd を worktree path とする。worktree は既に feature branch を checkout しており、branch-borne な change folder と live な `state.json` を保持している。
- **`--no-worktree` モード**: 記帳 git 操作の cwd を main repo とする。main repo は job 実行時点で feature branch 上にある。必要なら feature branch を `git checkout <feature-branch>` で確定する（base への checkout は行わない）。

既存の `git checkout <base>` / `git pull --ff-only` / `git push origin <base>` を orchestrator から削除する。`markJobArchived` と `deriveAndWriteUsage` には feature branch 上の working tree を repoRoot として渡す。

**採用理由**: branch-borne state の実体は feature branch（= worktree）にある。base を checkout して merge 済み folder を pull する旧フローは「archive は merge 後に走る」前提に依存していた。本変更は archive を merge **前** に feature branch 上で行うため、worktree 上で直接記帳するのが自然で、base に一切触れずに済む。

**却下案**: main repo 上で `git checkout <feature-branch>` してから記帳する案 — worktree モードでは同一 branch を worktree と main repo の両方で checkout できず git が拒否する。

### D2: 記帳 commit を remote feature branch へ push し既存 feature PR に相乗りさせる

記帳 commit（`chore: archive <slug>`）は `git push origin <feature-branch>` で remote feature branch へ push する。これにより記帳は既存の feature PR の一部となり、merge 時に feature 変更と archive 記帳が同時に base へ入る。archive 専用 PR は作らない。

**採用理由**: [ADR-20260502-finish-1pr-model](2026-05-02-finish-1pr-model.md) が確立した 1-PR モデルを維持しつつ、base への到達経路を PR merge に一本化する。

**却下案**: archive 専用 PR を作る 2-PR モデル — PR 一覧汚染とマージ順序依存の不整合を再導入する（ADR-20260502 が解消した問題の逆行）。

### D3: job status を記帳時点で `archived` に確定させ、merge 後経路は status を書き換えない

`markJobArchived`（`awaiting-archive → archived`）を記帳 Phase（feature branch 上）で実行し、job status を terminal に確定させる。status の確定を merge の有無に依存させない。merge 後の cleanup 経路は job status を一切書き換えない。archive と merge の間に中間 status（`archive-recorded` 等）を導入しない。既存の遷移 `awaiting-archive → archived` をそのまま使う。

**採用理由**: merge は任意であり実行されないこともある。status を記帳時点で確定させれば中間 status が不要になる。中間 status を増やすと status を列挙・遷移・検証・表示する全箇所（型・遷移表・doctor・reconcile・cancel・ps 等）へ波及し、さらに「merge 後に archived へ書き換える」処理が base working tree を dirty にする。

**却下案**: 中間 status `archive-recorded` の導入 — 上記波及コストが大きく、archive の merge 独立性を損なう。

### D4: post-merge cleanup を独立したモジュールとして切り出し、merge 完了後にのみ呼ぶ

worktree 撤去 + feature branch 削除（local + remote）+ sidecar（liveness / managed marker / sidecar dir）掃除を `src/core/archive/post-merge-cleanup.ts` として記帳フローから分離する。この cleanup は **merge 成功後にのみ** 呼び出す。merge なしの `job archive` は cleanup を呼ばない（= 構造的に feature branch / worktree を残す）。

**採用理由**: 「cleanup は merge 完了後にのみ」を、フラグ分岐ではなく呼び出し構造で保証する。merge なし経路に cleanup の呼び出しが存在しなければ、PR が生きている間に feature branch を消す事故が原理的に起きない。

**却下案**: 記帳関数に `withCleanup: boolean` フラグを足す案 — フラグ漏れで cleanup が誤発火するリスクが残り、不変を型・構造で表現できない。

### D5: `--with-merge` を「記帳 → CI green 待ち → squash merge → cleanup」へ再順序化する

`--with-merge` のフローを次の順序に変更する:

1. 記帳 step を実行する（D1/D2/D3、冪等）。記帳 commit を remote feature branch へ push する。
2. `getPullRequest` で PR 状態を確認する。既に MERGED なら 3〜4 を skip して 5（cleanup）へ。
3. protected-paths guard → CI green 待ち（記帳 push 後の headSha を対象）→ squash merge。
4. （merge 成功）
5. cleanup step を実行する（D4）。

CI green 待ちは「記帳 commit を feature branch へ push した後の headSha」を対象にする。push 直後は GitHub の eventual consistency により `getPullRequest` が旧 headSha を返しうるため、push した記帳 commit の SHA を捕捉し、wait loop が `headSha == 捕捉 SHA` を観測してから check rollup を信頼する。最終 gate は GitHub branch protection（`BLOCKED` → escalation）が担う。

**採用理由**: 旧フローは merge を先に行い archive を後で base へ直 push していた。記帳を先に feature branch へ乗せてから merge することで、merge が feature 変更 + archive 記帳を一括で base へ運び、base への到達経路が merge に一本化される。

**却下案**: merge 先行 → 記帳後行（旧フロー）— archive 記帳が base 直 push になり branch 規律違反かつ protected base で完了不能。

### D6: `--no-worktree` モードの記帳・cleanup 挙動を明示する

- **記帳**: main repo（feature branch 上）で実行する（D1）。
- **cleanup（merge 後のみ）**: main repo は feature branch 上にあるため、`git checkout <base>` で feature branch から離れてから local feature branch を削除し、remote feature branch を削除する。この `git checkout <base>` は HEAD の切り替えのみで base への commit / push を伴わず、base の**内容**を変更しない。よって「base への直接影響は merge のみ」の不変を保つ。merge なし経路では cleanup 自体を呼ばないため、この checkout も発生しない（要件「merge なし `job archive` は base への checkout を一切行わない」を満たす）。

**採用理由**: feature branch 上で local branch を削除するには branch から離れる必要がある。base への detach は内容変更を伴わない。merge path 内に限定されるため、base 直接影響の一本化と矛盾しない。

**却下案**: `git checkout --detach` で base に触れず branch を離れる案 — detached HEAD が UX 上分かりにくく利用者を宙吊りにする。local feature branch を削除せず remote のみ削除する案 — ローカルに孤立 branch が残留する。

### D7: 冪等性の担保

- 記帳 Phase 0 が status terminal（`archived`）を検出したら即 no-op で返す（worktree へ触れる前に短絡）。
- `git mv`（移動済みなら skip）/ `markJobArchived`（archived なら no-op）/ `commitArchive`（staged 変更ゼロなら skip）/ feature push（新 commit なければ no-op）はいずれも skip-if-done とする。
- `--with-merge` 再実行で PR が既に MERGED なら記帳・merge を skip し cleanup のみ実行する。
- cleanup は best-effort かつ冪等（worktree 撤去・branch 削除・sidecar 削除はいずれも不在時 no-op）。

## 検討した代替案

### A1: 現状維持（base 直 push）

archive 記帳を引き続き base ブランチへ直接 commit + push する案（ADR-20260603 の設計）。

- **Pros**: 変更不要。archive が merge なしでも確実に base に到達する。
- **Cons**: branch 規律違反。protected base では archive が完了不能。ADR-20260603 の Known Debt を解消できない。
- **Why not**: protected base 環境での動作不能が本変更の直接動機であり、現状維持は要件を満たさない。

### A2: archive 専用 PR を作る 2-PR モデル

archive 記帳専用の PR を作成し、merge する案。

- **Pros**: archive の base 到達を確実にしつつ branch protection を尊重できる。
- **Cons**: PR 一覧の汚染とマージ順序依存の不整合を再導入する。[ADR-20260502-finish-1pr-model](2026-05-02-finish-1pr-model.md) が解消した問題の逆行。
- **Why not**: 1-PR モデルの維持が Non-Goal として明示されている。

### A3: archive 記帳を git commit にせず status フラグのみで表現する

`changes/archive/<dated>-<slug>/` への物理移動を廃止し、status 更新のみで archive を表現する案。

- **Pros**: git 操作が不要になり base / feature branch への影響がゼロになる。
- **Cons**: dated-archive-folders（[ADR-20260521-dated-archive-folders](2026-05-21-dated-archive-folders.md)）を巻き戻し、slug 再利用時の衝突回避を再設計する必要があり本変更のスコープを超える。
- **Why not**: スコープ外として明示されている。

### A4: archive と merge の間に中間 status を設ける

`archived` の前に `archive-recorded`（記帳済みだが未 merge）を表す中間 status を導入する案。

- **Pros**: 「archived は base に到達した状態」という不変を表現しやすい。
- **Cons**: status を列挙・遷移・検証・表示する全箇所（型・遷移表・doctor・reconcile・cancel・ps 等）への波及が大きい。「merge 後に archived へ書き換える」処理が base working tree を dirty にする。merge は任意であるため「archive-recorded のまま merge されない」状態が恒久的に発生しうる。
- **Why not**: archive の merge 独立性を損ない、かつ実装コストが高い。D3 で明示的に却下。

## 影響

### Positive

- base が protected な環境でも merge なし `job archive` が完了する。ADR-20260603 の Known Debt が解消される。
- base への直接影響経路が merge のみに限定され、branch 規律が一貫する。
- `--with-merge` のフローが「記帳 → CI wait → merge → cleanup」へ整理され、archive 記帳が必ず feature PR に含まれた状態で merge されることが保証される。
- post-merge cleanup が独立モジュール（`post-merge-cleanup.ts`）として分離され、責務境界が明確になる。
- job status は archive 実行時点でローカルに確定し、merge の成否に依存しない。

### Negative

- archive の push 先が base（ローカル完結）から remote feature branch に変わるため、ADR-20260603 が確立した「client-closed（GitHub 到達不能でも完走）」性質が一部後退する。feature branch への push は network 依存を持つ。
- merge なし `job archive` は worktree / feature branch を残すため、merge を実行しない限り local / remote に cleanup されない branch が残留する。

### Known Debt

- `--with-merge` 記帳後の CI 起動が遅い repo では `NONE_CHECK_GRACE_MS`（60s）が「記帳 commit に対する CI がまだ起動していない」状態を誤って「CI-less repo」と判定し premature merge する可能性がある。headSha gating（D5）で headSha 一致を確認してから rollup を見るが、「headSha 一致 + checks none + grace 経過」のケースは従来と同じ挙動を踏襲する（本変更のスコープ外）。
- `archive.protectedPaths` が `specrunner/changes/**` 等を保護対象にしていると、archive ごとに guard が発火し得る。通常 `protectedPaths` は source / infra を対象にするため実害は限定的だが、既知事項として記録する。

## 参照

- Request: `specrunner/changes/archive-on-branch-first/request.md`
- Design: `specrunner/changes/archive-on-branch-first/design.md`
- Supersedes: [ADR-20260603-archive-command-client-closed](2026-06-03-archive-command-client-closed.md) — base 直 push・client-closed 設計（本 ADR で置き換え）
- Related: [ADR-20260502-finish-1pr-model](2026-05-02-finish-1pr-model.md) — 1-PR モデル（本 ADR で継承）
- Related: [ADR-20260521-dated-archive-folders](2026-05-21-dated-archive-folders.md) — dated-archive 命名規則（本変更で不変）
- Related: [ADR-20260603-with-merge-wait-until-green](2026-06-03-with-merge-wait-until-green.md) — CI green 待ちロジック（`--with-merge` 経路で継承・再順序化）
- Related: [ADR-20260603-finish-branch-protection-gate](2026-06-03-finish-branch-protection-gate.md) — branch protection 尊重（本変更で archive 側にも適用）
