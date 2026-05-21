# Review Feedback 001 — dsv-format-rules-expansion

- **verdict**: needs-fix
- **reviewer**: Claude code-reviewer
- **commit reviewed**: 3446f13e (HEAD on change/dsv-format-rules-expansion-ec5834bf)

## 概要

6 つの新 rule、共有 parser、registry/caller plumbing は仕様どおり実装されており、78 件の新 test と統合 test は全て green。acceptance criteria (rule 6 件・registry 9 件・`baselineSpecLoader` の DI・union 拡張・PR #359 regression・false-positive regression) は全て満たされている。

ただし、共有 parser `extractSection` に 1 件の correctness バグがあり、これが他 rule の false-positive を誘発する可能性がある。修正は局所的で、影響範囲は限定的だが、せっかく "spec format を機械的に検証する rule" を入れているので、その rule 自身が format ばらつきで誤検知するのは避けたい。1 件の major + 数件の minor を修正してから approve したい。

---

## Findings

### MAJOR

#### M1. `extractSection` が隣接 `##` セクションで誤検出 (false positive 誘発)

- **file**: `src/core/spec/rules/spec-content-parser.ts:82-91`
- **症状**: 2 つの `## ` セクションが間に空行なく隣接している場合、前の section の `extractSection` 結果に次セクションの header 行と本文が含まれてしまう。

**再現**:
```ts
const content = `## Removed\n## Renamed\n- "foo" → "bar"\n`;
extractSection(content, "## Removed");
// 期待: ""
// 実際: '## Renamed\n- "foo" → "bar"\n'
```

**根本原因**: `nextSectionMatch.lastIndex = sectionStart` で、直前の `\n` を含まない位置から `/\n## /g` を探索しているため、`\n## ` の `\n` を見落とす。`sectionStart` は header 直後の `\n` の **次** の位置を指している (line 79)。

**影響**:
- `removed-section-format` rule: 隣接 `## Renamed` (or 他 `## ` セクション) の中身を `## Removed` のコンテンツと誤認し、`## Renamed` header 行や中身の各行に false positive を出す。
- `renamed-section-format` rule: 同様。
- `requirement-header-required` / `scenario-required-per-requirement` / `normative-keyword-required`: `## Requirements` が EOF 直前以外で空に近い形だと同様の混入を起こす。
- 実 archive サンプル (TC-092) は空行を含むため踏まないが、agent が空セクションを生成する場合 (例: section header だけ書いて中身を埋めるのを忘れる) に false positive が出る。

**修正方針**:
```ts
// before
const nextSectionMatch = /\n## /g;
nextSectionMatch.lastIndex = sectionStart;

// after (option A: lastIndex を 1 戻す)
const nextSectionMatch = /\n## /g;
nextSectionMatch.lastIndex = Math.max(0, sectionStart - 1);

// after (option B: ^## を m フラグで)
const nextSectionMatch = /^## /gm;
nextSectionMatch.lastIndex = sectionStart;
// その場合 slice 範囲調整: content.slice(sectionStart, nextMatch.index)
```

option B のほうが意図が明確。

**test 追加**:
```ts
it("returns empty string when section is immediately followed by another ##", () => {
  const content = `## Removed\n## Renamed\n- "x" → "y"\n`;
  expect(extractSection(content, "## Removed")).toBe("");
});
```

---

### MINOR

#### m1. violation に行番号情報がない (fixer agent の修正効率に影響)

- **file**: `src/core/spec/rules/removed-section-format.ts:32-37`, `renamed-section-format.ts:32-37`, `requirement-header-required.ts:24-30`, `scenario-required-per-requirement.ts:24-30`, `normative-keyword-required.ts:28-34`, `baseline-header-match.ts:69-74`
- **症状**: `DeltaSpecViolation` は `path` と `reason` と `suggested` だけを持ち、行番号を含まない。`RequirementBlock` は `line` フィールドを持つが rule で使われていない。
- **影響**: 同じファイル内で複数 violation が出たとき、fixer agent は file 全体を読んで該当箇所を特定する必要がある。`canonical-spec-structure` も同じ設計なので一貫はしているが、新 rule 群では `line` がパース済みなのに利用していないのが残念。
- **修正方針**: `DeltaSpecViolation.suggested` に違反行の内容を含める (例: `'Found line: "### Removed: Foo" — replace with - "Foo"'`)。型変更なしで対応可能。または将来 task として `DeltaSpecViolation.line?: number` を追加して全 rule 一斉対応。

#### m2. `baseline-header-match` の violation が「どの header と一致しなかったか」を伝えない

- **file**: `src/core/spec/rules/baseline-header-match.ts:69-74`
- **症状**: case mismatch を検出したときの `suggested` は固定文字列 `"Match baseline header exactly for MODIFIED, or treat as ADDED if new"`。delta header の値も baseline の近い header の値も含まれない。
- **影響**: fixer は spec file を全部読んで baseline と diff する必要がある。本来 rule 内で「`### Requirement: foo bar` は baseline の `### Requirement: Foo Bar` にマッチさせるべき」と直接 hint できる。
- **修正方針**:
```ts
const baselineExact = baselineNormalizedHeaders.get(normalized);
violations.push({
  path: specPath,
  reason: "baseline-header-mismatch",
  suggested: `Header "${block.header}" appears to be a case/whitespace variant of baseline "${baselineExact}". Match exactly for MODIFIED, or rename to clearly indicate ADDED.`,
});
```

#### m3. `parseRequirementBlocks` の body trailing newline が冗長

- **file**: `src/core/spec/rules/spec-content-parser.ts:144`
- **症状**: `bodyLines.join("\n") + (bodyLines.length > 0 ? "\n" : "")` で末尾に余分な `\n` が付くことがある。例えば最後の要素が `""` のとき `body = "text\n\n"` となる。
- **影響**: `normative-keyword-required` の検査は `\bSHALL\b|\bMUST\b` の regex test なので影響なし。`baseline-header-match` も body を見ない。下流 consumer がいないので実害なし。test も pass している。
- **修正方針**: 必要性低い。気になるなら `bodyLines.join("\n")` だけにする (現状 1 行多い場合があるが trim 等で対応すれば bug ではない)。

#### m4. 隣接 section 用の test が欠落 (TC-026 でカバーしているのは「空行のみ」のケースのみ)

- **file**: `tests/unit/core/spec/rules/removed-section-format.test.ts:69-76`, `spec-content-parser.test.ts` 全体
- **症状**: M1 と関連。`## Removed\n## Renamed\n...` のような **隣接 `##` セクション** の test が無い。`extractSection` の TC-013/014/015 は単純 case のみで、section 同士が空行なく接した場合の挙動を検証していない。
- **修正方針**: M1 の修正と合わせて test 追加 (上記サンプルを参照)。

---

### NIT

#### n1. `extractSection` で `m` フラグを使えばより簡潔

- **file**: `src/core/spec/rules/spec-content-parser.ts:68-70`
- **詳細**: `new RegExp(\`(?:^|\\\\n)${escapeRegex(sectionHeader)}[ \\\\t]*(?=\\\\n|$)\`)` は `new RegExp(\`^${escapeRegex(sectionHeader)}[ \\\\t]*$\`, "m")` と書ける。可読性向上。

#### n2. `loadSpecFiles` の subdir read を Promise.all で並列化可能

- **file**: `src/core/spec/rules/spec-content-parser.ts:36-53`
- **詳細**: subdir loop が逐次 await。通常 1-5 spec なので体感差なし。気になるなら `await Promise.all(entries.map(async (entry) => { ... }))` に。

#### n3. verification-result.md の test 件数表記ズレ

- **file**: `specrunner/changes/dsv-format-rules-expansion/implementation-notes.md:51`
- **詳細**: implementation-notes は `2516 tests pass across 233 test files`、verification-result は `2529 passed (2529) / Test Files 235 passed (235)`。コミット間で数件 test 増えただけと思われ実害なし。

#### n4. `removed-section-format` / `renamed-section-format` の violation はファイル単位で重複しがち

- **file**: `src/core/spec/rules/removed-section-format.ts:25-39`
- **詳細**: 1 ファイルで複数行違反すると、各行で `path` が同じ violation が複数 push される。`reason` も `suggested` も identical なので冗長。aggregation するか、行情報を suggest に含めて区別する (m1 と統合) のが望ましい。

#### n5. 既存 baseline (`specrunner/specs/delta-spec-rule/spec.md`) の Purpose セクションが `## Purpose\n\nTBD\n## Requirements` で空行が 1 行しかない

- **file**: `specrunner/specs/delta-spec-rule/spec.md:1-4`
- **詳細**: review スコープ外だが、M1 の bug を抱えた `extractSection` で `## Purpose` を取りに行くと `## Requirements` の中身を返してしまうリスクあり。今回の rule は `## Purpose` を見ないので実害ないが、将来 `## Purpose` を見る rule を追加するときに踏む。M1 を直せば解消。

---

## Acceptance Criteria の状態

| Criterion | Status |
|---|---|
| 6 rule files exist with correct filenames | ✓ |
| `createDeltaSpecRegistry()` registers 9 rules (3 existing + 6 new) | ✓ (index.ts:26-39) |
| `DeltaSpecRuleInput.baselineSpecLoader?` added as optional | ✓ (types.ts:7) |
| `DeltaSpecRuleName` union includes 6 new names | ✓ (types.ts:15-20) |
| `DeltaSpecViolationReason` union includes 6 new reasons | ✓ (delta-spec-validator.ts:29-34) |
| PR #359 regression test green | ✓ (TC-022) |
| All tests green (`bun run test` / `bun run typecheck`) | ✓ (verified locally: 78 rule tests pass, typecheck 0 errors) |
| `validateDeltaSpecPaths` backward compatible (3-arg call) | ✓ (default `async () => null`, TC-081) |
| 3+ archive samples produce no false positives | ✓ (TC-092 — 3 representative samples) |
| Step injects real `baselineSpecLoader` from `specrunner/specs/<cap>/spec.md` | ✓ (delta-spec-validation.ts:45-52, TC-082/083) |

---

## Test Coverage vs test-cases.md

- **must TCs**: 全件カバー済み (verification report: 53/53 must covered)。
- **should TCs**: 全件カバー済み (TC-012, TC-015, TC-019, TC-025, TC-026, TC-036, TC-044, TC-054, TC-064, TC-066, TC-076, TC-096)。
- **GIVEN/WHEN/THEN 対応**: spot check で確認した範囲 (TC-022, TC-034, TC-051, TC-062, TC-063, TC-074, TC-075, TC-077) は全て assertion が一致。

唯一のギャップ: M1 で指摘した「隣接 `##` セクション」シナリオは test-cases.md にも無い。test-cases.md は spec rule の仕様を網羅しているが、共有 parser の edge case を直接 test するシナリオは TC-013〜TC-019 のみで隣接セクションを含まない。

---

## 結論

bug は 1 件 (M1) で、影響は「隣接 `##` セクションを書いた delta spec で false positive が出る」というケース。実害は限定的だが、本 rule 群が targeting している「機械的に format ばらつきを検出する」という目的に照らすと、parser 側でばらつき耐性を上げておきたい。M1 と m4 を併せて修正 + 1 件 test 追加してください。minor / nit は次の機会で OK。

