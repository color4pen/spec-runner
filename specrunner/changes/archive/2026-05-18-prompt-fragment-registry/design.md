# Design: prompt-fragment-registry

## Overview

shared prompt fragment (4 種) を `src/prompts/fragments.ts` に集約し、各 prompt が `buildSystemPrompt(base, [frag1, frag2, ...])` で必要 fragment を array 列挙する形に統一する。inject 漏れは test 側の対応表で構造的に検出する。

## Current State

```
src/prompts/
├── authority-spec-guard.ts  → AUTHORITY_SPEC_GUARD_RULE (string const)
├── commit-discipline.ts     → COMMIT_DISCIPLINE_RULE (string const)
├── delta-spec-format.ts     → DELTA_SPEC_FORMAT_RULES (string const)
│                               + CANONICAL_DELTA_SPEC_PATH_PATTERN
│                               + BANNED_DELTA_SPEC_PATHS
│                               + VALID_SECTION_HEADERS
└── pipeline-rules.ts        → PIPELINE_RULES (string const)
```

各 prompt file が個別 import + template literal `${FRAG}` で注入。inject 関係が表記に埋もれ、漏れ検出が構造的に不可能。

### 既知の inject 漏れ (4 件)

| prompt | 不足 fragment | 関連 |
|---|---|---|
| implementer-system | DELTA_SPEC_FORMAT | #304 |
| design-system | AUTHORITY_SPEC_GUARD | Gap 2 |
| code-fixer-system | AUTHORITY_SPEC_GUARD, DELTA_SPEC_FORMAT | Gap 2 + Gap 3 |
| adr-gen-system | COMMIT_DISCIPLINE | Gap 3 |

## Target State

```
src/prompts/
├── fragments.ts   → AUTHORITY_SPEC_GUARD, COMMIT_DISCIPLINE,
│                    DELTA_SPEC_FORMAT, PIPELINE_RULES (4 string const)
├── builder.ts     → buildSystemPrompt(base, fragments) (純粋関数 1 つ)
├── design-system.ts         → buildSystemPrompt(BASE, [...]) 経由
├── implementer-system.ts    → buildSystemPrompt(BASE, [...]) 経由
├── spec-fixer-system.ts     → buildSystemPrompt(BASE, [...]) 経由
├── spec-review-system.ts    → buildSystemPrompt(BASE, [...]) 経由
├── code-review-system.ts    → buildSystemPrompt(BASE, [...]) 経由
├── code-fixer-system.ts     → buildSystemPrompt(BASE, [...]) 経由
├── build-fixer-system.ts    → buildSystemPrompt(BASE, [...]) 経由
├── adr-gen-system.ts        → buildSystemPrompt(BASE, [...]) 経由
│
│  (以下は builder 経由化対象外 — 現状維持)
├── test-case-gen-system.ts
├── request-generate-system.ts
└── request-review-system.ts

(削除)
├── authority-spec-guard.ts
├── commit-discipline.ts
├── delta-spec-format.ts
└── pipeline-rules.ts
```

## Design Decisions

### D1: fragment は string const のみ (interface / class / metadata なし)

fragment の責務は content 提供のみ。`applicableTo` / `category` / `description` 等の metadata を持たせない。inject 先の判断は prompt 側の array 列挙に委ね、検証は test 側の対応表で行う。

**根拠**: SRP 純度が高く、fragment 追加・削除時に触るファイルが最小。registry abstraction は YAGNI。

### D2: builder は連結だけの純粋関数

```ts
function buildSystemPrompt(base: string, fragments: readonly string[]): string
```

registry / map / filter / template engine なし。test は引数差し替えだけで済む。

### D3: inject 漏れ検出の真実源は test 側

中央集権の対応表を test に置く。prompt の export 値に対して `toContain(fragment)` で直接 assert する。fragment 側の `applicableTo` で間接表現するより、失敗時の原因が明示的。

### D4: const 名から `_RULE` / `_RULES` suffix を除去

既存:
- `AUTHORITY_SPEC_GUARD_RULE` → `AUTHORITY_SPEC_GUARD`
- `COMMIT_DISCIPLINE_RULE` → `COMMIT_DISCIPLINE`
- `DELTA_SPEC_FORMAT_RULES` → `DELTA_SPEC_FORMAT`
- `PIPELINE_RULES` → `PIPELINE_RULES` (既に suffix なし、変更なし)

**根拠**: fragment であることは import 元 (`fragments.ts`) から自明。後方互換 re-export は残さない。

### D5: `delta-spec-format.ts` の従属 const は削除

`CANONICAL_DELTA_SPEC_PATH_PATTERN` / `BANNED_DELTA_SPEC_PATHS` / `VALID_SECTION_HEADERS` は `delta-spec-format.ts` 内でのみ定義され、他ファイルから import されていない (grep 確認済み)。`fragments.ts` には移行しない。

### D6: `pipeline-rules.test.ts` の移行方針 — 移行 A (削除 + 統合)

`tests/prompts/pipeline-rules.test.ts` を削除し:
- PIPELINE_RULES 内容検証 (TC-01〜TC-08) → `tests/unit/prompts/fragments.test.ts` に移行
- prompt 含有検証 (TC-10〜TC-18) → `tests/unit/prompts/fragment-coverage.test.ts` に統合

**根拠**: import path 切り替え (移行 B) は既存 test の構造を温存するだけで、test 配置の整理機会を逃す。

### D7: builder 経由化の対象は 8 prompt に限定

fragment を現在取り込んでいるか、観測済 inject 漏れがある prompt のみ。test-case-gen / request-generate / request-review は対象外。将来必要になれば同じ仕組みで乗せられる。

### D8: 各 prompt の template literal 内 fragment 埋め込み位置

既存の prompt は fragment を template literal 内の任意位置に `${FRAG}` で埋め込んでいる。builder 経由化後は `buildSystemPrompt(BASE, [...])` で base の末尾に fragment が `\n\n` 区切りで連結される。

prompt 内で fragment が中間位置に埋め込まれている場合 (例: `spec-review-system.ts` の `## Pipeline Rules\n${PIPELINE_RULES}`)、base prompt 内のセクション構成を調整して fragment が末尾連結でも意味的に同等になるようにする。

## Fragment → Prompt 対応表 (migration 後)

| prompt | DELTA_SPEC_FORMAT | AUTHORITY_SPEC_GUARD | COMMIT_DISCIPLINE | PIPELINE_RULES |
|---|---|---|---|---|
| implementer-system | **+** | o | o | - |
| design-system | o | **+** | - | - |
| spec-fixer-system | o | o | o | - |
| code-fixer-system | **+** | **+** | o | - |
| build-fixer-system | - | - | o | - |
| adr-gen-system | - | - | **+** | - |
| spec-review-system | - | - | - | o |
| code-review-system | - | - | - | o |

凡例: `o` = 既存維持, `+` = 新規追加, `-` = 不要

## Test Structure (migration 後)

```
tests/
├── unit/
│   └── prompts/
│       ├── builder.test.ts              ← NEW: buildSystemPrompt の単体テスト
│       ├── fragments.test.ts            ← NEW: PIPELINE_RULES 内容検証 (旧 TC-01〜TC-08 移行)
│       └── fragment-coverage.test.ts    ← NEW: 8 prompt の必須 fragment 対応表 assert
│                                            + 旧 TC-10〜TC-18 統合
└── prompts/
    ├── design-system.test.ts            ← 変更なし (fragment file を直接 import していない)
    ├── implementer-system.test.ts       ← 変更なし
    ├── spec-fixer-system.test.ts        ← 変更なし
    ├── spec-review-system.test.ts       ← 変更なし
    ├── test-case-gen-system.test.ts     ← 変更なし
    ├── dynamic-context-prompts.test.ts  ← 変更なし
    └── (pipeline-rules.test.ts)         ← 削除
```

## Risk & Mitigation

| Risk | Impact | Mitigation |
|---|---|---|
| base prompt 末尾連結で prompt の意味が変わる | agent 挙動の変化 | base prompt 内のセクション構成を調整し、fragment が末尾に来ても意味的に同等にする |
| 既存 test が import path 変更で壊れる | typecheck / test 失敗 | grep で全 import を事前確認済み。壊れるのは `pipeline-rules.test.ts` のみ (移行 A で対応) |
| fragment rename (_RULE 除去) で import 漏れ | typecheck 失敗 | 全 import は 8 prompt file + 1 test file に限定。typecheck で即検出 |
