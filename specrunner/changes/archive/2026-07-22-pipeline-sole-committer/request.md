# pipeline を唯一の committer にする — 検査モデルから合成モデルへ

## Meta

- **type**: spec-change
- **slug**: pipeline-sole-committer
- **base-branch**: main
- **adr**: true

## 背景

write-set の commit 境界強制は「agent の効果を後追いで検査する」モデルで実装されてきたが、検査面の外側が繰り返し発見されている(実証済みの残存 2 経路: ①許可外ファイルを事前 stage すると scoped commit には混入しないが index に残存し、後続 `commitFinalState` の裸 `git add -A` が次 commit に取り込む ②parallel custom reviewer が正典を弱化して自己 commit すると、round の検査は worktree 変更しか見ないため素通りし、HEAD が弱化 commit に前進したまま後続 push の祖先として remote に到達する)。

検査モデルは「agent が git の全能力を持つ」前提の上の blocklist であり、効果の隠れ場所の列挙は構造的に収束しない。本変更は信頼モデルを転換する: **push される歴史は pipeline が構成した commit のみ**とし、agent 著の commit は歴史に残さない。個別経路の検査は「合成」と「単一 egress での照合」に置き換わり、敵対的レビューの対象が有限になる。

## 現状コードの前提

- `src/core/step/commit-push.ts:498` — guarded mode の staging は裸の `git add -A`(index 全体)
- `src/core/step/commit-push.ts:561` — `commitFinalState`(checkpoint / finalize)の staging も裸の `git add -A`。scoped commit が除外した index 残存エントリをここが回収し、次 commit に混入させる(実 git で再現済み)
- `src/core/step/commit-push.ts:242,267` — agent 自己 commit の push-as-is 経路(範囲検査後に agent 著 commit をそのまま push する)
- `src/core/pipeline/parallel-review-round.ts` — fan-out 前後の HEAD 差分検査が存在しない。round の未宣言変更検査は worktree 変更のみを対象とする(自己 commit で worktree が clean になると素通り。実 git で再現済み)
- `src/core/step/commit-orchestrator.ts:464` — 並列 round の commit は `commitRound` に集約されている
- scoped residual 検査の `git status` 失敗は黙って続行され、`git clean` / `git checkout` の失敗も検査されない(fail-open)
- StepRun には commit 後の `commitOid` が state に記録される(合成 commit 集合の正として利用可能)
- `src/util/paths.ts:75` — `biteEvidenceResultPath` が存在する。bite-evidence(CLI step)は result md を書くが自 step の commit を持たず、dirty 残留が round guard を誤発火させる既知回帰がある(#888)
- 過去の必要性が消える検査群: 自己 commit 範囲検査(tail 冒頭)・push-as-is・scoped residual restore は、本変更後は「agent commit が歴史に存在しない」ため存在理由を失う

## 要件

### R1: sequential step の commit 合成

1. step 完了時、pipeline は **headBeforeStep を起点に commit を合成**する。agent が自己 commit していた場合は mixed reset(作業内容は worktree に保持、歴史からは除外)で起点に戻してから合成する。push-as-is 経路は廃止する。
2. 合成対象パス: scoped step は宣言 writes + pipeline 管理パス(state.json / events.jsonl / usage.json / 各 result md。**bite-evidence-result.md を含める** — #888 の残留回帰を同時に解消する)。guarded step は実変更を列挙し、write-scope allowlist で検証(違反 → 退避 + fail-closed halt)した上で**明示パス列挙**で commit する。
3. staging は全経路で明示パス指定とし、裸の `git add -A` を全廃する。

### R2: commitFinalState の限定

checkpoint / finalize の commit 対象を pipeline 管理パスのみに限定する。agent の未 commit 作業内容は checkpoint に含めない(local worktree に残存し、local resume で継続可能 — 現行の local-first 運用と整合)。

### R3: parallel round の HEAD guard

fan-out 前に HEAD を記録し、round 終了後に HEAD が前進していれば違反とする(reviewer round は read-only であり、前進自体が違反)。違反時は commit range の diff を退避し、mixed reset で起点へ復帰して escalation halt する(fail-closed)。

### R4: egress(push 直前)の系列照合

push が新規に公開する範囲の全 commit が、state に記録済みの pipeline 合成 commitOid 集合に含まれることを検証する。未知の commit を含む場合は push せず halt する。位置づけ: agent 偽装への壁ではなく(壁は R1 / R3 の reset + 合成)、**合成漏れ・harness 欠陥の backstop**。operator の手 commit は operator 自身が手 push する現行運用のままとし、pipeline の公開範囲に混入した未知 commit は fail-closed に倒す。

### R5: git 操作失敗の fail-closed 化

合成・復帰経路の git 操作(status / clean / checkout / reset / add / commit)の失敗を黙殺せず、halt に倒す。現行の scoped residual における status 失敗の黙殺・restore 失敗の黙殺を解消する。

### R6: 実 git E2E

1. scoped step の実行前に許可外ファイル(例: src/secret.ts)を stage → step commit にも checkpoint / finalize commit にも混入せず、push 系列の祖先にも存在しないことを実 git で検証する。
2. parallel reviewer 実行中に request.md を弱化して自己 commit → round が違反 halt し、弱化 commit が branch の push 系列に存在しないことを実 git で検証する。

## スコープ外

- SDK permission 層での agent git 実行・書込の遮断(別 request。本変更の多重防御として後続)
- Git / GitHub credential の権限分離(別 track)
- managed runtime の commit 層(別 adapter。挙動不変)
- #890(保護正典への fixable finding の routing)
- 既存 remote 履歴の遡及検証

## 受け入れ基準

- [ ] R6-1 / R6-2 の実 git E2E が green(v23 で再現された 2 経路の封鎖証明)
- [ ] agent 自己 commit(正当な内容)後の step で、push された歴史に agent 著 commit が存在せず、同内容が pipeline 合成 commit として記録されることをテストで固定する(作業内容の無損失)
- [ ] guarded step の実変更列挙が「agent の正当な変更を 1 ファイルも落とさない」ことをテストで固定する(untracked 新規ファイル・削除・rename を含む)
- [ ] 裸の `git add -A`(パス指定なし)が src/ に存在しないことを静的テストで固定する
- [ ] round 中の HEAD 前進が escalation halt になり、退避証跡が生成されることをテストで固定する
- [ ] egress 照合: 公開範囲に state 未記録の commit を含む push が halt することをテストで固定する
- [ ] git 操作失敗(status / reset / checkout)の注入で halt になることをテストで固定する(黙殺しない)
- [ ] bite-evidence-result.md が合成 commit に取り込まれ、round guard の誤発火(#888 の症状)が発生しないことをテストで固定する
- [ ] revision 束縛(commitOid 照合)・canonHash 束縛の既存テストは無改変で green(commitOid の意味論不変の証明)
- [ ] 検査モデル前提の既存テスト(自己 commit 範囲検査・push-as-is・residual restore の期待)は合成モデルの期待に更新する(対象を design で列挙)
- [ ] 修正前の挙動(裸 add -A / push-as-is / HEAD guard なし)に戻すと該当テストが fail することを破壊確認として記録する
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **採用: mixed reset + 合成**。agent の作業内容(worktree)は保持し、歴史だけを pipeline 所有にする。検査モデルの「効果の隠れ場所の列挙」を、合成モデルの「構成の正しさ 1 点」に置き換える。
- **採用: 合成 commit の識別は state 記録の commitOid 集合**。commit message や trailer による識別は agent が偽装可能であり、egress 照合の正は state(agent が書けない領域)に置く。
- **却下: 自己 commit の cherry-pick / 検査による選別** — 検査モデルの継続であり、経路列挙の非収束問題が残る。
- **却下: hard reset** — agent の正当な作業内容を破壊する。mixed reset で歴史と内容を分離する。
- **却下: checkpoint の add -A 維持** — v23 で実証された混入経路そのもの。checkpoint の目的(resume 用の pipeline 状態公開)に対し agent 未 commit 内容の同梱は過剰であり、local resume は worktree 残存で足りる。
