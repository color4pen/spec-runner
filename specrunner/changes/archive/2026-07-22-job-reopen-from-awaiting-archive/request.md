# awaiting-archive job の正規 reopen — 指定 step 以降の承認を失効させて再検証する

## Meta

- **type**: new-feature
- **slug**: job-reopen-from-awaiting-archive
- **base-branch**: main
- **adr**: true

## 背景

人間レビューで merge 前の PR に修正が発生するのは例外ではなく正規ユースケースだが、現在の FSM は `awaiting-archive` からの合法遷移を archived / canceled のみに限定しており、post-review 修正を正規 pipeline で再検証する経路が存在しない。

- `job resume --from <step>` は `awaiting-archive → running` を FSM guard で拒否する
- `job cancel` は remote branch を削除するため PR が破壊され、fix-forward に使えない
- 実例: 人間レビュー指摘による手直し後、現 revision への証跡（spec-review / test-case-gen / verification / code-review）を再生成する手段が無く、operator override（state.json の status 1 項目の手動変更、PR コメントへの事前記録）による break-glass 復旧を要した run が存在する

`awaiting-archive → running` の常時許可では**なく**、明示的な reopen 操作として設計する。

## 現状コードの前提

- `src/state/lifecycle.ts:39` — `["awaiting-archive", new Set(["archived", "canceled"])]`。running への遷移は存在しない
- 承認の revision 束縛は導入済み: `conformanceApprovedForVerifiedRevision`（`src/core/pipeline/reverification.ts`、commitOid 照合・fail-closed）と `selectPendingMembers` の `approvedAtCommit` 照合（`src/core/pipeline/reviewer-status.ts`）。reopen 後に新 commit が積まれれば stale 承認は routing で自動失効する
- StepRun には `commitOid` が打刻される（agent step は commit 後 HEAD、CLI step は entry HEAD）
- 証跡は iteration 別ファイル（`*-result-NNN.md` / `review-feedback-NNN.md`）と events.jsonl（append-only）で保存される
- resume 系の CLI 経路は `job resume <slug> [--from <step>] [--prompt <text>]` が既存（`src/core/command/` 配下）
- write-scope enforcement 導入済み: 違反変更は commit されず halt する（`src/core/step/commit-push.ts`）

## 要件

1. **明示コマンド**: `job reopen <slug> --from <step> --reason <text>` を追加する。`--from` と `--reason` は必須。
2. **前提条件（拒否）**: 対象 job の PR が**未 merge** であること。merged の PR を持つ job、および status が archived / canceled の job への reopen は拒否する（明確なエラーメッセージで exit ≠ 0）。
3. **FSM**: reopen は `awaiting-archive → running` の遷移を **reopen 操作経由でのみ**許可する。既存の resume 経路（`job resume`）からは引き続き拒否する（常時許可にしない）。
4. **証跡の保存**: 旧証跡（review / verification / attestation / journal / events.jsonl）を上書き・削除せず、再実行は新しい iteration として追加する。
5. **承認の失効**: 指定 step 以降の承認・revision binding を invalidate する。実装は導入済みの revision 束縛と整合させる（例: reviewer status の approvedAtCommit / conformance 承認が reopen 後の再実行で再利用されないことを保証する。stale 化が commitOid 照合で自動成立する場合はそれを歯で固定し、成立しない経路があれば明示的に失効させる）。
6. **branch / PR の保持**: remote branch と PR を保持する（cancel 系 cleanup を発動しない）。
7. **operator event**: reopen 操作自体を journal へ operator event として記録する（reason・from step・実行時刻を含む）。
8. **runtime 非依存**: local / managed 双方で同じ契約とする。
9. **minimumAssurance 非依存**: floor 設定の有無に依存しない。

## スコープ外

- archived / canceled からの復帰（reopen は awaiting-archive 専用）
- merge 済み PR の revert / follow-up フロー
- inbox / issue 連携での reopen 自動発火
- 承認 record の削除・書き換え（record は不変。失効は判定側で行う）

## 受け入れ基準

- [ ] awaiting-archive（PR open）の job を reopen → 指定 step から再実行 → 新 iteration の証跡が旧証跡を上書きせず追加されることをテストで固定する
- [ ] merged PR を持つ job / archived / canceled の job への reopen が拒否されることをテストで固定する
- [ ] reopen の operator event（reason 含む）が journal に記録されることをテストで固定する
- [ ] reopen 後の再実行で revision binding が新 revision に張り直されること（stale 承認が routing に再利用されないこと）をテストで固定する
- [ ] `job resume` 経由では引き続き awaiting-archive → running が拒否されることをテストで固定する
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **採用: 明示的 reopen コマンド**（常時許可ではなく）。awaiting-archive は「証跡が現 revision に対して完結した」状態であり、そこからの再開は operator の明示判断・記録を伴うべき遷移。--reason 必須と journal 記録で運用監査可能にする。
- **採用: 失効は revision 束縛との整合で実現**。承認の再利用防止は導入済みの commitOid 照合が既に担う設計であり、reopen 側で record を書き換えない（証跡不変の原則）。照合が及ばない経路が実装調査で見つかった場合のみ明示的失効を追加する。
- **却下: job cancel + 再 run** — remote branch / PR が破壊され、レビュー文脈（コメント・履歴）が失われる。
- **却下: resume の guard 緩和（awaiting-archive → running を常時許可）** — 無条件の再開は operator の判断記録なしに証跡完結状態を壊せるため、明示操作に限定する。
