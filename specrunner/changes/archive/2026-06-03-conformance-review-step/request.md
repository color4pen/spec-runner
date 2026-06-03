# 実装が request を達成したかを確認する conformance review step を追加する

## Meta

- **type**: new-feature
- **slug**: conformance-review-step
- **base-branch**: main
- **adr**: true

## 背景

pipeline には「実装が実際に request を達成し、spec を満たし、tasks を完了し、design に沿っているか」を確認する gate が無い。verification は機械的（build / test / test-coverage）、code-review はコード品質の視点、spec-review は spec 自体の品質の視点で、いずれも **upstream artifact に対する実装の達成・整合**を判断していない。tasks 完了は implementer の self-report に留まる。

最終 acceptance gate として、code-review の後に判断ベースの conformance review step を置く。

## 要件

1. 新 step `conformance`（LLM 判断のレビュー step）を pipeline に追加し、**code-review の後・adr-gen の前**に置く。code-review が完了（approved）したコードに対して実行する。現状 adr-gen へ直行する 2 辺（`code-review approved (no fixable)` と `code-fixer approved`（observation-fix 完了））を conformance に付け替え、**adr-gen へは `conformance approved` のみが到達**するようにする。
2. conformance は実装を upstream artifact に照らして次の 4 点を判断する: `tasks.md` が全完了か、`design.md` 通りか、`spec.md` が満たされているか、`request.md` を達成できたか。
3. conformance は verdict を出す。approved の場合のみ adr-gen に進む。
4. needs-fix の場合は `implementer` に戻す（既存の transition `to:` 後方ジャンプを利用）。implementer → verification → code-review → conformance と再循環し、code-review の指摘修正を含む最終コードで再判断する。違反のレベル分類・分岐は行わず一律 implementer に戻す。
5. conformance を loop step として登録し、反復上限を超えたら escalate する（implementer で直らない＝ upstream が誤りのサインを human に上げる安全網）。
6. code-review が読む spec の参照を是正する: stale な `specs/`（旧 capability 分割 path）参照を `spec.md` に直す（`code-review-system.ts`）。`test-cases.md` は既に code-review の入力に含まれているため追加変更は不要。

## スコープ外

- spec の各 Scenario が test 化されたかを照合する spec→test 網羅 gate（別 hardening）。

## 受け入れ基準

- [ ] pipeline に `conformance` step が存在し、code-review approved の後に実行される
- [ ] conformance が tasks / design / spec / request の 4 点を判断して verdict を出す
- [ ] `conformance approved → adr-gen` と `conformance needs-fix → implementer` の transition が存在する
- [ ] adr-gen へ入る遷移は `conformance approved` のみ（code-review / code-fixer から adr-gen への直行辺が無い）
- [ ] conformance が loop step として反復上限を持ち、超過で escalate する
- [ ] code-review が `spec.md`（正しい path）を読む
- [ ] `bun run typecheck && bun run test` が green

## architect 評価済みの設計判断

- conformance は **code-review の後**（最終 acceptance gate）。code-review の指摘が修正済みの最終コードを判断対象にするため。code-review より前に置くと未修正コードを判断することになり不完全。
- 違反は **一律 implementer に戻し**、code-review ループに再突入して再判断する。implementer で直らない（upstream の design / spec / request が誤り）ケースは **loop exhaustion → human escalate** で吸収する。conformance 側で違反レベルを分類・routing しない（判断場面を増やさない）。
- 実装は既存機構を再利用する: `Transition`（任意 step への `to:` 後方ジャンプ ＝ `spec-fixer→spec-review` 等と同型）と loop guard（`loopNames` ＋反復上限＋ exhaustion）。新規の loop 機構は追加しない。
