# Spec Review Result: centralize-step-name-constants

- **reviewer**: spec-reviewer
- **date**: 2026-05-13
- **verdict**: needs-fix

## Summary

設計方針は正しい。`step-names.ts` の配置、`as const` + `typeof` による型導出、依存方向（step-names → schema、循環なし）はすべて適切。問題はタスク分解の網羅性にある。grep で確認した実コードベースの step name リテラル出現箇所と、design.md File Impact Map / tasks.md のカバー範囲に有意なギャップがある。

## Architecture (verify)

**判定: pass**

- D1: `src/core/step/step-names.ts` は step 定義の中心地であり、凝集度が高い配置
- D2: `STEP_NAMES` から `StepName` 型を導出する設計は TypeScript の標準パターン。手動 union の廃止は正しい
- D3-D8: computed property、制御値 `"end"`/`"escalate"` の除外、後方互換 `"propose"` の除外はすべて適切
- 依存方向: `step-names.ts` → `schema.ts` の一方向。循環依存なし

## Correctness (verify)

**判定: needs-fix** — タスク分解のカバレッジ不足により、implementer が指示通り作業しても未置換リテラルが残る

### Finding 1 (high): `pipeline.ts` が File Impact Map とタスクから完全に欠落

`src/core/pipeline/pipeline.ts` に 8+ 箇所の step name リテラルがある:

| 行 | リテラル | 用途 |
|----|---------|------|
| 62 | `"spec-review"` | default loopName |
| 95 | `"design"` | fallback step (safety net) |
| 235 | `"spec-review"` | `this.steps.has()` |
| 236 | `"spec-review"` | `state.steps?.["spec-review"]` |
| 237 | `"spec-review"` | `getLatestStepResult()` |
| 285 | `"spec-review"` | `this.steps.has()` |
| 286 | `"spec-review"` | `state.steps?.["spec-review"]` |
| 287 | `"spec-review"` | `getLatestStepResult()` |
| 351 | `"design"` | special case in `getStepOutcome()` |

design.md File Impact Map にも tasks.md にも記載がない。Task 11 の「remaining files」リストにも含まれていない。

**修正**: design.md File Impact Map に `pipeline.ts` を追加し、tasks.md Task 11 のファイルリストに追加する。

### Finding 2 (medium): `pipeline-run.ts` が File Impact Map とタスクから欠落

`src/core/command/pipeline-run.ts` 行 74: `startStep: "design"` — step name リテラル。request.md 要件 5 のファイルリストには含まれているが、design.md File Impact Map と tasks.md のいずれにも記載がない。

**修正**: design.md File Impact Map に追加し、tasks.md Task 11 のファイルリストに追加する。

### Finding 3 (medium): Task 5 (`run.ts`) のカバレッジ不足

Task 5 は `createStandardPipeline` 内の steps Map / loopName / loopNames のみを記載しているが、同ファイルの `runDesignPipeline` にも step name リテラルがある:

| 行 | リテラル | 用途 |
|----|---------|------|
| 83 | `"design"` | `pipeline.run("design", ...)` |
| 112 | `"design"` | design-only steps Map |
| 117-118 | `"design"` x2 | design-only transition table |
| 127 | `"design"` | loopName |
| 130 | `"design"` | `pipeline.run("design", ...)` |

**修正**: Task 5 に `runDesignPipeline` / `runPipeline` 内のリテラルを追記する。

### Finding 4 (medium): Task 3 の scope が `name:` プロパティのみで、step 定義ファイル内の他のリテラルを未カバー

Task 3 は「`name: "step-name"` を置換」のみ記載。しかし各 step 定義ファイルには追加の step name リテラルがある:

- `role: "step-name"` — agent 定義の role プロパティ（8 ファイル）
- `state.steps?.["step-name"]` — step result 参照（spec-review.ts:57, code-review.ts:74, verification.ts:42）
- `getLatestStepResult(state, "step-name")` — 前ステップ結果参照（spec-fixer.ts:84, code-fixer.ts:70, build-fixer.ts:67）
- `branchNotSetError("step-name")` — エラー生成（pr-create.ts:29, implementer.ts:101, spec-fixer.ts:83, code-fixer.ts:68, build-fixer.ts:65, test-case-gen.ts:58）

受け入れ基準の grep で「step 定義の name プロパティ以外にヒットしない」と定めているため、これらはすべて変換対象。

**修正**: Task 3 の scope を拡大するか、これらのリテラルを Task 11 に明記する。`role:` プロパティについては、`agent.role` が step name と同値であることを design.md で明示し、定数化対象に含める旨を記載する。

### Finding 5 (low): Task 10 (`migrate.ts`) で key としての `"design"` が未カバー

`config/migrate.ts` 行 78: `result["design"]`、行 82: `result["design"]` — CAMEL_TO_KEBAB の値は Task 10 でカバーされているが、これらの key アクセスは記載なし。

**修正**: Task 10 または Task 11 に追記する。

### Finding 6 (low): `agent-runner.ts` の `step.agent.role === "design"` が scope 不明確

行 98: `step.agent.role === "design"` は agent.role の比較であり、step.name ではない。design.md D8 は「step.name === "code-review" 等の比較を定数化」と記載しているが、role 比較は明示されていない。agent.role の値は step name と同一文字列であり、受け入れ基準の grep でヒットする。

**修正**: この比較を定数化対象に含めるか、除外理由を明示する。

## Completeness (simplified — task decomposition coverage only)

**判定: needs-fix**

タスク 1-12 の分解自体は論理的だが、上記 Finding 1-4 により実コードベースとの乖離がある。特に Finding 1 (`pipeline.ts` の完全欠落) と Finding 4 (step 定義ファイルの追加リテラル) は、implementer が Task 12 の grep で初めて発見する未文書化 scope となる。

Task 12 の grep safety net は機能するが、未記載ファイルの修正方針が tasks.md にないため、implementer の判断負荷が高い。

## Consistency (skipped per review scope)

N/A

## Required Actions

1. **design.md File Impact Map** に `src/core/pipeline/pipeline.ts` と `src/core/command/pipeline-run.ts` を追加する
2. **tasks.md Task 5** に `runDesignPipeline` / `runPipeline` 内のリテラルを追記する
3. **tasks.md Task 11** のファイルリストに `pipeline.ts` と `pipeline-run.ts` を追加する
4. **tasks.md Task 3** の scope を拡大し、step 定義ファイル内の `role:`, `state.steps?.[...]`, `getLatestStepResult(...)`, `branchNotSetError(...)` のリテラルもカバーする（または Task 11 に明示的に列挙する）
5. **design.md** に `agent.role` 値の定数化方針を明記する（D9 スコープ外の更新、または新規 Design Decision として）
