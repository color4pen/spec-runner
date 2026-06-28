# archive をブランチ上で先に実行し、base への直接影響を merge のみに限定する

## Meta

- **type**: spec-change
- **slug**: archive-on-branch-first
- **base-branch**: main
- **adr**: true

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

## 背景

`job archive` は archive 記帳（change folder の移動 + job status 遷移）を **base ブランチに直接 commit + push** する。`--with-merge` は merge を付け足すだけのオプションで、merge 有無にかかわらず archive 記帳は base を直に叩く。

この振る舞いには非対称性がある。merge は CI green を待ち PR フローを通って base に入る（branch protection を尊重）一方、archive 記帳だけが PR を通らず base へ直 push される。結果として:

- base へ直接影響を与える経路が merge 以外に存在する（branch 規律違反）。
- base が protected な環境では archive 記帳の直 push が reject され、archive が完了できない。`--with-merge` の場合は「PR は merged だが記帳が base に乗らない」中途半端な状態になる（`specrunner/adr/2026-06-03-archive-command-client-closed.md` が Known Debt として記載済み）。

base への直接影響を **merge のみ** に限定し、archive 記帳は merge される feature branch（作業ブランチ）上で先に行う設計へ変更する。

## 現状コードの前提

- `src/core/archive/orchestrator.ts:164` で `git checkout baseBranch`、`src/core/archive/orchestrator.ts:249` で `git push origin baseBranch` を実行し、archive 記帳コミット（`chore: archive <slug>`）を base へ直 push する。
- 上記 orchestrator は `--with-merge` 有無の両方で実行される。`src/core/archive/merge-then-archive.ts:434`（merge 成功後）/ `:161` `:257`（既 merge 検出時）が `runArchiveOrchestrator` を呼ぶ。merge なしの `job archive` は CLI から直接 `runArchiveOrchestrator` を呼ぶ。
- change folder の移動は `src/core/finish/archive-change-folder.ts:47-52` で `changes/<slug>` → `changes/archive/<YYYY-MM-DD>-<slug>` への `git mv`。
- worktree 撤去と feature branch 削除は `src/core/archive/orchestrator.ts:264-313`（Phase 2）で archive 記帳の後に実行される。
- baseBranch は `src/cli/archive.ts:111-135` で request.md から導出され、取得不能時のみ `"main"` にフォールバックする。

## 要件

1. merge なしの `job archive <slug>` は archive 記帳（change folder 移動 + status 遷移）を **feature branch 上で commit し、remote feature branch へ push** する。base ブランチに対する `git checkout` / `git commit` / `git push` を一切行わない。記帳コミットは既存の feature PR に含まれる。
2. `--with-merge` は archive 記帳が feature branch に乗った後、**CI が green になるのを待ってから** PR を squash merge する。merge により feature 変更と archive 記帳が同時に base へ入る（PR フロー経由・protection 尊重）。
3. base ブランチへ直接影響を与える経路を merge のみに限定する。archive 記帳の base 直 push を含め、merge 以外で base を変更する経路を撤去する。
4. worktree / feature branch のクリーンアップは **merge 完了後にのみ** 実行する。merge を伴わない `job archive` では PR がまだ生きているため feature branch を削除しない。
5. status lifecycle を見直し、「archive 記帳を feature branch に乗せた段階」と「merge 完了で terminal（archived）になる段階」を区別する。`archived` には merge が事実になった後にのみ到達する不変を保つ（`archived` かつ未 merge の状態を作らない）。
6. 冪等性を保つ。archive 記帳が既に feature branch に存在すれば再実行は no-op。`--with-merge` で既に merged なら cleanup のみ実行する。中断後の再実行で回復できる。

## スコープ外

- change folder の dated-archive 命名規則 `<YYYY-MM-DD>-<slug>`（`specrunner/adr/2026-05-21-dated-archive-folders.md`）は変更しない。
- archive 専用 PR を作る 2-PR モデルには戻さない。merge は既存の feature PR 1 本に相乗りさせる。
- merge 方式（squash）は変更しない。
- archive 記帳を git commit にせず status フラグのみで表現する案（物理移動の廃止）は本 request では扱わない。

## 受け入れ基準

- [ ] merge なしの `job archive` が base ブランチに対する `git checkout` / `git commit` / `git push` を一切行わないことをテストで固定する。
- [ ] `job archive` 実行後、archive 記帳コミットが feature branch 上に存在し remote feature branch へ push されていることをテストで固定する。
- [ ] base が protected で直 push 不可な環境を模したケースで、merge なしの `job archive` が成功することをテストで固定する。
- [ ] `--with-merge` が CI green を待ってから merge し、merge 成功後にのみ worktree / branch cleanup を行うことをテストで固定する。
- [ ] merge 完了前に status が `archived` にならないことをテストで固定する。
- [ ] archive 記帳済み feature branch に対する `job archive` 再実行が no-op であることをテストで固定する。
- [ ] `typecheck && test` が green。

## architect 評価済みの設計判断

- **採用**: archive 記帳を feature branch 上で実行し、base への到達経路を PR merge のみに限定する。archive と merge の step 分離（merge はオプション）は維持する。
- **却下A — 現状維持（base 直 push）**: branch 規律に反し、protected base で archive が完了不能になる。`2026-06-03-archive-command-client-closed.md` が Known Debt として認識済みの構造。
- **却下B — archive 専用 PR（2-PR モデル）**: PR 一覧の汚染とマージ順序依存の不整合を再導入する（`specrunner/adr/2026-05-02-finish-1pr-model.md` が解消した問題の逆行）。
- **却下C — archive を git commit にせず status フラグのみで表現**: dated-archive-folders を巻き戻し、slug 再利用時の衝突回避を再設計する必要があり、本 request のスコープを超える。
- **トレードオフ（design / spec-review で精査すること）**: 本変更は `2026-06-03-archive-command-client-closed.md`（ADR-20260603）が確立した「archive を GitHub merge から切り離し client-closed・offline・決定的に完走させる」性質を一部後退させる。archive 記帳が remote feature branch への push を要し、`--with-merge` が merge 待ちと結びつくためである。この後退を受容する根拠は「base への直接影響を merge のみに限定する」branch 規律を上位の要件に置くこと。ADR-20260603 を supersede する新 ADR を生成し、status lifecycle の再設計（要件 5）と冪等性（要件 6）を design で確定すること。
