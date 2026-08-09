# Spec Review Result: regression-gate-false-loop

## 検証した項目

### 1. コード前提の実態確認

| 項目 | request.md の主張 | 実測結果 |
|------|------------------|---------|
| `judge-verdict.ts:188-190` `collectFixableFindings` | `resolution === "fixable"` のみ、severity 不問 | `findings.filter((f) => f.resolution === "fixable")` — 一致 ✓ |
| `routed-findings.ts:113` Branch 3 | `collectFixableFindings(allFindings)` を使用 | `return collectFixableFindings(allFindings)` — 一致 ✓ |
| `code-fixer.ts` prompt 5 変種 | 「Ignore LOW severity findings」を全変種に含む | 行 150, 194, 221, 272, 293 で確認 — 一致 ✓ |
| `findings-ledger.ts:35` `collectFindingsLedger` | severity・修正実績不問で全件収集 | `collectFixableFindings` 呼び出しのみ、severity filter なし — 一致 ✓ |
| `regression-gate.ts:45` | `REGRESSION_GATE_MAX_ITERATIONS = 3` | `export const REGRESSION_GATE_MAX_ITERATIONS = 3` — 一致 ✓ |
| `judge-verdict.ts:210-224` `deriveRegressionGateVerdict` | `findings.some(f => f.resolution === "fixable")` で needs-fix | `if (findings.some((f) => f.resolution === "fixable")) return "needs-fix"` — 一致 ✓ |
| `regression-gate-system.ts:25` | ledger を「code-fixer が修正した fixable findings の完全リスト」と記述（実装と不一致） | `**入力**: 初回メッセージの **findings ledger** — code-fixer が修正した fixable findings の完全リスト` — 虚偽記述を確認 ✓ |
| `regression-gate.ts:58` | "The following findings were fixed during this job" — 虚偽 | `buildLedgerBlock` の文字列リテラルで確認 ✓ |
| `findings-ledger.ts:170` dedupeFindings key | `${f.file}|${f.line ?? ""}|${f.title}` | 一致 ✓ |

### 2. 要件→設計→タスクの対応確認

| 要件 | 設計決定 | タスク |
|------|----------|--------|
| 要件1: 既知未修正を needs-fix 事由にしない | D1: gate 判定層で fingerprint 照合除外 | T-02 |
| 要件2: routing と prompt の二重フィルタ解消 | D2: `selectFixerTargetFindings` 1 箇所 | T-01 |
| 要件3: ledger 説明の実態化 | D3: system prompt と buildLedgerBlock の記述修正 | T-03 |
| 要件4: 新規退行には needs-fix | D1: fingerprint 不一致の finding は除外されない | T-02, T-04 |
| 要件5: 既存テストの期待値変更は列挙 | D4: 変更 0 件（根拠あり） | T-04 |

### 3. spec.md の正規性確認

- Requirement ヘッダ 3 件すべてに SHALL / MUST / MUST NOT キーワードを確認 ✓
- 各 Requirement に複数の Scenario が付属 ✓
- Scenario は Given/When/Then 形式で挙動を具体的に記述 ✓
- Layer-1 振る舞いのみ記述（型や FSM 不変は含まない） ✓

### 4. 設計D1 の import cycle 分析

- `step-completion.ts → findings-ledger.ts` 方向: 新規だが cycle なし ✓
- `step-completion.ts → regression-gate.ts` 方向: 新規だが cycle なし ✓
- `findings-ledger.ts → reviewer-chain.ts` 方向: `computeRegressionLedger` が `deriveImplReviewerChain` を呼ぶ場合、`reviewer-chain.ts → regression-gate.ts → findings-ledger.ts` の間接循環が発生 — F-001 参照

### 5. 既存テストへの影響確認

- `routed-findings.test.ts`: Branch 3 テストのフィクスチャは全て `severity: "high"` fixable — `selectFixerTargetFindings` を適用しても保持。Branch 1 の conformance フィクスチャに low fixable があるが Branch 1 経路では Branch 3 へ到達しないため無影響 → green ✓
- `judge-verdict.test.ts:170-204` (`deriveRegressionGateVerdict`): 関数のシグネチャ・実装は変更なし → green ✓
- `judge-verdict.test.ts:349-384` (TC-021): state に ledger なし → 除外集合が空 → verdict 維持 → green ✓
- `step-completion-missing-file-finding.test.ts`: `makeState` は `steps: {}` → `computeRegressionLedger` が空を返す → `excludeKnownUnfixedRegressions` は no-op → 全 TC green ✓
- `regression-gate-step.test.ts`: `buildLedgerBlock` の前置き文言変更のみで、テストは finding title/file 包含と empty-ledger notice を検査 → green ✓
- `findings-ledger.test.ts`: `collectFindingsLedger` / `collectSpecReviewLedger` のシグネチャ変更なし → green ✓
- `grep "Ignore LOW severity"` および `grep "修正した"` を assert するテストが存在しないことを確認 → prompt 変更でのテスト破綻なし ✓

### 6. 受け入れ基準のトレーサビリティ

| 受け入れ基準 | 対応 task |
|-------------|-----------|
| 再現テスト（gate ↔ fixer ループなし） | T-04 |
| 新規退行テスト | T-04 |
| `grep "Ignore LOW severity" src/` が 0 件 | T-01 |
| ledger 説明が実態と一致 | T-03 |
| 期待値変更した既存テストが design.md の列挙と一致 | T-04 / D4 |
| `typecheck && test` が green | T-01〜T-04 |

### 7. ADR 要否

request.meta.adr = true。design.md に architect 評価済みの設計判断（D1〜D4）が明示されており、adr-gen が ADR を生成できる形式になっている。design.md に ADR パスの直接指定なし ✓

---

## 検証できなかった項目

- **実行時の偽ループ再現**: 実際の job ログや issue #952 のトレースを静的解析のみで追跡。fingerprint 照合が gate agent の実際の file/line/title 転記精度に依存するリスク（Risks セクションに記載済み）は確認できない。
- **MEDIUM-design-change 残存ループ**: design.md の Risks で明示済みだが scope 外。将来発現の可能性は排除できない。
- **`computeRegressionLedger` の実際のシグネチャ**: 実装前のため、import cycle 問題（F-001）の解消方法は実装者の選択に委ねる。

---

## Findings 詳細

### F-001: `computeRegressionLedger` を `findings-ledger.ts` に置くと間接循環 import が発生する

**severity**: high  
**resolution**: fixable  
**file**: specrunner/changes/regression-gate-false-loop/tasks.md  
**line**: 26

T-02 は `computeRegressionLedger(state, canonScope?)` を `findings-ledger.ts` に新設し、内部で `deriveImplReviewerChain(state)` を呼ぶよう指定している。現状の import グラフを追跡すると:

- `reviewer-chain.ts` (line 18): `import { REGRESSION_GATE_STEP_NAME } from "../step/regression-gate.js"`
- `regression-gate.ts` (line 27): `import { collectFindingsLedger, collectSpecReviewLedger, dedupeFindings } from "../pipeline/findings-ledger.js"`

`findings-ledger.ts` が `reviewer-chain.ts` を import した場合:

```
findings-ledger.ts → reviewer-chain.ts → regression-gate.ts → findings-ledger.ts
```

という間接循環が成立する。設計 D1 は「import cycle なし: `findings-ledger.ts` は `step-completion.ts` を参照しない」と説明しているが、この間接循環（`reviewer-chain.ts` 経由）を見落としている。

修正選択肢（いずれも `excludeKnownUnfixedRegressions` の純関数テスト可能性を維持できる）:

1. `computeRegressionLedger(reviewerChain: string[], state, canonScope?)` と signature を変え、`deriveImplReviewerChain` の呼び出しを呼び出し元（`step-completion.ts`）に移す。`findings-ledger.ts` は `reviewer-chain.ts` を import しなくて済む。
2. `computeRegressionLedger` を `regression-gate.ts` に置く。`regression-gate.ts` はすでに `findings-ledger.ts` と `reviewer-chain.ts` の両方を import しており新たな import が不要。`step-completion.ts` は `REGRESSION_GATE_STEP_NAME` と `computeRegressionLedger` を同一ファイルから import できる。

### F-002: legacy findingsPath フォールバックパスへの LOW 除外適用が tasks.md に記述されていない

**severity**: low  
**resolution**: fixable  
**file**: specrunner/changes/regression-gate-false-loop/tasks.md  
**line**: 35

T-01 は「standard path（`:241` 付近の `getLatestJudgeFindings` を使う分岐）で findings を `selectFixerTargetFindings` で絞る」と指定している。`code-fixer.ts` には structured findings が利用できない場合の standard path の legacy resume fallback（行 282-300、`findingsPath` 方式）があり、この経路では filtering が適用されない。

prompt から `Ignore LOW` 行を削除した後、この legacy パスでは code-fixer が LOW findings を明示的に除外する指示を受けなくなる。旧形式 job の resume という低頻度経路ではあるが、tasks.md に「legacy fallback への影響なし（使用頻度が極めて低い旧形式 job に限定）」または「legacy path でも filtering を適用する」のいずれかを明示すると曖昧さが消える。
