# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### コードアサーション検証（6 点）

**1. `src/templates/step-output-templates.ts:109-116` — docstring の機械 parse 主張**

実測（line 109-116）:
```
/**
 * Template for test-cases.md (A-group).
 *
 * Machine-parsed fields:
 * - TC-NNN heading format
 * - Summary section (4 items)
 * - Result YAML block (all keys)
 */
```
`Result YAML block (all keys)` が machine-parsed と主張している。実態と食い違うことを確認した。✅

**2. `src/templates/step-output-templates.ts:117-163` — TEST_CASES_TEMPLATE Result ブロック**

実測（line 143-155）に Result セクションのフォーマット要求（`result: completed | partial | failed`）があるが、所有者・書込時点・enum 値の意味は一切記載なし。✅

**3. `src/core/step/test-case-gen.ts:89-99` — Result ファイル parse なし**

実測:
- `resultFilePath()` が `null` を返す（line 89-95）
- `parseResult()` が `NULL_PARSE_RESULT` を返す（line 97-99）
- コメントに「test-case-gen does not produce a pipeline-parsed verdict file」と明記

pipeline が Result YAML を parse しないことを確認した。✅

**4. `blocked_reasons` の参照先 grep**

`src/` 全域 grep の結果:
- `src/prompts/test-case-gen-system.ts`
- `src/templates/step-output-templates.ts`

上記 2 ファイルのみ。機械 parser が存在しないことを確認した。✅

**5. `src/prompts/test-case-gen-system.ts:71,75` — blocked_reasons 記録と Result YAML 配置指示**

- line 71: `blocked_reasons: ["TC-NNN — 理由"]` 形式の記録指示あり
- line 75: Result YAML ブロックを末尾に置く指示あり

いずれも `result` の enum 値の意味・確定時点・所有者の定義なし。✅

**6. `src/prompts/test-materialize-system.ts:43` — 変更禁止の記述（#880）**

実測（line 43）:
```
- test-cases.md は変更禁止
```

Result ブロック・result 欄への個別言及はなく、「result 欄だけは更新が求められている」という誤読を排除できていない。✅

**7. `src/core/step/write-scope.ts` — test-materialize の write scope**

実測（line 33-38）:
```ts
export const GUARDED_WRITE_STEPS: ReadonlySet<string> = new Set([
  "implementer",
  "build-fixer",
  "code-fixer",
  "test-materialize",
  "adr-gen",
]);
```

test-materialize が GUARDED_WRITE_STEPS に含まれ、`protectedCanonPaths` に `test-cases.md` があることを確認（line 64-73）。halt の設計的根拠が正しいことを確認した。✅

### 受け入れ基準の検証可能性

各受け入れ基準が以下の実体に対応することを確認した:
- AC#1 → `TEST_CASES_TEMPLATE` の文言（`src/templates/step-output-templates.ts`）
- AC#2 → `TEST_CASE_GEN_BASE` の文言（`src/prompts/test-case-gen-system.ts`）
- AC#3 → `TEST_MATERIALIZE_BASE` の文言（`src/prompts/test-materialize-system.ts`）
- AC#4 → `src/templates/step-output-templates.ts` docstring（line 109-116）
- AC#5 → 既存テストが `prompt-skeleton-drift-guard.test.ts` 等で green であること
- AC#6 → `typecheck && test`

既存の `prompt-skeleton-drift-guard.test.ts` に TC-012 で `TEST_CASES_TEMPLATE` の不在テストがあり、新テストの追加場所として整合している。

## 検証できなかった項目

None — 全アサーションが実コードから直接確認できた。

## Findings 詳細

None — コードアサーションはすべて事実と一致し、request は正確・最小・明瞭であり、設計判断の根拠も明記されている。
