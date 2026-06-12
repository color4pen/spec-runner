# inbox の reject が承認ラベルを剥がさず、同一 reject コメントを 5 分毎に積み続ける

## Meta

- **type**: bug-fix
- **slug**: inbox-reject-dedup
- **base-branch**: main
- **adr**: false

## 背景

issue #644 で実証された事象。承認ラベル付き issue の request 生成が validation で reject された際、crontab の inbox run が tick（5 分）毎に同一内容の reject コメントを投稿し続けた（00:50:02 と 00:55:02、いずれも `<!-- specrunner:notification kind="reject" issue="644" version="1" -->` マーカー付き）。

reject コメントの文言自体は「fix the issue body … and **re-apply the approval label**」とラベル再付与を案内しており、**reject 時にラベルを剥がす設計意図**が文言に表れているが、実装はラベルを剥がしていない。結果、reject 対象の issue は毎 tick 再計画され、コメントが無限に積まれる。

## 現状コードの前提

- `src/core/inbox/planner.ts:95-107` — start/reject 計画のスキップ条件は「既に job に link 済みの issue」のみ。reject された issue は job が作られないため、毎 tick 再び reject 対象になる
- `src/core/inbox/run-inbox.ts:204-` — 毎 tick、plan.rejects を順に実行（reject コメント投稿）。承認ラベルの除去処理は存在しない（`removeLabel` 該当なし、grep 確認済み）
- reject コメントは `specrunner:notification kind="reject"` マーカーを持つが、planner はこのマーカーを reject の dedup に使っていない（マーカー参照は `planResumes` の escalation cutoff 判定のみ、`src/core/inbox/planner.ts:134-`）

## 要件

1. reject 実行時に承認ラベルを issue から除去する（コメント文言と実装の一致）。これにより再発火が構造的に止まり、「本文修正 → ラベル再付与」がユーザーの再申請行為として機能する
2. 防御の二層目として、同一 issue の最新 notification が同一 kind="reject" の場合は再コメントしない dedup を planner に入れる（ラベル除去が API 障害等で失敗した tick でも spam しない）
3. ラベル除去に失敗した場合は stderr に warn を出し、次 tick の dedup（要件 2）で抑止される挙動とする

## スコープ外

- reject 理由の自動解消検知（本文が直ったかの判定はユーザーのラベル再付与に委ねる契約を維持）
- start / resume / escalate 経路の通知挙動の変更

## 受け入れ基準

- [ ] reject 実行後に承認ラベルが issue から外れることをテストで固定する
- [ ] ラベル除去が失敗した状態で連続 tick しても reject コメントが増えないこと（dedup）をテストで固定する
- [ ] ラベル再付与後の tick で start が計画されることをテストで固定する
- [ ] `typecheck && test` が green

## 関連

- 実証: issue #644 の reject コメント連投（2026-06-12 00:50 / 00:55）