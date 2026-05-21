# Code Review: rename-propose-to-design — Iteration 1

## Summary

- **verdict**: approved
- **date**: 2026-05-13
- **reviewer**: code-reviewer agent

純粋なリネーミング変更。全 must シナリオ（T01–T12, T14–T18, T23–T24, T26–T27）を満たしており、ビルド・型チェック・テスト（145 files, 1715 tests）が全 pass。後方互換は `validateJobState` の on-read remap と `CAMEL_TO_KEBAB` エイリアスで適切に実装されている。

INFO レベルのコメント残存が複数あるが、いずれも機能への影響なし。

---

## Findings

### [INFO-01] `src/config/migrate.ts:54-57` — JSDoc に `agents.propose` が残存

`migrateConfig` の JSDoc コメント（ルール 2, 3 の説明文）が旧名称 `agents.propose` を参照したままになっている。

```
 * 2. If `agent` (legacy singular) exists AND `agents.propose` is NOT already set:
 *    - Copy `agent.id` → `agents.propose.agentId`
 * 3. Both concurrent: intermediate `agents` wins for any overlapping keys;
 *    legacy `agent.id` only fills in `propose` if not already present
```

実装コードは正しく `!result["design"]` を使用しているため機能影響なし。コメントを `agents.design` に更新することを推奨。

---

### [INFO-02] `src/config/schema.ts:124` — `@deprecated` アノテーションに `agents.propose` が残存

```ts
/** @deprecated Legacy single-agent format. Migrated to agents.propose at load time. */
```

実態は `agents.design` に移行するため、`agents.design` に更新すべき。

---

### [INFO-03] `src/prompts/design-system.ts:198` — JSDoc に "propose session" が残存

```ts
 * Template for the initial user message sent to the propose session.
```

`design session` に更新することを推奨。

---

### [INFO-04] `src/adapter/managed-agent/agent-runner.ts:248` — インラインコメントに "propose" が残存

```ts
// Return success — no resultContent for propose
```

`design` に更新することを推奨。同ファイル L89 のドキュメントコメント `Dispatches to propose-style (SSE + custom tools)` も同様（内部メソッド名は `runDesignStyle` に更新済みだが、説明文が未更新）。

---

### [INFO-05] `src/core/step/types.ts:49, 131` — JSDoc に "propose" が残存

- L49: `Used by propose, spec-fixer, implementer, and build-fixer.` → `design` に変更
- L131: `(e.g., propose).` → `(e.g., design).`

---

### [INFO-06] `src/core/agent/definition.ts:57` — JSDoc の例示に `"specrunner-propose"` が残存

```ts
/** Human-readable name on Anthropic (e.g. "specrunner-propose"). */
```

`"specrunner-design"` に更新することを推奨。

---

### [INFO-07] `src/adapter/managed-agent/sse-stream.ts:56` — JSDoc に "propose session" が残存

```ts
 * Start the propose session over SSE.
```

`design session` に更新することを推奨。

---

### [INFO-08] `src/core/port/session-client.ts:22, 55, 64` — インターフェースコメントに "propose" が残存

- L22: `pushed by propose;` → `pushed by design;`
- L55: `Used by propose-style steps` → `Used by design-style steps`
- L64: `the propose / agent's initial message` → `the design agent's initial message`

---

## Test Coverage (must シナリオ検証)

| ID | 内容 | 結果 |
|----|------|------|
| T01 | `src/core/step/propose.ts` が存在しない | ✅ pass |
| T02 | `src/core/step/design.ts` が存在する | ✅ pass |
| T03 | `src/prompts/propose-system.ts` が存在しない | ✅ pass |
| T04 | `src/prompts/design-system.ts` が存在する | ✅ pass |
| T05 | `StepName` に `"design"` が含まれ `"propose"` が含まれない | ✅ pass — `schema.ts:14–24` 確認 |
| T06 | `STANDARD_TRANSITIONS` で `"design"` が使用される | ✅ pass — `types.ts:60–61` 確認 |
| T07 | `startStep: "design"` が設定されている | ✅ pass — `pipeline-run.ts` で `pipeline.run("design", ...)` 確認 |
| T08 | `PROJECT_CONTEXT_STEPS` に `"design"` が含まれる | ✅ pass — `executor.ts:22–24` 確認 |
| T09 | `designAgentDefinition.role === "design"` | ✅ pass — `design.ts:21` 確認 |
| T10 | `designAgentDefinition.name === "specrunner-design"` | ✅ pass — `design.ts:20` 確認 |
| T11 | 旧 job state (`step: "propose"`) の resume が成功する | ✅ pass — `validateJobState` on-read remap 実装確認 |
| T12 | `validateJobState` が `"propose"` → `"design"` にリマップする | ✅ pass — `schema.ts:311–313` 確認 |
| T14 | `agents.design` キーが正常に機能する | ✅ pass — `schema.ts:276` 確認 |
| T15 | `bun run typecheck` が pass | ✅ pass — verification-result.md 確認 |
| T16 | `bun run test` が pass (145 files, 1715 tests) | ✅ pass — verification-result.md 確認 |
| T17 | step 名としての `"propose"` が src/ に残存しない | ✅ pass — 残存は backward compat コード (`state.schema.ts:311`) のみ |
| T18 | `grep-no-step-name-hardcode.test.ts` が pass | ✅ pass — `"design"` パターンに更新済み確認 |
| T23 | `tests/prompts/propose-system.test.ts` が存在しない | ✅ pass |
| T24 | `tests/prompts/design-system.test.ts` が存在する | ✅ pass |
| T26 | managed agent runner が `"design"` role で分岐 | ✅ pass — `agent-runner.ts:98` 確認 |
| T27 | `runDesignPipeline` が re-export される | ✅ pass — `pipeline/index.ts:5` 確認 |

---

## 特記事項

- `src/config/schema.ts:6` の `agents.{propose,specFixer,specReview}` は legacy format の**説明文**として機能しているため、そのまま残すことも可能。ただし `propose` が旧名称であることを注記するとより正確になる。
- `// Design D3 (propose-openspec-cli-and-step-model-config)` の ADR slug 参照は歴史的な設計決定への参照であるため、変更不要。
- `src/prompts/design-system.ts:205` の `Please design and propose an implementation plan` は英語の動詞用法であるため変更不要。
