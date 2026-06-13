# Review: cross-boundary-invariants — decision-options-ledger — iter 2

- **verdict**: approved

## Scope

diff が変更していないコードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを確認する。
イテレーション 1 で指摘した F1/F2 の修正と、code-review フィードバック #1（malformed token guard）の適用後を対象に精査した。

---

## イテレーション 1 指摘事項の確認

### F1 — tool description に `options` 未記載（high, fixable）→ **修正済み**

`JUDGE_REPORT_TOOL`、`CODE_REVIEW_REPORT_TOOL`、`REQUEST_REVIEW_REPORT_TOOL`、`CONFORMANCE_REPORT_TOOL` の description に:

```
When resolution is 'decision-needed', options is REQUIRED and must contain at least 2 entries — each with label and consequence.
```

が追記されており、`parseFindings(strict=true)` の強制ルールと description が整合している。✓

### F2 — `CONFORMANCE_SYSTEM_PROMPT` に `DECISION_NEEDED_DEFINITION` 未挿入（medium, fixable）→ **修正済み**

`src/prompts/conformance-system.ts` が `DECISION_NEEDED_DEFINITION` を import し、Resolution 定義セクションに挿入している。fragment-coverage テストが `CONFORMANCE_SYSTEM_PROMPT contains DECISION_NEEDED_DEFINITION` を機械的に検証している。✓

### F3 — JSON 例に `options` フィールド未記載（low, fixable）→ **残存・非ブロッキング**

5 プロンプト（spec-review, code-review, custom-reviewer, regression-gate, request-review）の completion 節 JSON 例が `options` フィールドを含まないままである。ただし:

- 同じ completion 節に `DECISION_NEEDED_DEFINITION` が挿入されており（`options` 要件・例・2 件以上の制約を含む）、エージェントは定義文から正しい構造を参照できる。
- tool description の `options` 記述（F1 修正）がモデルへの最直接的なスキーマ通知として機能する。
- `parseFindings(strict=true)` がバリデーションのファイナルガードを担う。

JSON 例と `DECISION_NEEDED_DEFINITION` のテキストが矛盾する点は依然として存在するが、runtime 不変条件の違反にはならない。

### code-review finding #1 — malformed `/resume 1=` の prose スルー（medium）→ **修正済み**

`ParsedResumeInput.hasInvalidDecisionTokens` フラグが追加され、`planResumes` が open decisions を持つジョブへの malformed token resume をブロックする。✓

---

## イテレーション 2 精査結果

### 確認済み — 問題なし

**1. `filterUndecidedFindings` の state 伝播**

`pushStepResult`（`{ ...state, steps: { ... } }`）、`store.update`（`{ ...state, ...patch }`）、`transitionJob`（`appendHistoryEntry` + spread）がすべて `{ ...state }` スプレッドを用いるため、`decisions` フィールドはパイプライン全ステップを通じて保持される。

**2. `persistState` → `resumeJob` の順序保証**

`run-inbox.ts` の resume 実行ループは `await effects.persistState(...)` の後に `await effects.resumeJob(...)` を呼ぶ。決定台帳はジョブ再実行前に必ず永続化されている。

**3. Finding 番号付けの安定性**

`buildEscalationComment`（通知生成時）と `planResumes`（resume 解決時）はともに `getOpenDecisionFindings(state)` を同じ state に対して呼び、同じ `toolResult.findings` 配列順でフィルタリングする。ジョブが `awaiting-resume` 状態中は該当ステップの steps エントリが変更されないため、番号付けは安定する。

**4. `findingKey` の step 名一貫性**

`resolveDecisions`（`job.resumePoint?.step`）と `filterUndecidedFindings`（executor の `step.name`）が使う step 名は、パイプライン再開時に同一のステップが再実行されるという既存パイプライン不変条件に基づき一致する。

**5. regression-gate と decision 機構の分離**

`collectFindingsLedger` は `collectFixableFindings`（`resolution === "fixable"` のみ）を使用するため、`decision-needed` finding は regression-gate の台帳に含まれない。regression-gate ステップ名は "regression-gate" であり、他ステップの決定レコードと key が衝突しない。

**6. conformance ステップの `isJudgeStep` 包含**

executor.ts の `isJudgeStep = JUDGE_REPORT_TOOL || CODE_REVIEW_REPORT_TOOL || isConformanceStep`。conformance は `isJudgeStep` に含まれるため、`filterUndecidedFindings` と finding ref verification の両経路が正しく適用される。

**7. custom reviewer ステップの `JUDGE_REPORT_TOOL` singleton**

custom reviewer と regression-gate はともに `JUDGE_REPORT_TOOL` singleton を `reportTool` として使用し、executor の `isJudgeStep` 判定が正しく機能する。

**8. crash 後の inbox 再実行**

`persistState` 後に crash してジョブが `awaiting-resume` のままになった場合、次の inbox 実行では `getOpenDecisionFindings` が決定済み finding を除いた空配列を返し、prose-only resume として処理される。既に永続化された decisions が後続の executor.ts での filtering に使われるため、再 escalation は発生しない。

**9. `VERDICT_BLOCKING_RULES` テキストと filtering 挙動の乖離**

`VERDICT_BLOCKING_RULES` は「decision-needed ≥ 1 → escalation」と記述しているが、実際は「決定済みでない decision-needed ≥ 1 → escalation」が正しい。ただし、エージェントはこのルールを「自分が報告した finding がどのルーティングを引き起こすか」の参照に使うのみであり、決定済みかどうかをエージェントが知る必要はない。runtime 不変条件の違反には当たらない。

---

## 総評

イテレーション 1 で発見したブロッキング指摘（F1 high、F2 medium）、および code-review finding #1（medium）はすべて修正されている。残存している F3（low、JSON 例の `options` 未記載）は tool description と DECISION_NEEDED_DEFINITION による二重の指示で補完されており、runtime 不変条件の破れを引き起こさない。

既存インフラ（state spread、regression-gate 台帳、conformance routing、custom reviewer、crash recovery）との相互作用で新たな不変条件違反は検出されなかった。
