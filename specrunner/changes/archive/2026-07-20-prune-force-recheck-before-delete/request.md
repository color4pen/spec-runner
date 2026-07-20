# job prune --force に削除直前の再検証を入れる — scan 後に active 化した sidecar の削除競合を塞ぐ

## Meta

- **type**: spec-change
- **slug**: prune-force-recheck-before-delete
- **base-branch**: main
- **adr**: false

<!-- 既存 prune の削除経路への再検証追加であり、新しい設計要素は無い。「active な sidecar には触れない」保証の強化のため spec-change -->

## 背景

`job prune --force` は scan で得た orphan sidecar のリストをそのまま削除する。scan から削除までの間に同じ slug の job が active になった場合（`job start` / resume の並走）、active になった sidecar を削除する競合余地がある（TOCTOU）。「active な job の sidecar には dry-run でも --force でも触れない」という保証が、scan 時点のスナップショットにしか効いていない。

sidecar には実行中プロセスの liveness（pid / worktreePath / jobId）が入るため、誤削除は実行中 job の監視・resume 系機能を壊す。

## 現状コードの前提

- `src/core/prune/sidecar-runner.ts` — `pruneOrphanSidecars` は Step 1 で `scanOrphanSidecars` を呼び、Step 4（`--force`）で scan 結果の各 `sidecarPath` を `fs.rm(recursive, force)` で削除する。scan と rm の間に再判定は無い
- `src/core/sidecar/orphan.ts` — orphan 判定 `isOrphanSidecar(deps, slug, sidecarDir)` は単体で呼べる形で export されている。判定は state.json の status（`ACTIVE_STATUSES` = running / awaiting-resume / awaiting-archive / failed / terminated は非 orphan）と、main / worktree 双方の state 不在で決まる
- `pruneOrphanSidecars` の deps は `SidecarPruneFs`（`SidecarScanFs` + `rm`）で注入されており、テストから I/O を完全に制御できる
- 削除は best-effort（個別失敗は warning に積んで続行）で、この方針は維持対象

## 要件

1. **削除直前の再判定**: `--force` の削除ループで、各 sidecar について削除の直前に `isOrphanSidecar` を再評価する。再評価で orphan でなくなっていた場合は削除せず skip し、その旨を warning（または info）として出力に含める（slug と理由）。
2. **保証の残余リスクを設計に明記する**: 再判定と rm の間にも原理的な競合窓が残る。slug 単位ロック（run / resume / prune 共通）を導入するか否かを設計で判断し、導入しない場合は残余窓の幅と影響（liveness 消失時の実挙動）を design.md に明記する。本 request の必須要件は再判定であり、ロックの導入は設計判断に委ねる。
3. **既存挙動の維持**: dry-run の挙動・orphan 削除の best-effort 方針・exit code 規約（成功/no-op = 0、hard scan failure = 1）・出力形式は変えない。再判定による skip は失敗扱いにしない（exit 0 のまま）。

## スコープ外

- worktree 側 prune（`pruneOrphanWorktrees`）への同種対応（sidecar と異なり `git worktree` 管理下で削除経路が別。必要なら別 request）
- orphan 判定基準（`ACTIVE_STATUSES`）の変更
- doctor 側 check の変更

## 受け入れ基準

- [ ] **T1（競合の再現と防止）**: scan 完了後・削除前に対象 slug の state を active に変化させる fixture（deps 注入で状態遷移を再現）で、`--force` がその sidecar を削除せず skip し、skip が出力に現れることを固定する。**破壊確認**: 再判定を外すと本テストが「削除されてしまう」ことで落ちること。
- [ ] **T2（orphan のままなら削除）**: 再判定でも orphan のままの sidecar は従来どおり削除されることを固定する（再判定追加による誤 skip の回帰防止）。
- [ ] **T3（既存挙動の維持）**: dry-run が再判定を伴わず列挙のみであること、削除の best-effort（個別 rm 失敗で継続）、exit code 規約が従来どおりであることを固定する。既存の `sidecar-runner.test.ts` / `prune-combined.test.ts` は無変更で green（skip 出力の追加に伴う期待更新を除く）。
- [ ] **T4**: `typecheck && test` が green。

## architect 評価済みの設計判断

- **削除直前の per-slug 再判定**。→ 却下: scan 全体の再実行（窓は狭まるが per-slug の直前性が無く、リスト先頭の削除中に末尾が active 化するケースを塞げない）。
- **ロック導入は設計判断に委ね、必須要件にしない**。→ 却下: 本 request でロックまで必須化（run / resume / prune の 3 経路に跨る変更となりスコープが跳ね、再判定だけで実用上の窓は大幅に狭まる。厳密保証の要否は残余リスクの明記を見て別途判断する）。
- **skip は warning 扱いで exit 0**。→ 却下: skip で exit 非ゼロ（「消すべきでないものを消さなかった」は正常動作であり、cron 等での誤アラートを生む）。
