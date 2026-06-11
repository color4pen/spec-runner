# プロジェクト定義のカスタムレビューワー step を宣言的に追加できるようにする

## Meta

- **type**: new-feature
- **slug**: custom-reviewers
- **base-branch**: main
- **adr**: true

## 背景

レビュー観点のカスタマイズ手段は specrunner/rules/（既存 step への観点追加）のみで、独立した収束ループ・別 prompt・別 maxIterations を持つレビューレンズ（セキュリティ監査、API 後方互換、ドメイン固有の検査など）をプロジェクト側から追加できない。main の code-review prompt に観点を足し続けると prompt が肥大して両方の精度が下がる。

judge step の契約は標準化済みである — どの judge も「findings 配列を返し、verdict は CLI が導出し、blocking findings は実在検証され、needs-fix は fixer ループ、decision-needed は escalation」という同一の枠で動く。このためカスタムレビューワーはコードではなくデータ（名前 + prompt 素材 + 設定）として宣言できる。

## 現状コードの前提

- judge の findings 契約と verdict 導出は `src/core/step/judge-verdict.ts`（純関数）と `JUDGE_REPORT_TOOL`（`src/core/step/report-tool.ts`）に集約されている
- findings の実在検証は RuntimeStrategy の seam（`verifyFindingRefs` — `src/core/runtime/local.ts:612` / `src/core/runtime/managed.ts:328`、呼び出しは `src/core/step/executor.ts:510`）として local / managed 両対応済み
- pipeline の合成は descriptor 化されている（`STANDARD_DESCRIPTOR` — `src/core/pipeline/registry.ts:47` 周辺に transitions / loopNames / loopFixerPairs が集約）。遷移テーブルは `STANDARD_TRANSITIONS`（`src/core/pipeline/types.ts:126`）
- step ごとの知識注入機構として `specrunner/rules/<step>/` と `resolveStepRules`（`src/core/step/rules-resolve.ts`、呼び出しは `src/core/step/executor.ts:188`）が存在する
- fixer → review の逆引きは `loopFixerPairs` の entries に対する `.find()` で最初の対を返す実装であり（`src/core/pipeline/pipeline.ts:357-358`）、複数の review step が同一 fixer を共有することを想定していない
- code-fixer の戻り先遷移と code-review の findings-derived routing は、when ガードに `"code-review"` がリテラルで埋め込まれて決まる（`src/core/pipeline/types.ts:153-177` — `s.steps?.["code-review"]` の最終 verdict / findings を読んで分岐）。reviewer の追加はこのガードを「どの reviewer から来たか」を state から導出する形へ一般化する作業を伴い、これが配線変更の最重量部である
- step の system prompt は CLI が所有し（例: `src/prompts/code-review-system.ts`）、request 制約や diff stat は CLI が初期メッセージに注入する（`src/core/step/code-review.ts:65-95`）

## 要件

1. 宣言形式: `specrunner/reviewers/<name>.md` にカスタムレビューワーを定義する。frontmatter で name / maxIterations / model（任意）を宣言する。本文は必須セクション「目的」「観点」「判定基準」と、任意の自由記述（補足知識・例示・例外）で構成する。リポジトリにコミットされる成果物とし、レビュー可能にする
2. prompt 合成: reviewer の system prompt は CLI 所有の固定フレーム（judge であること・findings 形式・severity 定義・結果ファイル書き出し義務）に md の内容をスロット注入して組み立てる。ユーザー定義が judge 契約部分を上書きできない構造にする
3. 実行位置と配線: カスタムレビューワーは code-review の後に宣言順で直列に実行される。verdict は既存の judge 契約をそのまま使い、needs-fix は共用 code-fixer との既存ループ機構で収束させる。code-fixer の戻り先と routing の when ガードは「どの reviewer から来たか」を state から導出する形に一般化し、`"code-review"` リテラル参照を除去する
4. load-time validation: job start 時に reviewers/ の全定義を検証する — frontmatter 必須項目、maxIterations の範囲、必須セクションの実在、組み込み step 名との衝突禁止。違反があれば pipeline を開始せずエラーで停止する
5. 定義 snapshot: job start 時に reviewer 定義を job state に snapshot し、job 中（resume 含む）は snapshot を参照する。実行中の定義変更が pipeline の形状に影響しない
6. 既定はゼロ個: reviewers/ が空または不存在のとき、pipeline の構成・挙動・出力が現行と完全に一致する
7. findings の出所識別: カスタムレビューワーの findings・結果ファイル・state 記録は reviewer 名で識別でき、code-fixer への prompt 埋め込みでもどの reviewer の指摘かが区別できる
8. 実在検証・実在しない参照の escalation・`ok: false` の escalation など、組み込み judge と同一の防御がカスタムレビューワーにも適用されることをテストで固定する

## スコープ外

- creator 側（implementer / design）のカスタム step
- カスタム fixer（fixer は code-fixer を共用する）
- reviewer 間の並列実行・順序の依存宣言
- 起動条件ゲート（paths / requestTypes による宣言的 skip）
- レビュー収束後の退行ゲート（累積 findings の再照合）
- `reviewers new` scaffold コマンド
- spec フェーズ（spec-review 前後）への挿入
- マーケットプレイス的な reviewer 配布機構

## 受け入れ基準

- [ ] reviewers/ に 1 件定義すると code-review の後にその judge が実行され、findings 契約（CLI 導出・実在検証・fixer ループ・escalation）が組み込み judge と同一に機能する（mock でテスト）
- [ ] reviewers/ が空・不存在のとき既存テストが無変更で green（挙動完全一致）
- [ ] 不正な定義（必須項目欠落・必須セクション欠落・組み込み step 名との衝突）で job start が実行前に停止する
- [ ] 複数 reviewer が宣言順に直列実行される
- [ ] code-fixer が needs-fix を出した reviewer に戻る（戻り先の一般化、リテラル参照の除去）
- [ ] code-fixer を複数 reviewer が共有しても、exhaustion の iteration 予算が reviewer ごとに独立して正しく数えられる（fixer → review 逆引きの多対一対応）
- [ ] resume 後も job start 時の snapshot 定義が使われ、定義ファイルの変更が実行中 job に影響しない
- [ ] code-fixer が受け取る findings に reviewer 名の識別が含まれる
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- カスタムレビューワーをコードの拡張点（plugin API）ではなくデータ（markdown 宣言）として定義する。judge 契約が CLI 側に標準化されているため、prompt 素材と設定だけが reviewer の差分であり、コード拡張面を開く必要がない。rules/ と同じ「リポジトリにコミットされた宣言を load-time validation で守る」モデルに揃える
- 既定ゼロ個の opt-in とする。reviewer は増やすほど escalation 率とコストが比例して伸びる「観点の多様性」であって保証ではないため、既定構成を変えない
- fixer は code-fixer を共用する。reviewer ごとの専用 fixer は収束ループの組み合わせ爆発を招くため、findings の出所識別（要件 7）で代替する
- prompt 全文をユーザーに所有させず、CLI 所有フレームへのスロット注入とする。judge 契約を md 側から上書きする経路を構造的に排除する
- 本文は必須セクション + 自由欄のハイブリッドとする。骨格（目的・観点・判定基準）は validation で強制し、プロジェクト固有知識・例示は自由欄に置く。request.md（必須構造 + 自由記述）と同型
- 定義は job start 時 snapshot で固定する。resume を含む job のライフサイクル中に pipeline 形状が変わる事故を構造的に消す
