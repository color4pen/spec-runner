# プロジェクト定義のカスタムレビューワー step を宣言的に追加できるようにする

## Meta

- **type**: new-feature
- **slug**: custom-reviewers
- **base-branch**: main
- **adr**: true

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

## 背景

レビュー観点のカスタマイズ手段は specrunner/rules/（既存 step への観点追加）のみで、独立した収束ループ・別 prompt・別 maxIterations を持つレビューレンズ（セキュリティ監査、API 後方互換、ドメイン固有の検査など）をプロジェクト側から追加できない。main の code-review prompt に観点を足し続けると prompt が肥大して両方の精度が下がる。

judge step の契約は標準化済みである — どの judge も「findings 配列を返し、verdict は CLI が導出し、blocking findings は実在検証され、needs-fix は fixer ループ、decision-needed は escalation」という同一の枠で動く。このためカスタムレビューワーはコードではなくデータ（名前 + system prompt + 設定）として宣言できる。

## 現状コードの前提

- judge の findings 契約と verdict 導出は `src/core/step/judge-verdict.ts`（純関数）と `JUDGE_REPORT_TOOL`（`src/core/step/report-tool.ts`）に集約されている
- findings の実在検証は RuntimeStrategy の seam（`verifyFindingRefs`）として local / managed 両対応済み
- step の合成は `src/core/pipeline/registry.ts` と `run.ts` の step Map、遷移は `src/core/pipeline/types.ts` の `STANDARD_TRANSITIONS`、ループは `loopFixerPairs`（`types.ts:41`）で定義される
- step ごとの知識注入機構として `specrunner/rules/<step>/` と `resolveStepRules`（`src/core/step/executor.ts`）が存在する
- fixer → review の逆引きは `loopFixerPairs` の entries に対する `.find()` で最初の対を返す実装であり（`src/core/pipeline/pipeline.ts:356-357`）、複数の review step が同一 fixer を共有することを想定していない。fixer 共用（要件 2）はこの逆引きの多対一対応への拡張を伴う

## 要件

1. 宣言形式: `specrunner/reviewers/<name>.md` にカスタムレビューワーを定義する。frontmatter で name / maxIterations / model（任意）を、本文で system prompt を宣言する。リポジトリにコミットされる成果物とし、レビュー可能にする
2. 実行位置と配線: カスタムレビューワーは code-review の後に宣言順で直列に実行される。verdict は既存の judge 契約をそのまま使う — findings から CLI が導出し、needs-fix は code-fixer との既存ループ機構（loopFixerPairs 相当）で収束させ、decision-needed を含む場合は escalation する
3. load-time validation: job start 時に reviewers/ の全定義を検証し（frontmatter 必須項目、maxIterations の範囲、prompt 本文の非空）、不正があれば pipeline を開始せずエラーで停止する。壊れた定義で途中まで走らない
4. 既定はゼロ個: reviewers/ が空または不存在のとき、pipeline の構成・挙動・出力が現行と完全に一致する
5. findings の出所識別: カスタムレビューワーの findings・結果ファイル・state 記録は reviewer 名で識別でき、code-fixer への prompt 埋め込みでもどの reviewer の指摘かが区別できる
6. 実在検証・実在しない参照の escalation・`ok: false` の escalation など、組み込み judge と同一の防御がカスタムレビューワーにも適用されることをテストで固定する

## スコープ外

- creator 側（implementer / design）のカスタム step
- カスタム fixer（fixer は code-fixer を共用する）
- reviewer 間の並列実行・順序の依存宣言
- spec フェーズ（spec-review 前後）への挿入
- マーケットプレイス的な reviewer 配布機構

## 受け入れ基準

- [ ] reviewers/ に 1 件定義すると code-review の後にその judge が実行され、findings 契約（CLI 導出・実在検証・fixer ループ・escalation）が組み込み judge と同一に機能する（mock でテスト）
- [ ] reviewers/ が空・不存在のとき既存テストが無変更で green（挙動完全一致）
- [ ] 不正な定義（必須項目欠落・空 prompt）で job start が実行前に停止する
- [ ] 複数 reviewer が宣言順に直列実行される
- [ ] code-fixer を複数 reviewer が共有しても、exhaustion の iteration 予算が reviewer ごとに独立して正しく数えられる（fixer → review 逆引きの多対一対応）
- [ ] code-fixer が受け取る findings に reviewer 名の識別が含まれる
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- カスタムレビューワーをコードの拡張点（plugin API）ではなくデータ（markdown 宣言）として定義する。judge 契約が CLI 側に標準化されているため、prompt と設定だけが reviewer の差分であり、コード拡張面を開く必要がない。rules/ と同じ「リポジトリにコミットされた宣言を load-time validation で守る」モデルに揃える
- 既定ゼロ個の opt-in とする。reviewer は増やすほど escalation 率とコストが比例して伸びる「観点の多様性」であって保証ではないため、既定構成を変えない
- fixer は code-fixer を共用する。reviewer ごとの専用 fixer は収束ループの組み合わせ爆発を招くため、findings の出所識別（要件 5）で代替する
