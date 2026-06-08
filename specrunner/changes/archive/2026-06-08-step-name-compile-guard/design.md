# Design: AgentStepName ↔ AGENT_STEP_NAMES の手動同期を compile-time enforcement に置き換える

## Context

`src/kernel/agent-definition.ts` の `AgentStepName`（literal union 型）と
`src/kernel/step-names.ts` の `AGENT_STEP_NAMES`（`as const` 配列 = runtime 値）が
コメント（"Kept in sync with" / "derived from this array"）で手動同期されているだけで、
compile-time の強制がない。片方に step を足してもう片方を忘れても型エラーにならず、
drift が silent に発生しうる。

現状の関連構造:

- `kernel/agent-definition.ts` — kernel leaf。**import ゼロ**。`AgentStepName` を
  literal union として**非 export**で持ち、`AgentDefinition.role` の型に使う。
- `kernel/step-names.ts` — kernel leaf。**import ゼロ**。`AGENT_STEP_NAMES` 配列を export。
- `state/schema.ts` — shared-kernel。`AGENT_STEP_NAMES` を import し
  `export type AgentStepName = typeof AGENT_STEP_NAMES[number]` を派生。
  実コードの `AgentStepName` 消費者（`config/store.ts`, `config/getAgentId.ts`,
  `cli/managed.ts` 等）はすべてここから import している。
- `core/agent/definition.ts` / `core/step/step-names.ts` — それぞれ kernel への
  re-export barrel（`export *`）。

制約（実テストで operationalize 済み）:

- `tests/unit/architecture/core-invariants.test.ts` の
  **「`src/kernel/` は import ゼロ（leaf 相当）」** が、`src/kernel/` 配下の全ファイルに
  対し `from "` を grep し **allowlist なしの strict assertion** で 0 件を要求する。
  → kernel ファイルは型 import すら追加できない。
- 同ファイルの DSM closure model（§3 whitelist）では `kernel/` = `leaf`、`state/` =
  `shared-kernel`。`shared-kernel → leaf` の import は **許可された edge**。

## Goals / Non-Goals

**Goals**:

- `AgentStepName`（型）と `AGENT_STEP_NAMES`（配列）の整合性を **compile-time で双方向**に
  保証する。片方に値を足し他方に足し忘れたら `bun run typecheck` が fail する。
- kernel の zero-import 原則を **全 kernel ファイルで**維持する（agent-definition.ts /
  step-names.ts ともに import を増やさない）。
- drift が今後発生しないことを自動テストで regression 保護する。

**Non-Goals**:

- step の追加・削除（値そのものは変えない）。
- `StepName`（全 step 名）/ `CliStepName` の同様の整合性保証。スコープは
  `AgentStepName` のみ。
- `architecture/` 配下（out-of-loop ドキュメント）の更新。

## Decisions

### D1: guard を kernel の外（`src/state/schema.ts`）に置く

整合性 guard は `AGENT_STEP_NAMES`（runtime 配列）と `AgentStepName`（literal union 型）の
**両方が同時に見える**場所に置く必要がある。どちらも `kernel/` にあるため、guard を
kernel ファイル内に置くと import が発生し、`src/kernel/` zero-import 不変条件を破る。
`state/schema.ts` は shared-kernel で、すでに `AGENT_STEP_NAMES` を import しており、
`shared-kernel → leaf` の import は DSM whitelist 上許可されている。よって guard の host
として最適。

- **Rationale**: kernel = leaf は import 不可（`core-invariants.test.ts` が strict 強制）。
  guard を kernel に置く案は zero-import を破り受け入れ基準 #2 に反する。schema.ts なら
  既存の import 構造・層境界を一切壊さずに両者を参照できる。
- **Alternatives considered**:
  - (a) architect 案どおり `step-names.ts` に `satisfies readonly AgentStepName[]` を置く
    → step-names.ts（kernel）に型 import が必要となり zero-import test が fail。**却下**。
  - (b) kernel zero-import test を「intra-kernel の type-only import は許可」へ緩和
    → 維持すべき不変条件を弱める。受け入れ基準 #2 の趣旨に反する。**却下**。
  - (c) 専用ファイル `src/state/agent-step-name-guard.ts` を新設 → 成立するが、
    `AgentStepName` の home である schema.ts への co-location の方が発見性が高い。実装者が
    co-location を不適と判断した場合の代替として許容。

### D2: literal union を `agent-definition.ts` から export する

guard（schema.ts）が literal union を参照するには、その型が export されている必要がある。
`AgentStepName` を非 export → export に変えるだけで、import は一切追加しない（export は
import ではない）ため agent-definition.ts は zero-import のまま。literal union 本体は
agent-definition.ts に残す（architect の "残したまま" 要件・`AgentDefinition.role` の
ローカル参照を満たす）。

- **Rationale**: 非 export 型は他モジュールから import 不可。`export` 追加は import を
  生まない。union を kernel 外へ移す案は agent-definition.ts が逆に import を必要とし
  zero-import を破るため不可。
- **Alternatives considered**: union を schema.ts へ移設 → agent-definition.ts が
  `AgentDefinition.role` のために import を要し zero-import 違反。**却下**。

### D3: schema.ts の派生 `AgentStepName` を維持し、literal union と双方向照合する

`state/schema.ts` の公開型 `AgentStepName = typeof AGENT_STEP_NAMES[number]` はそのまま
残す（既存消費者の import を一切変えない）。schema.ts に literal union を **別名で
type-only import** し、配列派生型と literal union を**双方向**に照合する guard を置く。
guard が両者の同値を強制するため、どちらを "source of truth" と呼ぶかは問題でなくなる。

- **Rationale**: 公開 export の定義機構を変えないことで blast radius を最小化する。
  消費者は無改変。
- **Alternatives considered**:
  - (Option B) schema.ts で literal union を re-export し配列派生を廃止（型 source を
    一本化） → 概念的には clean だが広く import される export の定義機構を変える。基準
    達成には不要。実装者がより clean と判断すれば採用可。

### D4: distribution-safe な双方向 type assertion を使う

照合は **両方向**が必要:

- 配列 → 型: `AGENT_STEP_NAMES` の各値が literal union に含まれる。
- 型 → 配列（逆方向）: literal union の各メンバが配列に含まれる。

素朴な distributive conditional（`Union extends X ? true : never`）は union を分配し
`true | never` を `true` に畳んで**欠落を隠蔽する**。これを避けるため、tuple wrap
（`[A] extends [B]`）または `Exclude<A, B> extends never` 系の non-distributive な
assertion を用いる。runtime 値を emit しない **pure type-level** の assertion を推奨
（build 出力に dead code を残さない）。具体的な型テクニックは実装者に委ねる。

- **Rationale**: 単方向（`satisfies` のみ）では配列→型しか捕捉できず逆方向 drift を
  見逃す。distribution 由来の偽陰性は既知の footgun のため明示的に回避する。
- **Alternatives considered**: 単方向 `satisfies` のみ → 逆方向を捕捉できず基準 #1 を
  満たさない。**却下**。

### D5: 機構の自動証明（meta-test）+ 実定義での 1 回の手動確認

実定義は drift 状態で commit できない（build が壊れる）ため、「drift すれば typecheck が
fail する」ことの証明を 2 段で行う:

1. **meta-test**（`tests/` 配下、tsconfig の `include` に含まれ `bun run typecheck` で
   検査される）: literal union と配列の **mirror copy** を意図的に drift させ、
   `@ts-expect-error` で guard 技法が両方向の drift を捕捉することを assert する。in-sync
   の positive ケースも含める。既存 `step-names.test.ts` の `@ts-expect-error` 規約に倣う。
2. **手動確認**（実装中 1 回）: 実 `AGENT_STEP_NAMES` に bogus 値を一時追加し
   `bun run typecheck` が fail することを確認 → revert。結果を `implementation-notes.md`
   に記録する。

- **Rationale**: meta-test は機構を CI で regression 保護するが対象は copy。実定義での
  手動確認と組み合わせて初めて受け入れ基準 #1 を実体で裏付けられる。
- **Alternatives considered**: 実定義を drift させる negative test を commit → build が
  恒常的に壊れる。**却下**。

### D6: stale なコメントを更新する

`agent-definition.ts`（"Kept in sync with ..." / "inlined as a literal union"）と
`step-names.ts`（"derived from this array — add new agent steps here"）のコメントを、
**compile-time で強制されるようになった**旨と guard の所在（state/schema.ts）を指すよう
更新する。次の保守者が enforcement の存在と場所を把握できるようにする。

## Risks / Trade-offs

- [Risk] `agent-definition.ts` から `AgentStepName` を export すると、barrel
  `core/agent/definition.ts`（`export *`）経由で schema.ts の `AgentStepName` と同名の
  公開 symbol が 2 つ surface する。
  → **Mitigation**: 両 barrel（`core/agent/definition` と `state/schema`）を同時に
  `export *` するモジュールは存在せず、`AgentStepName` を agent-definition barrel から
  import している消費者も存在しない（消費者は `AgentDefinition` / `AGENT_TOOLSET_TYPE` /
  `CustomToolSpec` のみ）。両型は guard により同値が強制される。`bun run typecheck` で
  ambiguity がないことを確認する。

- [Risk] distributive conditional により逆方向（型→配列）の欠落が偽陰性化する。
  → **Mitigation**: tuple-wrap / `Exclude ... extends never` の non-distributive 技法を
  用い、meta-test で両方向を明示的に検証する。

- [Risk] meta-test は実 guard ではなく copy を検証するため false confidence になりうる。
  → **Mitigation**: D5 の手動確認を 1 回実施し実定義で裏付ける。meta-test の fixture は
  実 guard と同一の技法で書く。

- [Risk] guard を runtime const（`const _x: ... = true`）で書くと build に dead code が
  残る。
  → **Mitigation**: pure type-level assertion（値を emit しない形）を採用する。

## Open Questions

- Option A（schema.ts の配列派生を維持・別名 import で双方向照合）と Option B（literal
  union を schema.ts で re-export し配列派生を廃止）のいずれを採るか。**既定は Option A**
  （blast radius 最小）。Option B がより clean と実装者が判断すれば、受け入れ基準を満たす
  限り採用可。これは architect が実装者へ委ねた「具体的型テクニック」の範囲内の微決定。
