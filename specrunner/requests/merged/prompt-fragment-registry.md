# shared prompt fragment を集約し、各 prompt が必要 fragment を array で列挙する形に揃える

## Meta

- **type**: new-feature
- **slug**: prompt-fragment-registry
- **base-branch**: main
- **adr**: true
- **date**: 2026-05-18
- **author**: color4pen
- **issue**: #305

## 背景

spec-runner は shared prompt fragment (= 4 種類) を inline procedural style で各 step prompt に注入している。

```
src/prompts/
├── authority-spec-guard.ts    → AUTHORITY_SPEC_GUARD_RULE
├── commit-discipline.ts       → COMMIT_DISCIPLINE_RULE
├── delta-spec-format.ts       → DELTA_SPEC_FORMAT_RULES
└── pipeline-rules.ts          → PIPELINE_RULES
```

各 step system prompt は **手作業で個別 import + template literal 埋め込み** で注入する形:

```ts
// e.g., src/prompts/spec-fixer-system.ts
import { DELTA_SPEC_FORMAT_RULES } from "./delta-spec-format.js";
import { AUTHORITY_SPEC_GUARD_RULE } from "./authority-spec-guard.js";
import { COMMIT_DISCIPLINE_RULE } from "./commit-discipline.js";

export const SPEC_FIXER_SYSTEM_PROMPT = `...
${DELTA_SPEC_FORMAT_RULES}
${AUTHORITY_SPEC_GUARD_RULE}
${COMMIT_DISCIPLINE_RULE}
...`;
```

### 問題

inject 漏れを検知する仕組みが構造的に存在しない。実態:

| prompt | DELTA_SPEC_FORMAT | AUTHORITY_GUARD | COMMIT | PIPELINE_RULES |
|---|---|---|---|---|
| design-system | ✓ | ✗ | ✗ | ✗ |
| spec-fixer-system | ✓ | ✓ | ✓ | ✗ |
| implementer-system | **✗** | ✓ | ✓ | ✗ |
| spec-review-system | ✗ | ✗ | ✗ | ✓ |
| code-fixer-system | ✗ | ✗ | ✓ | ✗ |
| code-review-system | ✗ | ✗ | ✗ | ✓ |
| build-fixer-system | ✗ | ✗ | ✓ | ✗ |
| adr-gen-system | ✗ | ✗ | ✗ | ✗ |
| test-case-gen-system | ✗ | ✗ | ✗ | ✗ |
| request-generate-system | ✗ | ✗ | ✗ | ✗ |
| request-review-system | ✗ | ✗ | ✗ | ✗ |

### 事故例

- **PR #303 escalation** (= adr-generation-step finish 時の `Delta spec is empty` 判定): implementer が delta spec を業界慣習 format (`### REQ-ADR-GEN-001:`) に書き換え、spec-merge parser が認識せず empty 判定 → step halt。原因は **implementer-system に DELTA_SPEC_FORMAT_RULES が inject されていない** こと (#304)
- **PR #289 / PR #291** (= 過去事故): implementer / agent が authority spec を直接編集して spec-merge escalation。後に PR #294 で executor 側 guard を実装

### 構造的根本原因

shared 化 (= ファイル分離) はされているが、**「使い方は agent (= 実装者) 任せ」** の procedural style。template literal `${FRAG}` 埋め込みは inject 関係が表記の中に埋もれ、漏れの検出が難しい。

## 設計判断

### Goal

- **重複排除**: 同じ注意書きを各 prompt に inline で散らさない、fragment を 1 箇所に集約する
- **inject 漏れ検出**: 「どの prompt が何 fragment を必要とするか」の対応表を test で lock し、漏れを構造的に検出できるようにする

### 1. fragment データの形式 — string const のみ (= 抽象化レイヤなし)

```ts
// src/prompts/fragments.ts
export const AUTHORITY_SPEC_GUARD = "...";
export const COMMIT_DISCIPLINE = "...";
export const DELTA_SPEC_FORMAT = "...";
export const PIPELINE_RULES = "...";
```

- interface / class / `applicableTo` / `category` / `description` なし
- fragment は **content (= string) のみ** が責務 (= SRP 純度高)
- 既存 4 files (= `authority-spec-guard.ts` / `commit-discipline.ts` / `delta-spec-format.ts` / `pipeline-rules.ts`) は `fragments.ts` に統合し削除

### 2. builder 関数 — 連結だけ

```ts
// src/prompts/builder.ts
export function buildSystemPrompt(base: string, fragments: readonly string[]): string {
  return [base, ...fragments].join("\n\n");
}
```

- 純粋関数 1 つ
- registry / map / filter なし
- test は引数差し替えだけで済む

### 3. 各 prompt 側が必要 fragment を array で列挙

```ts
// src/prompts/implementer-system.ts
import { AUTHORITY_SPEC_GUARD, COMMIT_DISCIPLINE, DELTA_SPEC_FORMAT } from "./fragments.js";
import { buildSystemPrompt } from "./builder.js";

const IMPLEMENTER_BASE = `You are the implementer agent...`;

export const IMPLEMENTER_SYSTEM_PROMPT = buildSystemPrompt(IMPLEMENTER_BASE, [
  AUTHORITY_SPEC_GUARD,
  COMMIT_DISCIPLINE,
  DELTA_SPEC_FORMAT,
]);
```

- inject 関係が **prompt file 内で完結** (= 冒頭の array を見れば「この prompt は何 fragment を使うか」が一目)
- fragment 側は自分が「どこで使われる」を知らなくていい (= 依存方向が自然、片方向)
- 各 prompt の独立性が高い (= 別の prompt の inject に影響しない)

### 4. inject 漏れ検出 — test で対応表を lock

中央集権の真実源を **test 側に置く** (= fragment や registry に置かない):

```ts
// tests/unit/prompts/fragment-coverage.test.ts
const EXPECTED: Array<[string, string, readonly string[]]> = [
  ["IMPLEMENTER_SYSTEM_PROMPT",  IMPLEMENTER_SYSTEM_PROMPT,  [DELTA_SPEC_FORMAT, AUTHORITY_SPEC_GUARD, COMMIT_DISCIPLINE]],
  ["DESIGN_SYSTEM_PROMPT",       DESIGN_SYSTEM_PROMPT,       [DELTA_SPEC_FORMAT, AUTHORITY_SPEC_GUARD]],
  ["SPEC_FIXER_SYSTEM_PROMPT",   SPEC_FIXER_SYSTEM_PROMPT,   [DELTA_SPEC_FORMAT, AUTHORITY_SPEC_GUARD, COMMIT_DISCIPLINE]],
  ["CODE_FIXER_SYSTEM_PROMPT",   CODE_FIXER_SYSTEM_PROMPT,   [DELTA_SPEC_FORMAT, AUTHORITY_SPEC_GUARD, COMMIT_DISCIPLINE]],
  ["BUILD_FIXER_SYSTEM_PROMPT",  BUILD_FIXER_SYSTEM_PROMPT,  [COMMIT_DISCIPLINE]],
  ["ADR_GEN_SYSTEM_PROMPT",      ADR_GEN_SYSTEM_PROMPT,      [COMMIT_DISCIPLINE]],
  ["SPEC_REVIEW_SYSTEM_PROMPT",  SPEC_REVIEW_SYSTEM_PROMPT,  [PIPELINE_RULES]],
  ["CODE_REVIEW_SYSTEM_PROMPT",  CODE_REVIEW_SYSTEM_PROMPT,  [PIPELINE_RULES]],
];

test.each(EXPECTED)("%s contains required fragments", (_, prompt, required) => {
  for (const frag of required) expect(prompt).toContain(frag);
});
```

- prompt 側 array に列挙忘れがあれば test で落ちる
- 必須対応表が EXPECTED に 1 箇所集約される
- registry の `applicableTo` で間接表現するより、**実 prompt 文字列に含まれているか** を直接 assert する方が失敗時の原因が明示的

### 5. 対象 prompt の builder 経由化 — 8 prompt に限定

builder 経由化は **以下 2 条件のいずれか** を満たす prompt のみ:

1. 既存 4 fragment のいずれかを現状取り込んでいる
2. 観測済の inject 漏れがある (= #304 implementer / Gap 2 design・code-fixer / Gap 3 adr-gen)

該当する 8 prompt:

- adr-gen-system / build-fixer-system / code-fixer-system / code-review-system / design-system / implementer-system / spec-fixer-system / spec-review-system

対象外 (= 取り込みなし + 漏れ観測なし):

- test-case-gen-system / request-generate-system / request-review-system

将来必要になれば同じ仕組みで乗せられる (= builder は string array を受け取るだけなので、pipeline step 用 / standalone コマンド用の区別なし)。

### 6. inject 漏れの構造的補強

migration 結果として以下の prompt 側 array に新規 fragment が追加される (= 既知の漏れ 4 件補強):

| prompt | 新規追加 fragment | 関連 |
|---|---|---|
| **implementer-system** | DELTA_SPEC_FORMAT | #304 解決 |
| **design-system** | AUTHORITY_SPEC_GUARD | Gap 2 |
| **code-fixer-system** | AUTHORITY_SPEC_GUARD / DELTA_SPEC_FORMAT | Gap 2 + Gap 3 関連 |
| **adr-gen-system** | COMMIT_DISCIPLINE | Gap 3 |

これら以外の新規追加は本 request スコープ外。

## 要件

### 1. fragment 集約

`src/prompts/fragments.ts` を新規作成し、以下 4 const を集約 export する (= 既存 4 files から内容を移動):

- `AUTHORITY_SPEC_GUARD: string`
- `COMMIT_DISCIPLINE: string`
- `DELTA_SPEC_FORMAT: string`
- `PIPELINE_RULES: string`

content は既存と振る舞い同等 (= 中身編集なし)。

### 2. 既存 4 単独 file の削除

以下を削除する (= 集約後の重複排除、後方互換 export は残さない):

- `src/prompts/authority-spec-guard.ts`
- `src/prompts/commit-discipline.ts`
- `src/prompts/delta-spec-format.ts`
- `src/prompts/pipeline-rules.ts`

各 file の全 export (= `AUTHORITY_SPEC_GUARD_RULE` / `COMMIT_DISCIPLINE_RULE` / `DELTA_SPEC_FORMAT_RULES` / `PIPELINE_RULES` のメイン const に加え、`delta-spec-format.ts` が export している `CANONICAL_DELTA_SPEC_PATH_PATTERN` / `BANNED_DELTA_SPEC_PATHS` / `VALID_SECTION_HEADERS` 等の従属 const も含む) を一括削除する。active code に import 元が残っていない (= archive 参照のみ) ことを事前確認すること。

### 3. builder 関数の実装

`src/prompts/builder.ts` を新規作成:

```ts
export function buildSystemPrompt(base: string, fragments: readonly string[]): string {
  return [base, ...fragments].join("\n\n");
}
```

- 純粋関数 1 つだけ
- registry / class / interface は実装しない

### 4. 対象 8 prompt の builder 経由化

以下 8 prompt を「base prompt + `buildSystemPrompt(BASE, [...])`」形式に書き換える:

- adr-gen-system.ts
- build-fixer-system.ts
- code-fixer-system.ts
- code-review-system.ts
- design-system.ts
- implementer-system.ts
- spec-fixer-system.ts
- spec-review-system.ts

各 file で:

- base prompt 部分を const 化 (= 例: `const IMPLEMENTER_BASE = "..."`)
- fragment は `[FRAG1, FRAG2, ...]` の array literal で列挙
- 最終 export は `buildSystemPrompt(BASE, [...])` の戻り値

### 5. inject 漏れの構造的補強 (= 8 prompt の array 内容)

以下の array に新規 fragment を追加する (= 設計判断 6 参照):

- `implementer-system` の array に `DELTA_SPEC_FORMAT` を含める
- `design-system` の array に `AUTHORITY_SPEC_GUARD` を含める
- `code-fixer-system` の array に `AUTHORITY_SPEC_GUARD` / `DELTA_SPEC_FORMAT` を含める
- `adr-gen-system` の array に `COMMIT_DISCIPLINE` を含める

### 6. 対応表の test lock

`tests/unit/prompts/fragment-coverage.test.ts` (= 新規) で 8 prompt の必須 fragment 対応表を assert する:

```ts
test.each([
  ["IMPLEMENTER",  IMPLEMENTER_SYSTEM_PROMPT,  [DELTA_SPEC_FORMAT, AUTHORITY_SPEC_GUARD, COMMIT_DISCIPLINE]],
  ["DESIGN",       DESIGN_SYSTEM_PROMPT,       [DELTA_SPEC_FORMAT, AUTHORITY_SPEC_GUARD]],
  ["SPEC_FIXER",   SPEC_FIXER_SYSTEM_PROMPT,   [DELTA_SPEC_FORMAT, AUTHORITY_SPEC_GUARD, COMMIT_DISCIPLINE]],
  ["CODE_FIXER",   CODE_FIXER_SYSTEM_PROMPT,   [DELTA_SPEC_FORMAT, AUTHORITY_SPEC_GUARD, COMMIT_DISCIPLINE]],
  ["BUILD_FIXER",  BUILD_FIXER_SYSTEM_PROMPT,  [COMMIT_DISCIPLINE]],
  ["ADR_GEN",      ADR_GEN_SYSTEM_PROMPT,      [COMMIT_DISCIPLINE]],
  ["SPEC_REVIEW",  SPEC_REVIEW_SYSTEM_PROMPT,  [PIPELINE_RULES]],
  ["CODE_REVIEW",  CODE_REVIEW_SYSTEM_PROMPT,  [PIPELINE_RULES]],
])("%s contains required fragments", (_, prompt, required) => {
  for (const frag of required) expect(prompt).toContain(frag);
});
```

各 prompt の array に列挙忘れがあれば test で落ちる。

### 7. builder の単独 test

`tests/unit/prompts/builder.test.ts` (= 新規):

- TC-BLD-01: `buildSystemPrompt(base, [f1, f2])` が `base + "\n\n" + f1 + "\n\n" + f2` を返す
- TC-BLD-02: `buildSystemPrompt(base, [])` が `base` のみ返す

### 8. 既存 prompt test の整理

既存 `tests/prompts/pipeline-rules.test.ts` は削除対象 `src/prompts/pipeline-rules.ts` を直接 import している (= 削除後 typecheck 失敗の原因)。本 request 内で以下のいずれかに移行する:

- **移行 A (= 推奨)**: 同 file を削除し、必要な PIPELINE_RULES 内容検証 (= "Severity" / "Categories" / "Findings Format" 等のセクション存在) を `tests/unit/prompts/fragments.test.ts` (= 新規) に統合 + 「`spec-review-system` / `code-review-system` が PIPELINE_RULES を含む」系の TC は `tests/unit/prompts/fragment-coverage.test.ts` (= 要件 6) で代替する
- **移行 B**: 同 file の import path を `../../src/prompts/fragments.js` に切り替え、「import する」系の TC (= TC-10 / TC-15) を `prompt.toContain(PIPELINE_RULES)` 形式に書き換え

他の prompt test (= `tests/prompts/design-system.test.ts` / `implementer-system.test.ts` / `spec-fixer-system.test.ts` / `spec-review-system.test.ts` / `test-case-gen-system.test.ts` / `dynamic-context-prompts.test.ts`) は import path が deleted file を指していないか確認し、必要に応じて `fragments.js` 経由に切り替える。

### 9. spec authority への反映

delta spec として `specrunner/changes/<slug>/specs/prompt-fragment-registry/spec.md` を新規作成し、`## ADDED Requirements` セクションで Requirement を記述する (= finish 時に spec-merge が baseline `specrunner/specs/prompt-fragment-registry/spec.md` を新規作成する経路。baseline は本 PR で直接作成しない、`AUTHORITY_SPEC_GUARD_RULE` 準拠):

- Purpose: shared prompt fragment を集約 export し、各 prompt 側で必要 fragment を array で列挙する形に揃える。inject 漏れは test 対応表で検出する。
- Requirement:
  - shared prompt fragment は `src/prompts/fragments.ts` に string const として集約 export される
  - prompt builder は `buildSystemPrompt(base: string, fragments: readonly string[]): string` の純粋関数として提供される
  - 各 system prompt は自身が必要とする fragment を array literal で列挙し、buildSystemPrompt 経由で構成する
  - fragment の inject 漏れは `tests/unit/prompts/fragment-coverage.test.ts` の対応表で構造的に検出される
  - fragment 側に inject 先 (= step 名 / prompt 名) を持たせない (= 依存方向は prompt → fragment の片方向)

## スコープ外

- 各 prompt に対する必要 fragment 群の正確な決定の改訂 (= 既知の漏れ補強のみ。新規の規律追加はしない)
- shared fragment の中身編集 (= 既存と振る舞い同等)
- 後方互換性 (= 既存 4 単独 file は削除、deprecated layer は残さない)
- 全 11 prompt の網羅的 builder 経由化 (= test-case-gen / request-generate / request-review は本 request では対象外)
- fragment 側 metadata (= applicableTo / category / description 等の構造化) — 案 A / 案 B 系の registry 抽象化は採用しない
- agent 側の prompt evaluation tooling

## 受け入れ基準

- [ ] `src/prompts/fragments.ts` で `AUTHORITY_SPEC_GUARD` / `COMMIT_DISCIPLINE` / `DELTA_SPEC_FORMAT` / `PIPELINE_RULES` の 4 string const が集約 export されている
- [ ] 既存 `src/prompts/{authority-spec-guard,commit-discipline,delta-spec-format,pipeline-rules}.ts` が削除されている
- [ ] `src/prompts/builder.ts` で `buildSystemPrompt(base: string, fragments: readonly string[]): string` 関数が実装されている
- [ ] 対象 8 prompt (= adr-gen / build-fixer / code-fixer / code-review / design / implementer / spec-fixer / spec-review) が `buildSystemPrompt(BASE, [...])` 経由に書き換えられている
- [ ] `implementer-system` の array に `DELTA_SPEC_FORMAT` が含まれる (= #304 構造的解決)
- [ ] `design-system` の array に `AUTHORITY_SPEC_GUARD` が含まれる
- [ ] `code-fixer-system` の array に `AUTHORITY_SPEC_GUARD` / `DELTA_SPEC_FORMAT` が含まれる
- [ ] `adr-gen-system` の array に `COMMIT_DISCIPLINE` が含まれる
- [ ] `tests/unit/prompts/builder.test.ts` が追加され green
- [ ] `tests/unit/prompts/fragment-coverage.test.ts` が 8 prompt の必須対応表で assert され green
- [ ] 既存 `tests/prompts/pipeline-rules.test.ts` が要件 8 の方針 (= 削除 + 統合、または import path 切り替え) で整理されている
- [ ] 既存 `tests/prompts/*.test.ts` のうち deleted file (= 4 single fragment files) を import しているものは `fragments.js` 経由に切り替えられている
- [ ] 既存 prompt test の regression なし
- [ ] `bun run typecheck && bun run test` が green
- [ ] delta spec `specrunner/changes/<slug>/specs/prompt-fragment-registry/spec.md` が `## ADDED Requirements` を持つ形で新規作成されている

## Workflow Options

- enabled: []
