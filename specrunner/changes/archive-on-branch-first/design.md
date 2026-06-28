# Design: archive をブランチ上で先に実行し base への直接影響を merge のみに限定する

## Context

`job archive <slug>` の archive 記帳（change folder の `git mv` + job status の `awaiting-archive → archived` 遷移 + `chore: archive <slug>` commit）は、現状 **base ブランチに直接 commit + push** される。

- `src/core/archive/orchestrator.ts` の Phase 1 が `git checkout <base>` → `git pull --ff-only` → `git mv`（change folder）→ `markJobArchived` → `git commit` → `git push origin <base>` を実行する。
- この `runArchiveOrchestrator` は merge なし `job archive`（CLI から直接呼ぶ）と `--with-merge`（`src/core/archive/merge-then-archive.ts` が merge 成功後／既 merge 検出後に呼ぶ）の両方で共有される。
- Phase 2（worktree 撤去 + feature branch 削除 + sidecar 掃除）は Phase 1 の base push 完了後に続けて走る。

この設計には非対称性がある。feature 変更は merge を通じて PR フロー経由（CI green・branch protection 尊重）で base に入るのに、archive 記帳だけは PR を通らず base へ直 push される。結果として:

- base へ直接影響を与える経路が merge 以外に存在する（branch 規律違反）。
- base が protected な環境では archive 記帳の直 push が reject され archive が完了できない。`--with-merge` では「PR は merged だが記帳が base に乗らない」中途半端な状態に陥る。この構造は ADR-20260603 が Known Debt として記載済みである。

本変更は base への直接影響を **merge のみ** に限定する。archive 記帳を merge 対象の feature branch（作業ブランチ）上で先に行い、merge が feature 変更と archive 記帳を同時に base へ運ぶ設計へ移行する。

## Goals / Non-Goals

**Goals**:

- merge なし `job archive` が base に対する `git checkout` / `git commit` / `git push` を一切行わず、archive 記帳を feature branch 上で commit し remote feature branch へ push する。
- base への直接影響経路を merge のみに限定する（archive 記帳の base 直 push を撤去する）。
- protected base 環境でも merge なし `job archive` が完了する。
- job status を archive 実行時点（feature branch 上）で terminal の `archived` に確定させ、merge の有無に依存させない。
- worktree / feature branch のクリーンアップを merge 完了後にのみ実行する。
- 中断後の再実行で回復できる冪等性を保つ。

**Non-Goals**:

- change folder の dated-archive 命名規則 `<YYYY-MM-DD>-<slug>` は変更しない。
- archive 専用 PR を作る 2-PR モデルには戻さない。merge は既存 feature PR 1 本に相乗りさせる。
- merge 方式（squash）は変更しない。
- archive 記帳を git commit にせず status フラグのみで表現する案（物理移動の廃止）は扱わない。
- archive と merge の step 分離（merge はオプション）という既存の構造は維持する。

## Decisions

### D1: archive 記帳を feature-branch working tree 上で実行する

archive 記帳（usage 導出 → `git mv` change folder → `markJobArchived` → `git add` → `git commit`）を、feature branch が checkout されている working tree 上で実行する。

- worktree モード: 記帳 git 操作の cwd を worktree path とする。worktree は既に feature branch を checkout しており、branch-borne な change folder（`specrunner/changes/<slug>/`）と live な `state.json` を保持している。
- `--no-worktree` モード: 記帳 git 操作の cwd を main repo とする。main repo は job 実行時点で feature branch 上にある。必要なら feature branch を `git checkout <feature-branch>` で確定する（base ではないため要件 1 の禁止対象外）。

既存の `git checkout <base>` / `git pull --ff-only` / `git push origin <base>` は**削除**する。`markJobArchived` と `deriveAndWriteUsage` には記帳 working tree（worktree path、`--no-worktree` では main repo）を repoRoot として渡し、worktree 内の change folder に対して状態を解決・書き込む。

**Rationale**: branch-borne state の実体は feature branch（= worktree）にある。base を checkout して merge 済み folder を pull する現状フローは「archive は merge 後に走る」前提に依存していたが、本変更は archive を merge **前** に feature branch 上で行うため、worktree 上で直接記帳するのが自然で、base に一切触れずに済む。

**Alternatives considered**:
- main repo 上で `git checkout <feature-branch>` してから記帳する案: worktree モードでは同一 branch を worktree と main repo で二重 checkout できず git が拒否する。worktree 上で操作する方が破綻しない。
- base を checkout し merge 後の folder を mv する現状維持（却下A）: branch 規律違反かつ protected base で完了不能。

### D2: 記帳 commit を remote feature branch へ push し既存 feature PR に相乗りさせる

記帳 commit（`chore: archive <slug>`）は `git push origin <feature-branch>` で remote feature branch へ push する。これにより記帳は既存の feature PR の一部となり、merge 時に feature 変更と同時に base へ入る。archive 専用 PR は作らない。

**Rationale**: 1-PR モデル（ADR-20260502）を維持しつつ base への到達経路を PR merge に一本化する。

**Alternatives considered**: archive 専用 PR の 2-PR モデル（却下B）— PR 一覧汚染とマージ順序依存を再導入する。

### D3: status は記帳時点で `archived` に確定させ、merge 後経路は status を書き換えない

`markJobArchived`（`awaiting-archive → archived`）を記帳 Phase（feature branch 上）で実行し、status を terminal に確定させる。merge の成否・有無に status の確定を依存させない。merge 後の経路（cleanup）は job status を**一切書き換えない**。中間 status（`archive-recorded` 等）は導入しない。既存遷移 `awaiting-archive → archived` をそのまま使う。

**Rationale**: merge は任意であり実行されないこともある。status を記帳時点で確定させれば「archived は merge 後にのみ到達」という不変を表現するための中間 status が不要になる（却下D）。中間 status を増やすと status を列挙・遷移・検証・表示する全箇所（型・遷移表・doctor・reconcile・cancel・ps 等）へ波及し、さらに「merge 後に archived へ書き換える」処理が base working tree を dirty にする。

**Alternatives considered**: 中間 status の導入（却下D）— 上記の通り波及コストが大きく、archive の merge 独立性を損なう。

### D4: post-merge cleanup を独立した step として切り出し、merge 完了後にのみ実行する

worktree 撤去 + feature branch 削除（local + remote）+ sidecar（liveness / managed marker / sidecar dir）掃除を、記帳から分離した独立の cleanup step とする。この cleanup は **merge 成功後にのみ** 呼び出す。merge なし `job archive` は cleanup を呼ばない（= 構造的に feature branch / worktree を残す）。

**Rationale**: 要件 4「クリーンアップは merge 完了後にのみ」を、フラグ分岐ではなく呼び出し構造で保証する。merge なし経路に cleanup の呼び出しが存在しなければ、PR が生きている間に feature branch を消す事故が原理的に起きない。

**Alternatives considered**: 記帳関数に `withCleanup: boolean` フラグを足す案 — フラグ漏れで cleanup が誤発火するリスクが残り、不変を型・構造で表現できない。

### D5: `--with-merge` を「記帳 → CI green 待ち → squash merge → cleanup」へ再順序化する

`--with-merge` のフローを次へ変更する:

1. 記帳 step を実行する（D1/D2/D3、冪等）。記帳 commit を feature branch へ push する。
2. `getPullRequest` で PR を確認する。既に MERGED なら 3〜4 を skip して 5（cleanup）へ。
3. protected-paths guard → CI green 待ち（記帳 push 後の headSha を対象）→ squash merge。
4. （merge 成功）
5. cleanup step を実行する。

CI green 待ちは「記帳 commit を feature branch へ push した後の headSha」を対象にする。記帳 push 直後は GitHub の eventual consistency により `getPullRequest` が旧 headSha を返しうるため、push した記帳 commit の SHA を捕捉し、wait loop が `headSha == 捕捉 SHA` を観測してから check rollup を信頼する。最終 gate は GitHub branch protection（`BLOCKED` → escalation）が担う。

**Rationale**: 旧フローは merge を先に行い archive を後で base へ直 push していた。記帳を先に feature branch へ乗せてから merge すれば、merge が feature 変更 + 記帳を一括で base へ運び（要件 2）、base への到達経路が merge に一本化される。

**Alternatives considered**: merge 先行 → 記帳後行（現状維持）— archive 記帳が base 直 push になり要件 3 に反する。

### D6: `--no-worktree` モードの記帳・cleanup 挙動を定義する

- 記帳: main repo（feature branch 上）で実行する（D1）。worktree 撤去は対象外。
- cleanup（merge 後のみ）: main repo は feature branch 上にあるため、`git checkout <base>` で feature branch から離れてから local feature branch を削除し、remote feature branch を削除する。この `git checkout <base>` は HEAD の切り替えのみで base への commit / push を伴わず、base の**内容**を変更しない。よって「base への直接影響は merge のみ」の不変を保つ。merge なし経路では cleanup 自体を呼ばないため、この checkout も発生しない（要件 1 の「merge なし `job archive` は base への checkout を一切行わない」を満たす）。

**Rationale**: feature branch 上で local branch を削除するには branch から離れる必要がある。base への detach は内容変更を伴わない。merge path 内に限定されるため、base 直接影響の一本化と矛盾しない。

**Alternatives considered**: `git checkout --detach` で base に触れず branch を離れる案 — detached HEAD が UX 上分かりにくく、利用者を宙吊りにする。local feature branch を削除せず remote のみ削除する案 — ローカルに孤立 branch が残留する。

### D7: 冪等性

- 記帳 Phase 0 が status terminal（`archived`）を検出したら即 no-op で返す（worktree へ触れる前に短絡）。
- `git mv`（移動済みなら skip）/ `markJobArchived`（archived なら no-op）/ `commitArchive`（staged 変更ゼロなら skip）/ feature push（新 commit なければ no-op）はいずれも skip-if-done。記帳済み feature branch への再実行は no-op になる。
- `--with-merge` 再実行で PR が既に MERGED なら記帳・merge を skip し cleanup のみ実行する。
- cleanup は best-effort かつ冪等（worktree 撤去・branch 削除・sidecar 削除はいずれも不在時 no-op）。

**Rationale**: 中断後の再実行で回復できること（要件 6）を、各 step の skip-if-done で担保する。

## Risks / Trade-offs

- [ADR-20260603 の client-closed 性後退] 本変更は ADR-20260603 が確立した「archive を GitHub merge から切り離し client-closed・offline・決定的に完走させる」性質を一部後退させる。archive がローカル base 直 push をやめ remote feature branch への push に変わるためである。→ Mitigation: job status は記帳時点でローカルに確定し merge に依存しないので archive 単体の完了性は保たれる。push 先が base から feature branch へ変わるだけで、network 依存度自体は pipeline の既存 push と同等。adr-gen step は ADR-20260603 を supersede する新 ADR を生成すること（既存 ADR を supersede 対象として参照する。新 ADR の path / file 名は adr-gen が決定する）。
- [protected-paths guard との相互作用] 記帳を先行させると、CI green 待ち時点で PR の changed files に `specrunner/changes/**` の移動（`<slug>/` → `archive/<dated>-<slug>/`）が含まれる。`archive.protectedPaths` が `specrunner/changes/**` 等を保護対象にしていると archive ごとに guard が発火し得る。→ Mitigation: 設計上の既知事項として記録する。通常 `protectedPaths` は source / infra を対象にし change folder を保護対象にしないため実害は限定的。
- [記帳 push 直後の CI race] 記帳 commit を push した直後に `getPullRequest` が旧 headSha を返すと、旧 head の green を誤って信頼し premature merge する恐れ。→ Mitigation: D5 の通り push した記帳 SHA を捕捉し `headSha == SHA` 観測まで待つ。加えて GitHub branch protection が最終 gate（`BLOCKED` → escalation）。
- [既存テストの期待反転] 現行テスト（`tests/unit/no-worktree-archive.test.ts` の TC-NW-012「no-worktree でも branch 削除する」など、`tests/unit/core/archive/orchestrator.test.ts`、`tests/unit/core/archive/merge-then-archive.test.ts`）は「記帳 = base 直 push + 即 cleanup」を固定している。本変更で期待が反転する。→ Mitigation: tasks で対象テストの更新を明示し、cleanup は merge path 側へ移す。

## Open Questions

- `--with-merge` 記帳後の CI 起動が遅い repo で、`NONE_CHECK_GRACE_MS`（60s）が「記帳 commit に対する CI がまだ起動していない」状態を誤って「CI-less repo」と判定し premature merge しないか。記帳 SHA gating（D5）で headSha 一致を確認してから rollup を見るため、headSha は一致するが checks が none のまま grace 経過 → CI-less 扱いになるケースは従来と同じ挙動。CI 起動の遅さに依存するため、必要なら grace を記帳 push 起点でリセットするか検討余地がある（本 request では現行 grace 挙動を踏襲）。

## Migration Plan

- データ migration なし。status 集合・遷移表は不変（`awaiting-archive → archived` のまま）。
- adr-gen step は ADR-20260603 を supersede する新 ADR を生成する（supersede 関係を明記）。
- ロールバックは本 commit の revert で可能（status / folder 命名の永続変更を伴わない）。
