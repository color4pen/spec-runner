# Tasks: AgentStepName ↔ AGENT_STEP_NAMES compile-time sync guard

<!-- FORMAT REQUIREMENTS:
Task heading format: `## T-NN: <task name>` (2-digit zero-padded, e.g. T-01)
Sub-task format:     `- [ ] <implementation detail>` (checkbox)
Each task MUST end with an **Acceptance Criteria** section listing verifiable conditions.
-->

## T-01: `kernel/agent-definition.ts` — literal union を export 化 + コメント更新

- [x] `src/kernel/agent-definition.ts` の `type AgentStepName = ...` を
      `export type AgentStepName = ...` に変更する（値・メンバは一切変更しない）
- [x] `import` は追加しない（zero-import を維持）
- [x] ファイル冒頭およびユニオン直前の "Kept in sync with AGENT_STEP_NAMES" /
      "inlined as a literal union (mirrors ...)" コメントを、整合性が
      `src/state/schema.ts` の compile-time guard で強制される旨に更新する

**Acceptance Criteria**:
- `AgentStepName` が `export` され、`AgentDefinition.role` の型として引き続き使われている
- `src/kernel/agent-definition.ts` に `import` 文が 0 件（`from "` を含む行なし）
- literal union のメンバは変更前と同一（`design`〜`adr-gen` の 10 値）

## T-02: `state/schema.ts` — 双方向 compile-time sync guard を追加

- [x] `src/state/schema.ts` に literal union を **type-only かつ別名**で import する
      （例: `import type { AgentStepName as AgentStepNameUnion } from "../kernel/agent-definition.js";`）。
      既存の `export type AgentStepName = typeof AGENT_STEP_NAMES[number]` は維持する
- [x] 配列派生型（`typeof AGENT_STEP_NAMES[number]`）と literal union を **双方向**に
      照合する pure type-level guard を追加する。
      - 配列 → 型 と 型 → 配列 の両方向を assert すること
      - distribution による偽陰性を避けるため tuple-wrap（`[A] extends [B]`）または
        `Exclude<A, B> extends never` 系の non-distributive な技法を使うこと
      - runtime 値を emit しない形（pure type-level）にすること
      - 具体的型テクニックは実装者裁量（architect 委任範囲）
- [x] guard 部にコメントで意図（AGENT_STEP_NAMES と AgentStepName の同期強制）と、
      drift 時の対処（両方を更新する）を記す

**Acceptance Criteria**:
- 実定義が in-sync の現状で `bun run typecheck` が green
- guard が pure type-level（`const ... = true` 等の runtime emission を含まない）
- import 追加は `state/schema.ts`（shared-kernel）→ `kernel/agent-definition.ts`（leaf）の
  1 件のみで、DSM closure（shared-kernel→leaf は許可 edge）に適合
- 既存の `AgentStepName` 消費者（`config/store.ts`, `config/getAgentId.ts`,
  `cli/managed.ts` 等）が無改変でコンパイルできる

## T-03: `kernel/step-names.ts` — stale コメント更新（コード非変更）

- [x] `AGENT_STEP_NAMES` 上部の "AgentStepName is derived from this array — add new agent
      steps here." コメントを、`AgentStepName`（`kernel/agent-definition.ts`）と双方向の
      compile-time guard（`state/schema.ts`）で整合性が強制される旨に更新する
- [x] 配列の値・順序・`as const` は一切変更しない
- [x] `import` は追加しない（zero-import を維持）

**Acceptance Criteria**:
- `AGENT_STEP_NAMES` の値・順序が変更前と同一
- `src/kernel/step-names.ts` に `import` 文が 0 件

## T-04: meta-test — guard 機構の双方向 regression テストを追加

- [x] `AgentStepName` ↔ `AGENT_STEP_NAMES` の sync guard 機構を検証するテストを追加する。
      配置は `tests/unit/core/step/step-names.test.ts` への追記（既存の type-level
      `@ts-expect-error` 規約に倣う）または同等の `tests/` 配下ファイル
- [x] 意図的に drift させた **mirror copy**（literal union と `as const` 配列）に対し、
      guard と同一の型技法を適用し、以下を `@ts-expect-error` で assert する:
      - 配列 → 型 drift（配列にあり型にない値）を guard が型エラーとして捕捉する
      - 型 → 配列 drift（型にあり配列にない値）を guard が型エラーとして捕捉する
- [x] in-sync の mirror では guard が成立する（型エラーにならない）positive ケースを含める
- [x] `@ts-expect-error` は実際に型エラーが出る行（never への代入等の消費点）に付与する

**Acceptance Criteria**:
- `bun run typecheck` が green（`@ts-expect-error` が期待どおり機能し、未使用警告が出ない）
- `bun run test` で当該テストが green
- テストが両方向の drift と in-sync の 3 ケースを網羅している

## T-05: 実定義での手動 negative 確認

- [x] `src/kernel/step-names.ts` の `AGENT_STEP_NAMES` に bogus 値（例 `"__drift__"`）を
      一時追加し、`bun run typecheck` が **fail** することを確認する
- [x] 逆方向: `src/kernel/agent-definition.ts` の literal union に bogus メンバを一時追加し、
      `bun run typecheck` が **fail** することを確認する
- [x] 両方の一時変更を revert し、実定義が in-sync に戻っていることを確認する
- [x] 確認結果（両方向で fail したエラーメッセージ要旨）を
      `specrunner/changes/step-name-compile-guard/implementation-notes.md` に記録する

**Acceptance Criteria**:
- 両方向の一時 drift で `bun run typecheck` が fail したことが記録されている
- revert 後に実定義が変更前と同一（diff に bogus 値が残っていない）
- `implementation-notes.md` に手動確認の記録がある

## T-06: 全体 verification

- [x] `bun run typecheck` が green
- [x] `bun run test` が green（既存 `tests/unit/core/step/step-names.test.ts`,
      `tests/agent-definition.test.ts` を含む）
- [x] `bun run lint` が green（`--max-warnings 0`）
- [x] `tests/unit/architecture/core-invariants.test.ts` の
      「`src/kernel/` は import ゼロ（leaf 相当）」が green
- [x] 同テストの DSM closure「§3 whitelist に無い import edge は存在しない」が green
      （新 edge は shared-kernel→leaf の許可 edge のため allowlist 追加不要）

**Acceptance Criteria**:
- `bun run typecheck && bun run test && bun run lint` が全 green
- kernel zero-import 不変条件テストが green
- DSM closure テストが green（allowlist への新規追加なし）
