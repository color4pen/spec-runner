# Test Cases: プロジェクト定義のカスタムレビューワー step

## Summary

- **Total**: 52 cases
- **Automated** (unit/integration): 50
- **Manual**: 2
- **Priority**: must: 42, should: 10, could: 0

---

## 宣言形式とパース

### TC-001: 有効な定義をパースする

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 宣言形式とパース > Scenario: 有効な定義をパースする

---

### TC-002: reviewers/ が不存在

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: 宣言形式とパース > Scenario: reviewers/ が不存在

---

### TC-003: definition.ts が node:fs を import しない

**Category**: unit
**Priority**: should
**Source**: tasks.md T-01

**GIVEN** `src/core/reviewers/definition.ts` を実装した状態
**WHEN** ファイルの import 文を静的解析する
**THEN** `node:fs` の直接 import が存在しない

---

### TC-004: frontmatter 欠落とセクション欠落を区別できる構造でパース結果を返す

**Category**: unit
**Priority**: should
**Source**: tasks.md T-01

**GIVEN** (a) frontmatter を持たない md、(b) frontmatter はあるが `## 判定基準` を欠く md
**WHEN** `parseReviewerDefinition` を各々に対して呼ぶ
**THEN** 欠落の種類（frontmatter / section）がパース結果の構造から区別でき、`validateReviewerDefinitions` が詳細エラーを生成できる

---

## load-time validation

### TC-005: 必須セクション欠落で停止

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: load-time validation で job start 前に停止する > Scenario: 必須セクション欠落で停止

---

### TC-006: 組み込み step 名との衝突で停止

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: load-time validation で job start 前に停止する > Scenario: 組み込み step 名との衝突で停止

---

### TC-007: 有効な定義は通過する

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: load-time validation で job start 前に停止する > Scenario: 有効な定義は通過する

---

### TC-008: パストラバーサル name が文字種制約違反で拒否される

**Category**: unit
**Priority**: must
**Source**: tasks.md T-02

**GIVEN** frontmatter の name に `"../etc/passwd"` や `"../../etc"` などのパストラバーサル文字列を含む定義ファイル
**WHEN** `validateReviewerDefinitions` を実行する
**THEN** 文字種制約違反（`/^[a-z0-9][a-z0-9\-_]*$/` 不一致）でエラーが throw され、定義を通過させない

---

### TC-009: 複数違反を 1 回の throw にまとめて報告する

**Category**: unit
**Priority**: should
**Source**: tasks.md T-02

**GIVEN** 必須セクション欠落と maxIterations 範囲外という 2 つの違反を持つ定義
**WHEN** `validateReviewerDefinitions` を実行する
**THEN** 1 つの `ReviewerValidationError` に両違反がまとめて含まれる

---

### TC-010: maxIterations 範囲外で throw する

**Category**: unit
**Priority**: must
**Source**: tasks.md T-02

**GIVEN** maxIterations が 0 / -1 / `MAX_REVIEWER_ITERATIONS + 1`（11）/ 1.5（小数）の各定義
**WHEN** `validateReviewerDefinitions` を実行する
**THEN** それぞれ範囲外エラーで throw し、pipeline を開始しない

---

### TC-011: name とファイル名 stem の不一致で throw する

**Category**: unit
**Priority**: should
**Source**: tasks.md T-02

**GIVEN** ファイル名が `security.md` だが frontmatter の name が `"audit"` の定義
**WHEN** `validateReviewerDefinitions` を実行する
**THEN** stem 不一致エラー（違反 2）で throw する

---

### TC-012: reviewer name 重複で throw する

**Category**: unit
**Priority**: should
**Source**: tasks.md T-02

**GIVEN** name が `"security"` の定義ファイルが 2 件存在する
**WHEN** `validateReviewerDefinitions` を実行する
**THEN** 重複エラー（違反 6）で throw する

---

## prompt 合成

### TC-013: buildCustomReviewerSystemPrompt に judge 契約フレームが含まれる

**Category**: unit
**Priority**: must
**Source**: tasks.md T-03

**GIVEN** 有効な `ReviewerDefinition`
**WHEN** `buildCustomReviewerSystemPrompt(def)` を呼ぶ
**THEN** 出力文字列に `VERDICT_BLOCKING_RULES` の文言と findings 形式の指示が含まれる

---

### TC-014: md 本文がスロット内側にのみ注入され judge 契約文言を上書きしない

**Category**: unit
**Priority**: must
**Source**: tasks.md T-03

**GIVEN** 観点セクションに judge 契約関連語（例: `"verdict"` を含む独自文言）を持つ `ReviewerDefinition`
**WHEN** `buildCustomReviewerSystemPrompt` を呼ぶ
**THEN** 出力の judge 契約部分はフレーム由来の文言のままであり、ユーザーセクションはスロット領域にのみ出現する

---

## 結果ファイルパスと artifact

### TC-015: 結果ファイルが reviewer 名で識別される

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: findings の出所識別 > Scenario: 結果ファイルが reviewer 名で識別される

---

### TC-016: customReviewerResultPath のパスフォーマット（3桁ゼロ埋め）

**Category**: unit
**Priority**: must
**Source**: tasks.md T-04

**GIVEN** slug=`"foo"`, name=`"security"`, iteration=2
**WHEN** `customReviewerResultPath("foo", "security", 2)` を呼ぶ
**THEN** `"specrunner/changes/foo/security-result-002.md"` を返す

---

## カスタムレビューワー step ファクトリ

### TC-017: 生成 step の reportTool が JUDGE_REPORT_TOOL と identity 一致する

**Category**: unit
**Priority**: must
**Source**: tasks.md T-05

**GIVEN** 有効な `ReviewerSnapshot`
**WHEN** `createCustomReviewerStep(snapshot)` を呼ぶ
**THEN** `step.reportTool === JUDGE_REPORT_TOOL`（参照同一）

---

### TC-018: buildMessage 出力に reviewer 名が含まれる

**Category**: unit
**Priority**: must
**Source**: tasks.md T-05

**GIVEN** `name="security"` の `ReviewerSnapshot` から生成した step
**WHEN** `step.buildMessage(...)` を呼ぶ
**THEN** 出力文字列に `"security"` が含まれる

---

### TC-019: resultFilePath が reviewer 名識別パスを返す

**Category**: unit
**Priority**: must
**Source**: tasks.md T-05

**GIVEN** `name="security"` の `ReviewerSnapshot` から生成した step
**WHEN** `step.resultFilePath` を解決する
**THEN** パスに `"security"` が含まれ D10 形式（`<name>-result-NNN.md`）に従う

---

## JobState snapshot と prepare 配線

### TC-020: reviewers フィールドを含む JobState が persist → load で保持される

**Category**: unit
**Priority**: must
**Source**: tasks.md T-06

**GIVEN** `ReviewerSnapshot[]` を含む `JobState`
**WHEN** persist して再ロードする
**THEN** `reviewers` 配列が同一内容で復元される

---

### TC-021: reviewers フィールドが absent の既存 state は後方互換

**Category**: unit
**Priority**: must
**Source**: tasks.md T-06

**GIVEN** `reviewers` フィールドを持たない旧形式 `JobState`
**WHEN** `validateJobState` を呼ぶ
**THEN** エラーにならず `undefined` として扱われる

---

### TC-022: 有効定義で snapshot が初期 JobState に載る

**Category**: unit
**Priority**: must
**Source**: tasks.md T-07

**GIVEN** load + validate 済みの `ReviewerDefinition[]`
**WHEN** `buildInitialJobState(opts, reviewers)` を呼ぶ
**THEN** `state.reviewers` に `ReviewerSnapshot[]` が含まれる

---

### TC-023: 不正定義で prepare が pipeline 開始前に exit 1 で停止する

**Category**: integration
**Priority**: must
**Source**: tasks.md T-07

**GIVEN** `specrunner/reviewers/api.md` が必須セクションを欠く
**WHEN** `specrunner run` の `prepare` フェーズが実行される
**THEN** `bootstrapJob` に到達せず `CommandRunner.execute` が exit code 1 を返す

---

### TC-024: resume は snapshot を使う

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 定義 snapshot と resume > Scenario: resume は snapshot を使う

---

### TC-025: resume が reviewers/ を再ロードせず snapshot を参照する

**Category**: unit
**Priority**: should
**Source**: tasks.md T-07

**GIVEN** `ResumeCommand.prepare` の実装
**WHEN** 実装コードを静的に確認する
**THEN** `loadReviewerDefinitions` の呼び出しが存在せず、永続化済み `state.reviewers` をそのまま使用する

---

## reviewer-chain 純関数

### TC-026: nextAfterReviewer で chain 末尾（code-review のみ）の次は conformance

**Category**: unit
**Priority**: must
**Source**: tasks.md T-08

**GIVEN** chain=`["code-review"]`
**WHEN** `nextAfterReviewer("code-review", chain)` を呼ぶ
**THEN** `"conformance"` を返す

---

### TC-027: resolveActiveReviewer が複数 reviewer の最新実行を正しく選ぶ

**Category**: unit
**Priority**: must
**Source**: tasks.md T-08

**GIVEN** reviewer A（startedAt=T+1）と reviewer B（startedAt=T+2）が chain に存在し B が後から実行された
**WHEN** `resolveActiveReviewer(state, chain)` を呼ぶ
**THEN** B を返す

---

### TC-028: resolveActiveReviewer が同値タイムスタンプ時に chain 後位（index 大）を優先する

**Category**: unit
**Priority**: should
**Source**: design.md D7

**GIVEN** reviewer A と B の `startedAt` が同一タイムスタンプで chain 順は `["code-review", A, B]`
**WHEN** `resolveActiveReviewer(state, chain)` を呼ぶ
**THEN** chain 上後位の B を返す

---

## STANDARD_TRANSITIONS の generator 置換

### TC-029: buildReviewerChainTransitions(["code-review"]) が現行 STANDARD_TRANSITIONS と挙動一致する

**Category**: unit
**Priority**: must
**Source**: tasks.md T-09

**GIVEN** chain=`["code-review"]` の単一 reviewer
**WHEN** `buildReviewerChainTransitions(["code-review"])` を呼ぶ
**THEN** 生成された遷移行が置換前 `STANDARD_TRANSITIONS` の impl phase 行と等価（parity テスト）

---

### TC-030: STANDARD_TRANSITIONS に "code-review" 文字列リテラルが残らない

**Category**: unit
**Priority**: must
**Source**: tasks.md T-09

**GIVEN** `src/core/pipeline/types.ts`（STANDARD_TRANSITIONS 定義）
**WHEN** `s.steps["code-review"]` パターンで grep する
**THEN** マッチが 0 件（リテラル完全除去）

---

## descriptor 合成

### TC-031: composeReviewerDescriptor が空 snapshot で base と参照同一を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md T-10

**GIVEN** 空の `ReviewerSnapshot[]`
**WHEN** `composeReviewerDescriptor(base, [])` を呼ぶ
**THEN** 返値 `=== base`（参照同一）

---

### TC-032: composeReviewerDescriptor が 2 reviewer で宣言順に正しい descriptor を構成する

**Category**: unit
**Priority**: must
**Source**: tasks.md T-10

**GIVEN** snapshots=`[A, B]`（宣言順 A → B）
**WHEN** `composeReviewerDescriptor(base, [A, B])` を呼ぶ
**THEN** steps が `code-review → A → B → conformance` の順、`loopFixerPairs` が `A→code-fixer` / `B→code-fixer`、roles が `A, B` とも `"custom-reviewer"`

---

## per-step maxIterations

### TC-033: override 無しの組み込み step は global maxIterations にフォールバックする

**Category**: unit
**Priority**: should
**Source**: tasks.md T-11

**GIVEN** `Pipeline` に `maxIterationsByStep = { security: 3 }` を設定し、`code-review` のオーバーライドは無し
**WHEN** `pipeline.resolveMaxIterations("code-review")` を呼ぶ
**THEN** global `maxIterations` の値を返す（組み込み step の挙動不変）

---

### TC-034: reviewer の maxIterations が exhaustion 判定に反映される

**Category**: integration
**Priority**: must
**Source**: tasks.md T-11

**GIVEN** `maxIterations=2` の reviewer B が mock pipeline で 2 回 needs-fix を出す
**WHEN** 3 回目のループ入場を試みる
**THEN** exhaustion が発生し pipeline が halt する（global maxIterations の値に依存しない）

---

## pipeline.ts の fixer→review 逆引き一般化

### TC-035: exhaust した reviewer に exhaustion / resumeStep が正しく帰着する

**Category**: integration
**Priority**: must
**Source**: tasks.md T-12

**GIVEN** reviewer A（maxIterations=2）が 2 回 needs-fix を出して exhaust する
**WHEN** `handleExhausted` が呼ばれる
**THEN** `resumeStep` が A に紐づき、exhaustion エラーコードが A の名前を含む

---

### TC-036: fresh convergence episode reset が chain 遷移（R_i → R_{i+1}）でも発火する

**Category**: integration
**Priority**: must
**Source**: tasks.md T-12 / design.md D8

**GIVEN** reviewer A が approved に達し pipeline が reviewer B へ遷移する
**WHEN** B の最初の needs-fix ループが始まる
**THEN** `fixerIters[code-fixer]` が 0 にリセットされた状態で B の収束エピソードが開始される

---

## code-fixer の active reviewer 一般化

### TC-037: resolveReviewerResultPath が "code-review" のとき reviewFeedbackPath を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md T-13

**GIVEN** stepName=`"code-review"`, slug=`"slug"`, iteration=1
**WHEN** `resolveReviewerResultPath("slug", "code-review", 1)` を呼ぶ
**THEN** `reviewFeedbackPath("slug", 1)` と同一のパスを返す

---

### TC-038: resolveReviewerResultPath がカスタムレビューワー名のとき customReviewerResultPath を返す

**Category**: unit
**Priority**: must
**Source**: tasks.md T-13

**GIVEN** stepName=`"security"`（カスタムレビューワー）, slug=`"slug"`, iteration=1
**WHEN** `resolveReviewerResultPath("slug", "security", 1)` を呼ぶ
**THEN** `customReviewerResultPath("slug", "security", 1)` と同一のパスを返す

---

### TC-039: zero reviewer 時 code-fixer は従来どおり code-review findings を参照する

**Category**: unit
**Priority**: must
**Source**: tasks.md T-13

**GIVEN** `state.reviewers` が `[]` または `undefined`（zero reviewer）
**WHEN** `code-fixer` の `reads()` / `buildMessage()` が呼ばれる
**THEN** code-review 由来の結果ファイルおよび findings を参照する

---

## E2E mock pipeline テスト

### TC-040: 単一 reviewer が code-review の後に走る

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: judge 契約での直列実行 > Scenario: 単一 reviewer が code-review の後に走る

---

### TC-041: 複数 reviewer が宣言順に直列実行される

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: judge 契約での直列実行 > Scenario: 複数 reviewer が宣言順に直列実行される

---

### TC-042: 実在しない参照は escalation

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: judge 契約での直列実行 > Scenario: 実在しない参照は escalation

---

### TC-043: ok=false は escalation

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: judge 契約での直列実行 > Scenario: ok=false は escalation

---

### TC-044: needs-fix を出した custom reviewer に戻る

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 共用 code-fixer の戻り先一般化 > Scenario: needs-fix を出した custom reviewer に戻る

---

### TC-045: zero reviewer 時は現行どおり code-review に戻る

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 共用 code-fixer の戻り先一般化 > Scenario: zero reviewer 時は現行どおり code-review に戻る

---

### TC-046: 共用 fixer の予算が reviewer ごとに独立

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: reviewer ごとに独立した iteration 予算 > Scenario: 共用 fixer の予算が reviewer ごとに独立

---

### TC-047: code-fixer が受け取る findings に reviewer 名が含まれる

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: findings の出所識別 > Scenario: code-fixer が受け取る findings に reviewer 名が含まれる

---

### TC-048: zero reviewer で既存テストが無変更 green

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: 既定ゼロ個の完全一致 > Scenario: zero reviewer で既存テストが無変更 green

---

## resume / --from 制限

### TC-049: --from に custom reviewer 名を指定すると失敗する

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: --from オプションの制限 > Scenario: --from に custom reviewer 名を指定すると失敗する

---

### TC-050: --from なし（自動 resume）は動作する

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: --from オプションの制限 > Scenario: --from なし（自動 resume）は動作する

---

## 仕上げ

### TC-051: typecheck && test が green

**Category**: manual
**Priority**: must
**Source**: tasks.md T-15

**GIVEN** 全タスク（T-01〜T-14）の実装完了後
**WHEN** `bun run typecheck && bun run test` を実行する
**THEN** 全チェックがエラーなしで完了する

---

### TC-052: managed runtime の既知制約が文書化されている

**Category**: manual
**Priority**: should
**Source**: tasks.md T-15

**GIVEN** 実装完了後
**WHEN** design.md の Open Questions または関連ソースコードのコメントを確認する
**THEN** managed 動的 agent 登録ギャップが既知制約として文書化されている

---

## Result

```yaml
result: completed
total: 52
automated: 50
manual: 2
must: 43
should: 9
could: 0
blocked_reasons: []
```
