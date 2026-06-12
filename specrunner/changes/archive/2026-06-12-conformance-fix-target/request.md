# conformance の needs-fix に戻り先 step を導出させ、空振りの implementer 再入を解消する

## Meta

- **type**: spec-change
- **slug**: conformance-fix-target
- **base-branch**: main
- **adr**: true

## 背景

conformance が needs-fix を返すと一律 implementer に戻る。しかし conformance の findings は性質が異なり、「spec 自体の漏れ」を implementer が直せず空振りするケースが実際に発生している（issue #561、#560 では conformance が tasks.md に無い問題を見つけたが implementer が 2 回空振りした）。問題の性質に応じて implementer / code-fixer / spec-fixer のいずれかへ戻すルーティングが必要。

## 現状コードの前提

- 遷移表: `src/core/pipeline/types.ts:173-174` — `CONFORMANCE on approved → ADR_GEN` / `on needs-fix → IMPLEMENTER` の 2 エントリのみ。
- conformance は paired fixer を持たない loop step で、`src/core/pipeline/types.ts:116-117` に `CONFORMANCE_RETRIES_EXHAUSTED` の打ち切り予算を持つ。
- verdict は agent の自己申告ではなく CLI が findings から導出する契約（R7）: `src/core/step/judge-verdict.ts:32-40` の `deriveJudgeVerdict` が severity / resolution から approved | needs-fix | escalation を決める。`src/core/step/report-tool.ts:95` に「approved field は routing に使われない」と明記。
- findings の要素型は `{ severity, resolution, file, line?, title, rationale }`（`src/kernel/report-result.ts`）。戻り先を表すフィールドは存在しない。
- 動的 findings 注入の既存パターン: `src/core/step/build-fixer.ts:76` の `enrichContext` が verification-result を実読みして fixer の context に注入する。
- 遷移表は (step, outcome) キーのため、戻り先 step の完了後フローは各 step の既存遷移が引き受ける（code-fixer → code-review、spec-fixer → spec-review、implementer → verification）。新しい後続遷移の定義は不要。

## 要件

1. conformance の findings 要素に戻り先を表すフィールド（例: `fixTarget: "implementer" | "code-fixer" | "spec-fixer"`、省略時 implementer）を追加し、conformance の report tool schema と prompt に「問題の性質と戻り先の対応」を指示する。
2. CLI 側の verdict 導出を拡張し、needs-fix 時の戻り先を findings の fixTarget から集約導出する（複数 target が混在する場合の優先則を定義する。例: spec-fixer > implementer > code-fixer — spec の誤りは下流の修正を無効化するため最優先。優先則の確定は design に委ねる）。agent の宣言値を直接 routing に使わず、CLI 導出を維持する（R7 契約の維持）。
3. 遷移表に `CONFORMANCE on needs-fix:implementer / needs-fix:code-fixer / needs-fix:spec-fixer` の 3 エントリを追加する（既存 `needs-fix` エントリの扱い — 残置か置換か — は後方互換の観点で design が決める）。
4. 戻り先 step（implementer / code-fixer / spec-fixer）が conformance findings を読めるよう、`enrichContext` の既存パターンで findings を注入する。
5. 収束予算の整合: 3 方向どの戻り先を経由しても `CONFORMANCE_RETRIES_EXHAUSTED` の単一予算で打ち切られること。戻り先 step 側の loop 予算（spec-review / code-review ループ）との二重カウントを設計で明確化する。
6. resume 互換: 既存ジョブ記録（旧 needs-fix outcome を持つ history）が resume で壊れないこと。

## スコープ外

- design step への戻り（コストが高く、実需を見極めてから別途検討 — issue 本文の判断を踏襲）
- 他の judge step（spec-review / code-review）への fixTarget 導入（conformance のみ）
- conformance の findings 品質そのものの改善

## 受け入れ基準

- [ ] conformance の findings に fixTarget を含めた場合、導出された戻り先 step へ遷移することを 3 方向すべてテストで固定する
- [ ] fixTarget 省略時（既存挙動相当）は implementer に戻ることをテストで固定する
- [ ] 複数 fixTarget 混在時の優先則をテストで固定する
- [ ] 戻り先 step の context に conformance findings が注入されることをテストで固定する
- [ ] conformance ループの打ち切り（CONFORMANCE_RETRIES_EXHAUSTED）が 3 方向いずれの経由でも発火することをテストで固定する
- [ ] 旧形式 history を持つ state の resume が成功する後方互換テストが green
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **採用**: findings への fixTarget 付与 + CLI 集約導出。routing の最終決定を CLI に残し（verify-don't-trust / R7 契約維持）、agent には「問題の性質分類」という semantic content だけを委ねる。
- **却下: agent が outcome 値（needs-fix:implementer 等）を直接宣言する案**（issue 本文の原案） — verdict 導出を CLI が持つ R7 契約と矛盾し、agent の自己申告が routing を直接決める経路を新設してしまう。outcome 値の分割自体は採用するが、値は CLI が findings から導出する。
- **却下: 戻り先ごとに新しい後続遷移を定義する案** — 遷移表が (step, outcome) キーである以上、戻り先 step の既存遷移が後続フローを引き受けるため不要。定義の重複は drift の温床になる。
