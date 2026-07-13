# ADR-20260713: `--with-merge` 経路における archive 記録済みシグナルと archived 状態の分離

## ステータス

accepted

Amends: [ADR-20260628-archive-on-branch-first](2026-06-28-archive-on-branch-first.md) の D3（`--with-merge` 経路において job status を記帳時点で `archived` に確定させる決定）

## コンテキスト

[ADR-20260628-archive-on-branch-first](2026-06-28-archive-on-branch-first.md) の D3 は「job status を記帳時点で `archived` に確定させ、merge 後経路は status を書き換えない」と定めた。この決定は merge を伴わない plain `job archive` には適切に機能する。

しかし `job archive --with-merge` の経路では、記帳（`runArchiveOrchestrator`）が merge の前に feature branch 上で行われ、記帳時点で status が terminal な `archived` へ遷移する。その後 merge が失敗（escalation）すると、以下の不整合が生じる:

**問題の構造**: 記帳の副作用（`git mv` → `specrunner/changes/archive/<dated>-<slug>/`）は worktree 上にのみ存在し、未 merged feature branch に閉じ込められる。`JobStateStore.list` の走査は (a) main checkout（未 merged のため記帳 commit が現れない）と (b) worktree の active `<slug>/`（移動済みで不在）と (c) worktree の archive/（section 2 が `slugEntry.name === "archive"` を skip）のいずれも該当エントリを見つけられず、`matching.length === 0`（"No job found"）になる。

**二次的な問題**: 仮に解決できたとしても、status が terminal な `archived` であるため `runArchiveOrchestrator` の Phase 0 terminal 短絡が no-op を返し、idempotent な再記帳と headSha 再捕捉が走らず、CI-wait の headSha 安全ゲートが失われる。

この状態から回復するには手動 `gh pr merge` + worktree 撤去が必要になっていた。

また Step 2 の crash-resume 判定（`merge-then-archive.ts`）は「PR が MERGED かつ `jobStatus === "archived"`」で「archive 記録済み → merge 後 cleanup resume」と判断していた。D3 を `--with-merge` 経路について改訂して status 遷移を遅延させると、この判定が壊れる。「archive 記録済み」を表す別のシグナルが必要になる。

## 決定

### D1: `--with-merge` 経路では記帳時の `archived` 遷移を遅延する

`runArchiveOrchestrator` に `deferArchivedTransition?: boolean`（default `false`）option を追加する。`true` のとき、記帳フェーズは `git mv` / commit / push / headSha 捕捉をこれまで通り実行するが、`markJobArchived`（`awaiting-archive → archived`）の呼び出しを skip する。`merge-then-archive` の Step 3 のみ `true` を渡す。plain `job archive`（CLI 直呼び）は option 未指定（= `false`）で従来通り記帳時に `archived` を確定する。

**ADR-20260628 D3 との関係**: plain `job archive` 経路については D3 を維持する。`--with-merge` 経路のみ改訂し、「archived は merge 後に初めて到達する状態」という意味論を表現する。

**採用理由**: 記帳後・merge 前の status を非 terminal（`awaiting-archive`）に保つことで、(1) 再解決時に terminal 短絡が発生せず idempotent 再記帳と headSha 再捕捉が走り、(2) archived は merge 完了を表すという意味論が成立する。option default で plain 経路の不変を型レベルで担保する。

**却下案 — 記帳時に `archived` を確定したまま再解決だけ直す**: status が terminal のため再記帳が no-op 短絡し headSha を再捕捉できず、CI-wait の headSha 安全ゲートが失われる。また「archived だが PR 未 merged」という誤解を招く表示が残る。

**却下案 — `markJobArchived` を orchestrator から完全に外し全 caller へ移譲する**: plain 経路の構造を不必要に変える。option 分岐の方が変更 surface が小さい。

### D2: 「archive 記録済み」シグナルを status から change folder の位置へ移す

Step 2 の「記録済みか否か」の判定を `jobStatus === "archived"` から、**change folder が `archive/` 配下にあるか** へ置き換える。`merge-then-archive` の Step 1 を `JobStateStore.list` から `JobStateStore.listWithSourceDirs` へ変更し、解決した最新 state の `sourceChangeDir` を取得する。記録済みシグナルは `path.basename(path.dirname(sourceChangeDir)) === "archive"` で判定する。

これにより Step 2 の 2 分岐は以下のように機能する（区別の意味は不変）:

| PR 状態 | 記録済みシグナル | 扱い |
|---|---|---|
| MERGED | archive/ 配下 | merge 後 resume（`markJobArchived` idempotent → cleanup） |
| MERGED | active `<slug>/` | 順序エラー escalation（merge が記帳より先行） |

**採用理由**: D1 で status を遅延させると `archived` は記録済みの信号として使えない。folder 位置は記帳の副作用そのもの（`git mv` の結果）を直接観測するため、遅延した status に依存しない robust なシグナルになる。schema 追加（専用フラグ）を避けられ変更 surface が小さい。

**却下案 — 専用フラグ（`archiveRecordedAt` 等）を state に追加する**: schema・validation・persist・test の surface が増える。folder 位置で同じ情報が得られるため不要。

**却下案 — `jobStatus === "archived"` を維持する**: D1 と両立しない（status は merge 後まで `awaiting-archive`）。

### D3: `archived` への遷移を post-merge cleanup の直前へ移す（`--with-merge` 経路のみ）

`markJobArchived(slug, recordDir)` を、merge 成功後 cleanup を呼ぶ直前に best-effort で実行する。対象は post-merge cleanup を呼ぶ全経路:

1. Step 2 の MERGED かつ記録済み resume 経路（D2 で検出）。
2. Step 4 wait loop 内の merge-during-wait（他プロセスが merge）経路。
3. Step 5 の fresh merge 成功経路（`postMergeVerify` 設定時は integrity check pass 後）。

`markJobArchived` は idempotent（既 `archived` なら no-op）。best-effort とし、遷移失敗時は warning を出して cleanup を継続する。merge は既に成立しており base を変更済みのため、遷移失敗で command 全体を失敗させない。

**採用理由**: merge が成立した全経路で確実に `awaiting-archive → archived` を行う。integrity check 不通過時は cleanup 前に return するため `markJobArchived` は呼ばれず、status が `awaiting-archive` のまま再実行可能になる（正しい挙動）。best-effort にするのは、merge 成立後に遷移失敗で失敗を返すと利用者が「merge されたのか」を判別できなくなるため。

**却下案 — 遷移を hard-fail にする**: merge 成立後の失敗が command 全体を落とし誤解を招く。再実行時に MERGED+記録済みで再度 cleanup へ進むため実害は少ないが、best-effort + warning が穏当。

**却下案 — 遷移を merge 直後（integrity check 前）に置く**: integrity check 失敗時に status を `archived` にしてしまうと「merge したが検証未了」の状態が terminal 表示になる。

### D4: `listWithSourceDirs` に worktree archive 走査（section 2b）を追加する

`JobStateStore.listWithSourceDirs` の worktree 走査（section 2）に、`opts.includeArchived === true` を条件とする worktree archive 走査（section 2b）を追加する。各 worktree の `specrunner/changes/archive/*/state.json` を走査し、main checkout archive を走査する section 1b と対称に、`parseArchiveDirName` で slug を抽出し `sourceChangeDir` を worktree archive dated dir として compose する。dedup（jobId・newest updatedAt 勝ち）は既存 `tryMerge` に委ねる。

**採用理由**: D1 で status を `awaiting-archive` に保っても、記帳で folder は worktree の archive/ 配下へ移動している。section 2 は archive/ を skip するため、この走査追加なしには記帳後の job を `list()` が発見できず再解決可能性が成立しない。section 1b と対称な追加は原理的に自然で、`includeArchived` gate により影響範囲を section 1b と同一の caller 集合（`resolveId` / archive 経路 / `ps --all` / `job show`）に限定する。`includeArchived: false` の caller（default `ps` / `cancel` / `inbox` / `exit-guard`）は不変。

**却下案 — archive 経路専用の fallback resolver を新設**: 走査ロジックと `sourceChangeDir` 導出を二重化する。`listWithSourceDirs` は既に `sourceChangeDir` を返し `includeArchived` gate を持つため、対称拡張が自然。

**却下案 — git ref 走査で archived-on-branch を探す**: local checkout に無い branch object を走査する複雑さと状態の所在の分散を招くため却下（request architect 判断）。

### D5: 中間 status を新設せず既存遷移を使う

status の集合と遷移表（`src/state/lifecycle.ts` の `VALID_TRANSITIONS`）は不変。`awaiting-archive → archived` の既存遷移をそのまま使い、遷移の timing のみ merge 後へ移す。

**採用理由**: 中間 status は型・遷移表・doctor・reconcile・cancel・ps 等の全消費者へ波及する。timing 変更で目的を達せるため導入しない。

**却下案 — `archive-recorded` 中間 status の新設**: 波及コスト大。また「merge なしで archive-recorded のまま恒久的に残る」状態が生じうる。

## 検討した代替案

### A1: 記帳後の job 解決を feature branch まで広げて archived-on-branch を探す

Step 1 の解決ロジックを拡張し、未 merged feature branch 上の `git ls-tree` で archived-on-branch を探す案。

- **Pros**: status / orchestrator に手を加えない。
- **Cons**: local checkout に無い branch object を走査する複雑さが増す。状態の所在が分散し、どの走査 section がどの checkout を担うか不明瞭になる。
- **Why not**: request architect 判断として明示的に却下。状態を再解決可能に保つ方が単純。

### A2: archive-record（folder-move commit）を merge 後に回す

記帳（`git mv` + commit + push）自体を merge 後に実行し、merge が完了してから archive commit を base へ追記 commit する案。

- **Pros**: status 遷移の問題が生じない（merge 後に記帳するため）。
- **Cons**: archive commit を merge に含める必要があり（ADR-20260628 D2 の 1-PR モデル）、merge 前に feature branch へ commit する順序は不可欠。merge 後に base へ直 push することになり ADR-20260628 の前提「base への直接影響は merge のみ」に違反する。
- **Why not**: request architect 判断として明示的に却下。遷移する「状態」と「記録済みシグナル」だけを設計し、branch commit の順序は変えない。

## 影響

### Positive

- `--with-merge` で merge が失敗しても `archive --with-merge` の再実行で job が解決され、idempotent な再記帳を経て merge を retry できる。手動 `gh pr merge` + worktree 撤去が不要になる。
- 記帳後・merge 前の job が再解決可能な非 terminal 状態（`awaiting-archive`）に留まるため、idempotent 再記帳 + headSha 再捕捉が常に走り、CI-wait の headSha 安全ゲートが維持される。
- 「archived は merge 完了後に初めて到達する状態」という意味論が `--with-merge` 経路で成立する。
- `listWithSourceDirs` の worktree archive 走査追加（section 2b）により、archive 済みだが未 merged の worktree-archive エントリが `ps --all` / `job show` でも可視化される。

### Negative

- `--with-merge` 成功後に merged main の archive folder の `state.json` が `awaiting-archive` を保持する（cosmetic）。D3 の post-merge 遷移は worktree への書き込みのみで、merge 済みの base には到達しない（base への commit は行わないという不変を守るため）。`ps --all` の status 表示に限定的な影響がある。
- worktree archive 走査（section 2b）では worktree ごとに `specrunner/changes/archive/` の readdir が追加されるが、コストは無視できるレベル。

### Known Debt

- **merged main の archived 表現**: `--with-merge` 成功後、merged main の `archive/<dated-slug>/state.json` は `awaiting-archive` を保持する。archival の主シグナルは change folder が archive/ 配下にある事実（D2 と同一原理）であり現時点では許容する。`ps --all` の status 表示を folder 位置に基づいて厳密化する必要が生じた場合は別変更で対応する。
- **merged 済 slug への稀な再実行**: worktree 撤去済みの slug に対して `job archive` を再実行した場合、missing-worktree escalation になり得る。merge は既に完了しており実害は限定的。

## 参照

- Request: `specrunner/changes/archive-recover-unmerged/request.md`
- Design: `specrunner/changes/archive-recover-unmerged/design.md`
- Amends: [ADR-20260628-archive-on-branch-first](2026-06-28-archive-on-branch-first.md) — D3「job status を記帳時点で `archived` に確定させ merge 後経路は status を書き換えない」を `--with-merge` 経路について改訂
- Related: [ADR-20260629-archive-merge-gate-hardening](2026-06-29-archive-merge-gate-hardening.md) — `--with-merge` merge ゲート堅牢化（本変更と同一経路の改善）
- Related: [ADR-20260521-dated-archive-folders](2026-05-21-dated-archive-folders.md) — dated-archive 命名規則（本変更で不変）
- Related: [ADR-20260603-with-merge-wait-until-green](2026-06-03-with-merge-wait-until-green.md) — CI green 待ちロジック（headSha 安全ゲートの担保先）
