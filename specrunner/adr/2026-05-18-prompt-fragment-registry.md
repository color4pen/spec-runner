# Prompt Fragment Registry

**Date**: 2026-05-18
**Status**: accepted

## Context

spec-runner の各 step system prompt は shared prompt fragment（4 種: `AUTHORITY_SPEC_GUARD_RULE` / `COMMIT_DISCIPLINE_RULE` / `DELTA_SPEC_FORMAT_RULES` / `PIPELINE_RULES`）を、実装者が手作業で個別 import + template literal `${FRAG}` 埋め込みで注入していた。

この procedural style では inject 関係が template literal の中に埋もれ、**inject 漏れを構造的に検出する仕組みが存在しない**状態だった。実際に以下の事故が発生した:

- **PR #303 escalation**: implementer が delta spec を業界慣習 format で記述し spec-merge parser が認識できず step halt。原因は `implementer-system` に `DELTA_SPEC_FORMAT_RULES` が inject されていなかったこと（#304）
- **PR #289 / #291**: implementer が authority spec を直接編集し spec-merge escalation。PR #294 で executor 側 guard を事後実装

inject 漏れの根本原因は「shared 化（ファイル分離）はされているが、使い方が実装者任せ」の構造にある。

## Decision

以下の 3 要素でシステムを再構成する:

### 1. Fragment 集約: `src/prompts/fragments.ts`

既存 4 ファイルを削除し、全 fragment を `fragments.ts` に string const として集約 export する。後方互換 re-export は残さない。const 名から `_RULE` / `_RULES` suffix を除去する（`AUTHORITY_SPEC_GUARD`, `COMMIT_DISCIPLINE`, `DELTA_SPEC_FORMAT`, `PIPELINE_RULES`）。

### 2. Builder 関数: `src/prompts/builder.ts`

```ts
export function buildSystemPrompt(base: string, fragments: readonly string[]): string {
  return [base, ...fragments].join("\n\n");
}
```

純粋関数 1 つのみ。registry / class / interface は実装しない。

### 3. 各 prompt が必要 fragment を array で列挙

```ts
// src/prompts/implementer-system.ts
export const IMPLEMENTER_SYSTEM_PROMPT = buildSystemPrompt(IMPLEMENTER_BASE, [
  AUTHORITY_SPEC_GUARD,
  COMMIT_DISCIPLINE,
  DELTA_SPEC_FORMAT,
]);
```

inject 関係が prompt ファイル内で完結し、array を見れば「この prompt が何 fragment を使うか」が一目でわかる。

### 4. inject 漏れ検出: test 側の対応表

inject 漏れ検出の真実源を **test** に置く（fragment metadata や registry には置かない）:

```ts
// tests/unit/prompts/fragment-coverage.test.ts
test.each([
  ["IMPLEMENTER",  IMPLEMENTER_SYSTEM_PROMPT,  [DELTA_SPEC_FORMAT, AUTHORITY_SPEC_GUARD, COMMIT_DISCIPLINE]],
  ...
])("%s contains required fragments", (_, prompt, required) => {
  for (const frag of required) expect(prompt).toContain(frag);
});
```

実 prompt 文字列に fragment が含まれているかを直接 assert する。

## Alternatives Considered

### Alternative A: Fragment に `applicableTo` metadata を持たせる registry 方式

```ts
// 採用しなかった案
export const AUTHORITY_SPEC_GUARD = {
  content: "...",
  applicableTo: ["implementer", "spec-fixer", "design"],
};
```

- **Pros**: fragment 側に inject 先の意図が明示される
- **Cons**: fragment の責務が「content 提供」を超える（SRP 違反）。fragment 追加時に applicableTo の更新を忘れると誤った安心感を生む。間接表現なので失敗時の原因が見えにくい
- **Why not**: inject 漏れの検出を fragment 側に依存させると「fragment を使っている」と「prompt に含まれている」が別々に管理される二重真実源になる

### Alternative B: template literal 埋め込みを維持しつつ lint ルールで漏れ検出

- **Pros**: 既存コードの変更が最小
- **Cons**: lint ルールの実装・保守コストが高い。fragment 追加のたびに lint ルールも更新が必要
- **Why not**: test で直接 assert する方が実装コストが低く、失敗時のメッセージが明示的

### Alternative C: 中央 registry map で step → 必要 fragment を管理

```ts
const STEP_FRAGMENTS: Record<string, readonly string[]> = {
  implementer: [AUTHORITY_SPEC_GUARD, COMMIT_DISCIPLINE, DELTA_SPEC_FORMAT],
  ...
};
```

- **Pros**: inject 関係の一覧が 1 ファイルに集約される
- **Cons**: 各 prompt ファイルが registry を参照する間接依存が発生。prompt の独立性が下がる
- **Why not**: prompt ファイル内の array 列挙と test 側の対応表で 2 か所管理になる。array 列挙のみの方が情報の流れが単純

### Alternative D: `delta-spec-format.ts` の従属 const (`CANONICAL_DELTA_SPEC_PATH_PATTERN` 等) を `fragments.ts` に移行

- **Pros**: 1 ファイルに全て集約できる
- **Cons**: これらの const は他ファイルから import されておらず（grep 確認済み）、fragment の責務範囲外
- **Why not**: 使われていない const を無条件に移行すると fragments.ts の責務が曖昧になる。削除で対応

## Consequences

### Positive

- inject 関係が prompt ファイルの array 列挙に表出し、レビュー・デバッグが容易になる
- `fragment-coverage.test.ts` の対応表が「どの prompt が何 fragment を必要とするか」の機械的な仕様書として機能し、漏れが CI で検出される
- fragment は content のみを責務とするため、fragment の追加・削除・編集時に触るファイルが最小になる
- 依存方向が prompt → fragment の片方向に統一され、fragment は inject 先を知らなくてよい

### Negative

- 既存 `tests/prompts/pipeline-rules.test.ts` を削除し `tests/unit/prompts/` に再配置する移行コストが発生する
- builder 経由化により base prompt の末尾に fragment が連結される形になるため、fragment が中間位置に埋め込まれていた既存 prompt はセクション構成の調整が必要

### Known Limitations

- builder 経由化の対象は「既存 fragment を取り込んでいるか、inject 漏れが観測済みの」8 prompt に限定。`test-case-gen-system` / `request-generate-system` / `request-review-system` は fragment 注入なしのまま残る（将来必要になれば同じ仕組みで追加可能）
- fragment の中身編集は本 change のスコープ外。content は既存と振る舞い同等

### Risks

- `_RULE` / `_RULES` suffix 除去は後方互換なし。deprecated re-export を残さないため、import 漏れは typecheck で即検出される（リスク低）
- builder 経由化で prompt の末尾構成が変わることによる agent 挙動の変化。base prompt 内のセクション構成を調整して fragment が末尾に来ても意味的に同等にすることで緩和
