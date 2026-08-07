# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### バグの実在確認

`src/core/step/code-fixer.ts` を直接読み、以下を確認した。

| 行 | 文言 | 状態 |
|----|------|------|
| 148 | `Fix all HIGH and CRITICAL severity findings from the conformance review (mandatory)` | ✓ CRITICAL あり |
| 192 | `Fix all HIGH and CRITICAL severity findings (mandatory)` | ✓ CRITICAL あり |
| 219 | `Fix all HIGH severity findings (mandatory)` | ✗ **CRITICAL 欠落** |
| 270 | `Fix all HIGH and CRITICAL severity findings (mandatory)` | ✓ CRITICAL あり |
| 291 | `Fix all HIGH severity findings (mandatory)` | ✗ **CRITICAL 欠落** |

request.md の前提（行番号・経路・文言）はすべて実コードと一致する。

### 経路分岐の整合性

`isCoordinatorLoopActive`・`getNeedsFixMembers`・`collectParallelFixerFindings` の実装を確認し、design.md の 5 分岐説明（conformance / coordinator embedded / coordinator fallback / standard embedded / standard fallback）と実コードの分岐構造が一致することを確認した。

coordinator-loop fallback の発火条件は「`isCoordinatorLoopActive` true かつ `aggregatedFindings.length === 0` かつ `needsFixMembers.length > 0`」であり、`collectParallelFixerFindings` が reviewer の `toolResult.findings` を参照しているため、reviewer step に `toolResult` が無い状態でのテスト構築で再現可能であることを確認した。

### テスト補助構造の確認

- `makeStateWithCodeReviewResult` ヘルパーが `tests/unit/step/code-fixer.test.ts` に存在し、outcome に `findingsPath` はあるが `toolResult` が無い状態を生成する → `getLatestJudgeFindings` が null を返す → standard-path fallback に落ちる。design.md の記述と一致する。
- `CUSTOM_REVIEWERS_STEP_NAME` が `src/core/pipeline/types.ts:210` に定義されており、tasks.md の import パスと一致する。
- tests/ 配下に `Fix all HIGH severity findings`（`and CRITICAL` なし）を期待する assertion は存在しない（grep 0 件）。

### 受け入れ基準の検証可能性

- `grep "Fix all HIGH severity findings" src/core/step/code-fixer.ts` は修正後 0 件になることを確認できる（現在 2 件）。
- 全 5 経路の CRITICAL mandatory を固定するテストは、既存の state ヘルパーと `isCoordinatorLoopActive`/`getNeedsFixMembers` の挙動から構築可能。

### セキュリティ観点

変更はプロンプト文字列リテラルへの加筆のみ。ユーザー入力を処理せず、I/O・認証・アクセス制御に触れない。OWASP Top 10 の該当項目なし。

## 検証できなかった項目

- `buildCanonWriteScope(state, deps)` が coordinator-loop fallback テスト用状態で例外を投げないかの事前確認（実装時に確認が必要だが、spec の正確性には影響しない）。

## Findings 詳細

### F-01: tasks.md の `getConformanceFixContext` ファイル参照が不正確

tasks.md の T-02 conformance path 構築ガイダンスに「Check `getConformanceFixContext` in `src/core/step/code-fixer.ts`」とあるが、同関数は `src/core/step/fixer-helpers.ts` で定義されており、`code-fixer.ts` は import しているだけである。実装者が関数の shape 要件（`needs-fix:code-fixer` verdict + `toolResult.findings` 必要）を確認しようとすると、誤ったファイルに誘導される。テスト state 構築で参照先を誤る可能性がある。

**修正案**: tasks.md の当該行を「Check `getConformanceFixContext` in `src/core/step/fixer-helpers.ts`」に修正する。

### F-02: tasks.md の conformance path 状態構築ガイダンスの用語が曖昧

tasks.md T-02 に「a code-fixer step entry with conformance-triggered outcome」とあるが、実際に必要なのは **conformance step entry**（`state.steps["conformance"]`）である。`getConformanceFixContext` は `state.steps["conformance"]` を参照し、`state.steps["code-fixer"]` は参照しない。「code-fixer step entry」という表現が実装者を誤った state 構築に誘導する恐れがある。

**修正案**: 「a conformance step entry with verdict `needs-fix:code-fixer` and `toolResult.findings` populated」に修正する。
