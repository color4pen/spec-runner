# Cross-Boundary Invariants Review — severity-fixability-split — Iteration 1

## Reviewer

cross-boundary-invariants — 変更が**変更していない**コードの暗黙の前提（不変条件）を黙って破っていないかを検出する。実装そのものが正しくテストも green のまま、既存機構との相互作用にだけ欠陥が宿るクラスのバグを対象とする。

---

## Scope Walked

変更による 5 つの主要削除/修正を追跡し、各削除が残存コードの暗黙前提を壊していないかを検証した。

| 変更 | 追跡先 |
|------|--------|
| D1: `selectFixerTargetFindings` LOW 除外削除 | `buildReviewerChainTransitions`、`collectRoutedFixerFindings`、no-op exemption、verdict 導出 |
| D2: `excludeKnownUnfixedRegressions` 廃止 | `step-completion.ts`、`regressionGateActive`、`regression-gate.ts` buildMessage/skipWhen |
| D3: code-fixer step message 統一 | `buildFindingsBlock`、fixer prompt 分岐 |
| D4: code-fixer system prompt LOW 除外削除 | `CODE_FIXER_SYSTEM_PROMPT` |
| D5: `findingsRoutingApproved` / `codeReviewFindingsRoutingActive` 削除 | `executor.ts`、`no-op-detect.ts`、transition table |

---

## Invariant Checks Performed

### 1. livelock 防止の維持

**検証対象**: `approved + LOW fixable → code-fixer` 後のルーティングが再レビューを発火しないこと。

**標準パス（custom reviewer なし）**:
`buildReviewerChainTransitions` の priority row: `active=code-review && last verdict=approved → conformance`。code-review の verdict が approved のまま保持されているため、code-fixer の `approved` は conformance へ直行する。re-review 発火なし。✓

**composed パス（custom reviewer あり）**:
`buildParallelReviewerTransitions` の Priority 3: `codeReviewLoopActive` は `lastCodeReview.verdict === "needs-fix"` を要求する。`approved + fixable` で発動した code-fixer の戻りでは code-review の verdict は `approved` → `codeReviewLoopActive = false` → デフォルト行: coordinator（custom reviewers）へ進む。reviewer に差し戻さない。✓

**判定**: livelock 防止の不変条件は保たれる。

### 2. regression-gate verdict 導出の整合

**検証対象**: D2 で `excludeKnownUnfixedRegressions` を `step-completion.ts` から除去した結果、`deriveRegressionGateVerdict` が LOW finding を正しく処理するか。

`deriveRegressionGateVerdict` は severity を参照せず `resolution === "fixable"` を判定する（`judge-verdict.ts:237`）。LOW fixable → needs-fix。severity 不問の実装が D2 の前提と一致する。✓

`step-completion.ts` diff 確認: `verdictFn(undecidedFindings, ...)` と `verdictFn(verdictFindings, ...)` の切り替えが正しく除去されており、regression-gate の verdict 導出が他 judge step と同一のパスを通ることを確認した。✓

### 3. `regressionGateActive` の approved+fixable 分岐

**検証対象**: `reviewer-chain.ts:272-278` の `approved` 分岐が D2 後に意図せず誤動作しないか。

```typescript
if (verdict === "approved") {
  const findings = toolResult?.findings ?? [];
  return collectFixableFindings(findings).length > 0;
}
```

`deriveRegressionGateVerdict` は `fixable ≥ 1 → needs-fix` を保証するため、gate が `approved` を返す時点で toolResult.findings に fixable が残ることはない。この分岐は D2 前も旧 persist filter（`excludeKnownUnfixedRegressions(persistToolResult.findings)`）が保証していた整合性を、現在は `deriveRegressionGateVerdict` 自体が保証する形に変わっている。

**実質的影響**: 分岐は実行不可能（dead code）になったが、ロジックに誤りはなく誤判定は発生しない。`regressionGateActive` が false を返すべき状況で誤って true を返すリスクはない。

⚠️ **軽微な懸念**: この `approved + fixable` 分岐は D2 の削除によって到達不可能になったが、残存したまま。将来の読者に旧設計を想起させ誤解を生む可能性がある（コメントも削除されたコードの意図を指している）。

### 4. regression-gate `buildMessage` のプロンプト前提

**検証対象**: `regression-gate.ts:160` が `"severity=high / resolution=fixable"` で報告するよう指示しているが、この指示が LOW 台帳エントリに対して適切に機能するか。

ledger 構築は `computeRegressionLedger` → `collectFixableFindings`（severity 不問）。LOW finding も台帳に含まれる。`buildFindingsBlock` はそれを `### [LOW] title` の形式で表示する。

regression-gate エージェントは `[LOW] finding` を台帳に見て、プロンプトに従い regression として `severity=high / resolution=fixable` で報告することになる。

**verdict への影響**: `deriveRegressionGateVerdict` は severity 不問。LOW regression → HIGH 報告 → needs-fix、という流れは正しく動作する。

**ただし**: このプロンプト指示は LOW が台帳に入らない前提（`excludeKnownUnfixedRegressions` 存在時）で書かれた。D2 により初めて LOW finding が台帳へ流入する経路が開いたが、プロンプト側の指示を更新していない。エージェントが `[LOW] finding` を見て「intentionally unfixed（意図的未修正）の可能性がある」と誤解するリスクが、以前よりも現実的になった。現状の指示は "Report any regressions" と明示しており誤動作は起きにくいが、LOW が台帳に載ることを明記した方が safer。

⚠️ **懸念**: regression-gate の user message が LOW finding を含む台帳に対して書かれていなかった旧前提を、コメント・説明の更新なしに引き継いでいる。エージェント信頼性の点で regression リスクを持つ。

### 5. no-op 検知と `findingTargetPaths` 免除

**検証対象**: D1 で LOW が `selectFixerTargetFindings` に含まれた結果、`collectRoutedFixerFindings(state)` が LOW finding の file を `findingTargetPaths` として返し、no-op 免除が正しく機能するか。

`collectRoutedFixerFindings` Branch 3 → `selectFixerTargetFindings(allFindings)` → LOW fixable を含む全件。findings の `.file` が `findingTargetPaths` に入る。`detectNoOp` では `exempt = findingTargetPaths − pipelineManagedPaths`。LOW finding の target が通常のソースファイルであれば exempt に入り、そのファイルへの変更がある限り no-op と判定されない。✓

`pipelineManagedPaths` は `state.json / events.jsonl / usage.json / bite-evidence-result / pr-create-result` のみ。LOW finding が通常のソースファイルを指していれば exempt に残る。✓

### 6. `collectVerdictAffectingFindings` と finding-ref validation の範囲

**検証対象**: `collectVerdictAffectingFindings`（変更なし）が LOW fixable を対象外とするため、LOW finding の file ref が hallucinated であっても ref 検証が走らない。D1 以降 LOW finding が code-fixer に届くことで、以前は無害だった hallucinated LOW ref が no-op → escalation を引き起こす可能性が生まれた。

**旧動作**: LOW finding は code-fixer に届かない → hallucinated ref は pipeline に影響しない。
**新動作**: LOW finding が code-fixer に届く → hallucinated ref → fixer が対象ファイルを変更できない → no-op → needs-fix → escalate。

**verdict 導出への直接影響なし**（ref 検証は critical/high/decision-needed のみ、LOW は approved 経路でも verdict に影響しない）。escalation は ref 誤りに対する正しい fail-closed 挙動であり behavioral regression ではない。ただし旧来「LOW は無視」で通っていた hallucinated ref が escalation を起こすようになることは、オペレータが注意すべき挙動変化。

---

## Verdict-Affecting Invariants

| 不変条件 | 破損の有無 | 根拠 |
|---------|------------|------|
| livelock 防止（approved path re-review なし） | 破損なし | transition table が `approved → conformance`/`coordinator` で終端 |
| `deriveRegressionGateVerdict` 意味論（fixable → needs-fix）| 破損なし | 関数未変更、severity 不問 |
| `deriveJudgeVerdict` / `deriveSpecReviewVerdict` 意味論 | 破損なし | 関数未変更 |
| `findingsRoutingApproved` 抑止削除後の no-op escalation | 破損なし（意図変更） | tests で pins 済（executor-no-op.test.ts Req 1） |
| regression-gate → code-fixer → regression-gate ループ有界性 | 破損なし | `REGRESSION_GATE_MAX_ITERATIONS = 3` 不変 |

---

## Findings

### F-001: regression-gate `buildMessage` が LOW 台帳エントリの登場を想定していない

**severity**: medium
**resolution**: fixable
**file**: `src/core/step/regression-gate.ts`
**line**: 160

`buildMessage` の step 3 指示「Report any regressions (findings that are back) with severity=high / resolution=fixable」は、D2 以前は `excludeKnownUnfixedRegressions` が LOW finding を台帳から除外していたため LOW finding がエージェントに見えない前提で書かれていた。D2 の廃止により LOW finding も `buildLedgerBlock` → `buildFindingsBlock` で `### [LOW] title` として表示される。

この指示の動作は verdict 的には正しい（`deriveRegressionGateVerdict` が severity 不問のため HIGH 報告でも LOW のままでも needs-fix に収束）。ただし:
- エージェントが `[LOW]` を見て「修正されるべきでない（旧挙動の名残）」と誤解するリスクが生まれた
- severity 上昇（LOW → HIGH）が意図的 regression 重篤化なのか指示の副作用なのかが、プロンプトを読んだだけではわからない
- 低難易度な LOW finding regression がすべて HIGH として記録される

**修正方針**: `buildMessage` の step 3 に「台帳エントリの元 severity に関わらず regression は severity=high として報告する」旨を明記する。または severity をそのまま継承する方針に統一する（verdict への影響なし）。

---

### F-002: `regressionGateActive` の `approved + fixable` 分岐が dead code 化

**severity**: low
**resolution**: fixable
**file**: `src/core/pipeline/reviewer-chain.ts`
**line**: 272

```typescript
if (verdict === "approved") {
  // findings-routing: approved but had fixable findings
  const findings = toolResult?.findings ?? [];
  return collectFixableFindings(findings).length > 0;
}
```

D2 以前: `excludeKnownUnfixedRegressions` が `persistToolResult.findings` をフィルタしていたため、`approved` 判定時に LOW fixable が残存する経路があった（LOW は verdictFindings から除外されるが persistedFindings には残りうる）。この分岐がその経路をカバーしていた。

D2 以降: `deriveRegressionGateVerdict` が `fixable ≥ 1 → needs-fix` を保証するため、gate が `approved` を返す状況で toolResult.findings に fixable が残ることは構造的に不可能。この分岐は到達不可能。

**影響**: ロジック上の誤りなし。ただし将来の読者がこの分岐の存在から誤った設計意図を読み取る可能性がある。

**修正方針**: 分岐を削除するか、コメントで「D2 削除後は到達不可能だが安全のため残す」と明示する。

---

## Evidence

- `src/core/step/judge-verdict.ts` 全体を精読し `selectFixerTargetFindings` / `deriveRegressionGateVerdict` / `collectFixableFindings` の挙動を確認
- `src/core/step/step-completion.ts` 全体を精読、diff で削除ブロックを確認
- `src/core/pipeline/findings-ledger.ts` 全体を精読、`excludeKnownUnfixedRegressions` 削除を確認
- `src/core/pipeline/reviewer-chain.ts` 全体を精読、transition table / `regressionGateActive` / `buildReviewerChainTransitions` / `buildParallelReviewerTransitions` を確認
- `src/core/step/no-op-detect.ts` を精読、`findingsRoutingApproved` 削除確認
- `src/core/step/executor.ts` 冒頭 import と `detectNoOp` 呼び出し箇所を確認
- `src/core/step/code-fixer.ts` 全体を精読、全 5 分岐の severity 指示・routing を確認
- `src/core/step/routed-findings.ts` 全体を精読、Branch 3 の `selectFixerTargetFindings` 呼び出しを確認
- `src/core/step/regression-gate.ts` 全体を精読、`buildMessage` / `skipWhen` / `computeRegressionLedger` を確認
- `src/prompts/code-fixer-system.ts` / `src/prompts/spec-fixer-system.ts` 精読、severity 再フィルタ文言の有無を確認
- `src/core/pipeline/compose-reviewers.ts` 精読、regression-gate の composed path への挿入を確認
- `src/core/pipeline/round-git-scope.ts` で `pipelineManagedPaths` の範囲を確認
- `src/core/step/__tests__/executor-no-op.test.ts` で Req 1（D5 suppression 削除後の approved-noop escalation）を確認
- `tests/unit/step/severity-fixability-split.test.ts` で TC-001〜003 のルーティング検証を確認
- 標準遷移表（`STANDARD_TRANSITIONS` / `buildReviewerChainTransitions`）で code-fixer → needs-fix の escalate 経路を確認
- git diff main...HEAD で削除・変更行を確認

**checked**: 15（上記ファイル群の精読と cross-boundary インタラクション追跡）
**skipped**: 0
**unverified**: 0
