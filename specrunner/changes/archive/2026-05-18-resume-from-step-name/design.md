# Design: resume-from-step-name

## Overview

`specrunner resume --from` が受け付ける値を legacy alias 3 種 (`critic` / `fixer` / `creator`) から、全 pipeline step 名 + legacy alias の union に拡張する。step 名を直接指定した場合は mapping なしでその step から再開する。

## 変更方針

型 signature の拡張 + 解決ロジックの分岐追加。既存の legacy alias 経路は一切変更せず、新しい step 名直接経路を **前段** に追加する。

## Component Structure

### Modified Files

| File | Change |
|------|--------|
| `src/core/resume/resolve-step.ts` | `ResumeFrom` 型を新設。`resolveResumeStep` の `--from` 経路に step 名直接分岐を追加。不正値時の error throw を追加 |
| `src/cli/command-registry.ts` | `resume.flags.from.values` の enum 制約を step 名 + legacy alias に拡張。USAGE 文字列を更新 |
| `tests/unit/core/resume/resolve-step.test.ts` | step 名直接指定・不正値 error の test case を追記 |

### New Files

なし。

## Type Design

```typescript
// src/core/resume/resolve-step.ts

/** Legacy alias — 後方互換維持 */
export type LegacyResumeRole = "critic" | "fixer" | "creator";

/** --from が受け付ける値: step 名 or legacy alias */
export type ResumeFrom = StepName | LegacyResumeRole;
```

`ResumeRole` は `LegacyResumeRole` に rename する（既存の export を置換）。

## 解決ロジック

`resolveResumeStep` の `from !== undefined` 分岐を以下の順で処理する:

```
1. from が StepName に含まれる → そのまま返す（mapping なし）
2. from が LegacyResumeRole に含まれる → 既存 STEP_MAPPING 経路（phase + role → step）
3. いずれにも該当しない → Error throw（利用可能値一覧を含む message）
```

step 名判定には既存の `STEP_NAMES` 定数の values を使う。`AGENT_STEP_NAMES` と `CLI_STEP_NAMES` の concat で全 step 名の配列を得られる。

## Error Message 設計

不正値時のメッセージ:
```
Invalid --from value: "<value>".
Valid step names: design, spec-review, spec-fixer, delta-spec-validation, delta-spec-fixer, test-case-gen, implementer, verification, build-fixer, code-review, code-fixer, pr-create
Legacy aliases: critic, fixer, creator
```

step 名一覧は `AGENT_STEP_NAMES` + `CLI_STEP_NAMES` から動的に列挙する（step 追加時の保守漏れ防止）。

## CLI Flag 変更

`command-registry.ts` の `resume.flags.from`:
- `values` を `[...AGENT_STEP_NAMES, ...CLI_STEP_NAMES, "critic", "fixer", "creator"]` に変更
- `flag-parser.ts` の既存 enum validation がそのまま利用できる（`values` 配列に含まれるかチェック）

USAGE 文字列の該当行:
```
--from=<step|alias>  Override resume step (e.g. code-review, implementer, critic)
```

全 step 名を USAGE に列挙すると冗長になるため、代表例 + alias を記載する。

## 後方互換

- legacy alias 3 種は既存の `STEP_MAPPING` 経路で処理され、振る舞いは一切変わらない
- `from` 未指定時の自動解決経路（Tier 2a/2b/2c/3）に変更なし
- `flag-parser.ts` 側の enum validation で `values` 配列が拡張されるだけなので、既存の reject パスも維持される
