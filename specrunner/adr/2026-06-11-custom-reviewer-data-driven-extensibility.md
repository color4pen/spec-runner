# ADR-20260611: カスタムレビューワーをコードではなく markdown 宣言で pipeline に追加するモデル

**Date**: 2026-06-11
**Status**: accepted

## Context

レビュー観点のカスタマイズ手段は `specrunner/rules/<step>/`（既存 step への観点追加）のみで、独立した収束ループ・別 prompt・別 `maxIterations` を持つレビューレンズをプロジェクト側から追加する経路がなかった。観点を `code-review` の prompt に足し続けると prompt が肥大し精度が下がる。

一方で judge step の契約は CLI 側に標準化されていた。

- findings 契約・verdict 導出は純関数（`judge-verdict.ts`）と `JUDGE_REPORT_TOOL`（`report-tool.ts`）に集約
- findings の実在検証は `RuntimeStrategy.verifyFindingRefs` seam で local / managed 両対応済み
- `executor.ts` の `isJudgeStep` は `reportTool` の **identity**（`=== JUDGE_REPORT_TOOL`）で判定
- pipeline 合成は `PipelineDescriptor`（ADR-20260604）でデータ化済み
- `STANDARD_TRANSITIONS` の impl phase routing は `s.steps["code-review"]` をリテラルで参照

この契約の標準化により、カスタムレビューワーはコードの拡張点（plugin API）ではなく、**データ（markdown 宣言）と設定**として表現できる。reviewer の差分は「prompt 素材」と「maxIterations / model」だけであり、judge 契約は全て CLI 側で固定される。

## Decision

### D1: `specrunner/reviewers/<name>.md` の markdown 宣言をデータ拡張点とする

カスタムレビューワーを `src/` へのコード追加（plugin API）ではなく `specrunner/reviewers/<name>.md` への宣言として定義する。

- frontmatter に `name`（必須）/ `maxIterations`（必須）/ `model`（任意）を宣言する。
- 本文の必須セクション `## 目的` / `## 観点` / `## 判定基準` + 任意の自由記述で構成する。`request.md`（必須構造 + 自由記述）と同型のハイブリッド。
- `rules/` と同じ「リポジトリにコミットされた宣言を load-time validation で守る」モデルに揃える。

judge 契約が CLI 側に標準化されているため、prompt 素材と設定だけが reviewer の差分であり、コード拡張面を開く必要がない。

### D2: CLI 所有フレームへのスロット注入で prompt を合成する

reviewer の system prompt は `src/prompts/custom-reviewer-system.ts`（`buildCustomReviewerSystemPrompt`）が組み立てる。CLI 所有の固定フレーム（judge であること・findings 形式・severity 定義・結果ファイル書き出し義務・security clause）を外枠とし、md の必須セクション内容をスロットへ注入する。

ユーザー md は外枠内のスロットにしか入らないため、judge 契約部分（verdict 導出・findings 形式）を構造的に上書きできない。

### D3: `JUDGE_REPORT_TOOL` identity の再利用で executor を無改修にする

`src/core/step/custom-reviewer.ts`（`createCustomReviewerStep`）は `reportTool = JUDGE_REPORT_TOOL` を singleton そのまま参照する。

`executor.ts` の `isJudgeStep` は identity（`=== JUDGE_REPORT_TOOL`）で判定するため、この参照だけで findings 由来 verdict 導出・`verifyFindingRefs`・no-tool-call 時 escalation がカスタムレビューワーにも **executor 無改修で** 適用される。専用の `CUSTOM_REVIEWER_REPORT_TOOL` と `isJudgeStep` の拡張は不要。

### D4: `buildReviewerChainTransitions` で chain routing を一般化し `"code-review"` リテラルを除去する

`src/core/pipeline/reviewer-chain.ts`（`buildReviewerChainTransitions`）が reviewer chain（`["code-review", ...customNames]`）を受け取り、impl phase の全遷移行を生成する純関数。

- `resolveActiveReviewer(state, chain)`: `steps[name]` の最新 `startedAt` が最大の reviewer を「いま収束対象」として返す（同値の場合は chain 後位優先）。
- `STANDARD_TRANSITIONS` の impl reviewer / fixer 行（現状の `s.steps["code-review"]` リテラル 4 行）を `buildReviewerChainTransitions(["code-review"])` の出力で**置換**する。これにより base 自体からリテラルが消え、chain=`["code-review"]` の生成結果が現行 4 行と挙動完全一致することを parity テストで固定する。
- カスタムレビューワー非空時は `composeReviewerDescriptor` が同じ generator を長い chain で呼ぶだけ。

### D5: code-fixer を多対一で共有し、findings の出所識別で reviewer を区別する

reviewer ごとの専用 fixer は作らず、全カスタムレビューワーが `code-fixer` を共用する。収束ループの組み合わせ爆発を避けるため。

- `pipeline.ts` の fixer → review 逆引き（`loopFixerPairs` の `.find()`）を `resolvePairedReviewForFixer(state, fixerName, loopFixerPairs)` に置換し、多対一時は `resolveActiveReviewer` で収束中の reviewer を返す。
- `code-fixer.ts` の `reads` / `buildMessage` / `getLatestJudgeFindings` の `STEP_NAMES.CODE_REVIEW` リテラルを active reviewer に一般化する。
- `fixer-helpers.ts` の findings block に reviewer 名ラベルを加え、code-fixer prompt 内でどの reviewer の指摘かを区別可能にする。

### D6: per-reviewer maxIterations と fixer 予算のエピソード独立

`Pipeline` に `maxIterationsByStep?: Record<string, number>` を追加し `resolveMaxIterations(stepName)` を導入する。カスタムレビューワーの `maxIterations` は frontmatter から取得し `composeReviewerDescriptor` が供給する。

「fresh convergence episode reset」（`pipeline.ts:318-324`）が非 fixer step から reviewer へ入るたびに `fixerIters[code-fixer]=0` にするため、各 reviewer の収束エピソードは fixer 予算をフレッシュに開始する。この不変条件が chain 遷移（R_i → R_{i+1} の前進入場）でも成立する。

### D7: job-start snapshot で pipeline 形状を resume 中も固定する

`JobState` に `reviewers?: ReviewerSnapshot[]` を追加する。snapshot は prompt 素材（必須セクション + 自由欄）を含み、resume を含む job ライフサイクル中にディスクの定義ファイルが変わっても pipeline 形状・prompt が一切変わらない。`ResumeCommand` は永続化済み state を読むだけで reviewers/ を再ロードしない。

### D8: load-time validation を pipeline 開始前に実施する

`PipelineRunCommand.prepare()` の `bootstrapJob()` 前に `loadReviewerDefinitions` + `validateReviewerDefinitions` を呼ぶ。違反時は prepare が throw → exit 1 で pipeline は開始されない。検査項目：frontmatter 必須項目欠落・name とファイル名 stem の不一致・maxIterations 範囲外・必須セクション欠落・組み込み step 名との衝突・重複・文字種制約違反（`/^[a-z0-9][a-z0-9\-_]*$/`、パストラバーサル防止）。

### D9: reviewers ゼロ個のとき base descriptor を変更しない

`composeReviewerDescriptor(base, [])` は `base` を参照同一で返す。既定構成（reviewer ゼロ個）の挙動・出力・テストを現行と完全一致させる。opt-in であり既定構成を壊さない。

## Alternatives Considered

### Alt-A: plugin API（コードで reviewer を登録する）

- **Pros**: reviewer が任意のロジックを持てる。型安全な拡張点
- **Cons**: judge 契約が CLI 側に標準化されているため拡張面を開く必要がない。コード追加のたびに PR レビューが必要
- **Why not**: reviewer の差分は prompt 素材と設定だけであり、データ宣言で十分。rules/ と同じモデルに揃えられる

### Alt-B: md 全文を system prompt にする（judge 契約をユーザーに委ねる）

- **Pros**: ユーザーが prompt を完全制御できる
- **Cons**: verdict 導出・findings 形式・escalation 条件がユーザー md で上書き可能になり、CLI が保証する judge 契約が崩れる
- **Why not**: スロット注入（D2）でユーザー領域を内側に閉じることで構造的に上書き経路を排除する

### Alt-C: reviewer ごとに専用 fixer を持たせる

- **Pros**: fixer が reviewer の文脈を直接把握できる
- **Cons**: N reviewer × M fixer の組み合わせで収束ループが爆発する。設計の複雑度が増す
- **Why not**: findings の出所識別（D5）で「どの reviewer の指摘か」を fixer prompt に明示することで、共用 fixer でも文脈を区別できる

### Alt-D: snapshot にパスだけ持たせ resume 時に再ロードする

- **Pros**: state が軽量になる
- **Cons**: 実行中の定義変更が resume 後の pipeline 形状に影響し、再現性が壊れる
- **Why not**: prompt 素材まで snapshot に含めることで「state だけで再現可能」を満たす

### Alt-E: 専用 `CUSTOM_REVIEWER_REPORT_TOOL` を新設し `isJudgeStep` を拡張する

- **Pros**: 判定面が明示的
- **Cons**: executor の判定面を増やすだけで利得がない。既存 `JUDGE_REPORT_TOOL` を参照するだけで executor 無改修のまま全防御が適用される
- **Why not**: identity 再利用（D3）の方がシンプルで executor との結合が変わらない

### Alt-F: `STANDARD_TRANSITIONS` の `"code-review"` リテラルを残し、カスタムレビューワー用の遷移だけ追加する

- **Pros**: 既存遷移への変更量が最小
- **Cons**: リテラルが残り、chain routing の一般化（要件 3）を達成できない。code-review とカスタムレビューワーで二系統のロジックが生じる
- **Why not**: `buildReviewerChainTransitions(["code-review"])` が既存 4 行と挙動完全一致することを parity テストで固定することで、base のリテラル除去と zero-config 完全一致を両立させる

## Consequences

### Positive

- プロジェクトが `specrunner/reviewers/<name>.md` を追加するだけで独立した judge ループを持つレビューレンズを宣言でき、CLI コードへの変更なしに観点を分離できる
- カスタムレビューワーが `JUDGE_REPORT_TOOL` identity を参照するだけで、executor の全防御（findings 由来 verdict・実在検証・escalation）が自動適用される
- `STANDARD_TRANSITIONS` の `"code-review"` リテラルが除去され、impl phase の chain routing が N reviewer に対してスケールする一般的な generator になる
- `composeReviewerDescriptor(base, [])` が base 同一を返す保証により、zero-config 完全一致がコードで担保される

### Negative

- `pipeline.ts` の exhaustion / reset ロジック（最も繊細な配線部）に多対一 fixer と per-step max の変更が入り、regression 面積が広い。parity テストと多 reviewer 予算独立テストで固定する
- `JUDGE_REPORT_TOOL` singleton への identity 依存が暗黙の seam になる。リファクタリングで singleton を差し替えると全カスタムレビューワーの judge 判定が崩れる
- managed runtime での動的カスタムレビューワー agent 登録経路が未解決（Open Question）

### Known Debt / Deferred

- managed runtime での `AgentRegistry` へのカスタムレビューワー動的登録（`managed setup` 時に reviewers/ を読む方式等）は別 request に切り出す
- `MAX_REVIEWER_ITERATIONS` の上限値（初期 10）の config 化は必要になれば別途対応
- `model` frontmatter と step-config 解決チェーンの優先順位は初期 hardcode default として、config 上書きは将来対応

## References

- Request: `specrunner/changes/custom-reviewers/request.md`
- Design: `specrunner/changes/custom-reviewers/design.md`
- Spec: `specrunner/changes/custom-reviewers/spec.md`
- Related: `specrunner/adr/2026-06-04-pipeline-descriptor-registry.md`（PipelineDescriptor + registry）
- Related: `specrunner/adr/2026-06-04-pipeline-roles-neutral-engine.md`（記述子駆動の roles + neutral engine）
- Related: `specrunner/adr/2026-05-20-rules-md-injection.md`（rules/ モデル）
- Related: `specrunner/adr/2026-05-28-tool-driven-step-completion.md`（JUDGE_REPORT_TOOL 契約）
