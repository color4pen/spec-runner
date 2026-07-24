# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### コードアサーション検証（5 件）

**1. `src/prompts/spec-review-system.ts:34-49` — Method 節に全量列挙規律が存在しないこと**

ファイルを Read で確認。行 34〜49 が Method 節の手順 1〜5（Spec Presence Check ～ Output Format）であり、「見えている finding を全量列挙する」規律は存在しない。アサーション成立。

**2. `src/kernel/report-result.ts` — Finding が file / line を持つ（line は optional）**

`Finding` interface を確認。`file: string`（必須）、`line?: number`（optional）。アサーション成立。

**3. `src/core/step/step-completion.ts:232-250` — runtimeStrategy.verifyFindingRefs 下地**

実際の verifyFindingRefs 呼び出しブロックは行 238〜255（ソースとの差分 約 6 行）。ただし「runtimeStrategy へのアクセスと finding 走査がこの位置で可能」という実質的な主張は正確。アサーション成立（行番号に軽微なズレあり、後述 observation）。

**4. `src/state/helpers.ts:106` — StepRun が run ごとの commitOid を記録する**

`StepResultInput` の `commitOid?: string` フィールドが行 106 に存在。「spec-review は canon を書かない judge step のため、run N の commitOid における canon 内容は run N がレビューした内容と一致する」という記述も、spec-fixer が commitOid より後に変更をコミットするフローから正確と確認。アサーション成立。

**5. `src/store/event-journal.ts:32` — journal への step-attempt 記録機構**

行 31〜66 に `StepAttemptRecord` 型定義（`type: "step-attempt"` ほか）が存在。`appendEventRecord` 関数（行 375〜382）と `slugEventsPath` utility（`src/util/paths.ts`）でジャーナルへの append が可能。アサーション成立。

### 設計整合性確認

- **RuntimeStrategy.readFileAtCommit**: 既存ポートに存在。trailing-suffix match アルゴリズムで commit OID 指定のファイル読み取りが可能。spec-review が参照する change folder ファイル（spec.md / design.md / tasks.md）は slug 単位でユニークなため、サフィックス一致で曖昧さは生じない。
- **step-completion.ts の設計**: 現在は「No store writes of any kind」設計（docstring 明記）。後出し journal 書き込みは executor.ts でこの関数の戻り値を受けて行う構成（deriveStepCompletion が late-detection 結果を返し、executor が journal append する）が既存設計と整合する。
- **iteration 番号の導出**: `state.steps?.["spec-review"]?.length` から現 iteration が導出可能。`computeSpecReviewIteration` が同一ロジックを使用（`spec-review.ts` 行 50）。前ラウンドの `commitOid` は `state.steps["spec-review"][length - 1].commitOid` で参照可能。
- **受け入れ基準の実現可能性**: 全 6 基準とも既存インフラ（prompts, event-journal, step-completion, state）の範囲内で実装可能。prompt contract テストは既存 `tests/prompts/spec-review-system.test.ts` のパターンに沿って拡張可能。

### 読んだファイル一覧

- `specrunner/changes/spec-review-full-enumeration/rules.md`
- `specrunner/changes/spec-review-full-enumeration/request.md`
- `src/prompts/spec-review-system.ts`（全体）
- `src/kernel/report-result.ts`（全体）
- `src/core/step/step-completion.ts`（行 1〜50, 100〜260）
- `src/state/helpers.ts`（行 1〜130）
- `src/store/event-journal.ts`（行 1〜130, 350〜382）
- `src/core/port/runtime-strategy.ts`（全体）
- `src/state/schema/types.ts`（抜粋）
- `src/core/types.ts`（全体）
- `src/store/job-journal.ts`（全体）
- `src/core/step/spec-review.ts`（全体）
- `tests/prompts/spec-review-system.test.ts`（先頭 60 行）
- `src/util/paths.ts`（抜粋: slugEventsPath）

## 検証できなかった項目

None

## Findings 詳細

指摘なし。以下は判断を変えない observation のみ。

**Observation 1 — step-completion.ts の行番号ズレ**

request.md 記載の `step-completion.ts:232-250` と実際の verifyFindingRefs ブロック（行 238〜255）の間に約 6 行のズレがある。実質的な主張（runtimeStrategy アクセスと finding 走査がその位置で可能）は正確であり、実装上の問題はない。

**Observation 2 — journal 書き込みの配置（実装フラグ）**

`deriveStepCompletion`（step-completion.ts）は現在「No store writes of any kind」を設計原則として明記している。後出し検出の journal append を completion 処理に組み込む際は、late-detection 結果を `StepCompletion` 戻り値に含めて executor.ts 側で `appendEventRecord` する構成が既存設計と整合する。`deriveStepCompletion` 内で直接 journal 書き込みを行う場合はその設計原則を更新する必要がある。いずれの構成も要件を満たすため、実装者の判断に委ねる。
