# Conformance Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### Spec Requirements

#### Requirement: code-fixer SHALL inject the push capability notice in its prompt

`code-fixer.ts:129` で `const capabilityNotice = renderPushCapabilityNotice(deps.pushCapability ?? null)` を `buildMessage` の先頭（全分岐の前）で計算。

8 つの return path すべてに `+ capabilityNotice` が付与されていることを確認:
- Conformance branch, continuation path (L144) ✓
- Conformance branch, initial path (L164) ✓
- Coordinator loop, continuation path (L186) ✓
- Coordinator loop, aggregated-findings initial (L206) ✓
- Coordinator loop, fallback (L232) ✓
- Normal path, continuation (L263) ✓
- Normal path, with-findings initial (L284) ✓
- Normal path, findingsPath fallback (L304) ✓

テスト: TC-001 (初回 normal path), TC-002 (continuation), TC-003 (null capability), TC-016 (conformance branch), TC-017 (coordinator loop — aggregated-findings と fallback の両 sub-path) — すべて pass ✓

Scenarios:
- **code-fixer initial message with active pushCapability**: TC-001 で `"Push Capability Notice"` および `.github/workflows/**` パターンを含む ✓
- **code-fixer continuation message with active pushCapability**: TC-002 pass ✓
- **code-fixer message with no pushCapability**: TC-003 で `"Push Capability Notice"` を含まない ✓

#### Requirement: code-fixer SHALL declare the unpushable-path output contract when pushCapability is set

`code-fixer.ts:84–86` に `outputContracts` メソッド実装:
```ts
outputContracts(_state: JobState, deps: StepDeps): OutputContract[] {
  return buildUnpushablePathContracts(deps);
}
```

Scenarios:
- **code-fixer outputContracts with active pushCapability**: TC-004 — `kind: "unpushable-path"`, `policy: "follow-up"`, patterns 正確 ✓
- **code-fixer outputContracts without pushCapability**: TC-005 — `[]` を返す ✓

#### Requirement: spec-fixer SHALL inject the push capability notice in its prompt

`spec-fixer.ts:119` で同様の計算。5 つの return path すべてに付与:
- Conformance branch, continuation (L132) ✓
- Conformance branch, initial (L152) ✓
- Normal path, continuation (L169) ✓
- Normal path, with-findings initial (L190) ✓
- Normal path, fallback via `buildSpecFixerInitialMessage` (L198) ✓

Scenarios:
- **spec-fixer initial message with findings and active pushCapability**: TC-006 ✓
- **spec-fixer fallback message with active pushCapability**: TC-007 ✓
- **spec-fixer continuation message with active pushCapability**: TC-008 ✓
- **spec-fixer message with no pushCapability**: TC-009 ✓

#### Requirement: spec-fixer SHALL declare the unpushable-path output contract when pushCapability is set

`spec-fixer.ts:87–89` に同形の `outputContracts` 実装 ✓

Scenarios:
- **spec-fixer outputContracts with active pushCapability**: TC-010 ✓
- **spec-fixer outputContracts without pushCapability**: TC-011 ✓

#### Requirement: buildUnpushablePathContracts SHALL return an empty array when no patterns are declared

`fixer-helpers.ts:187–197`:
```ts
export function buildUnpushablePathContracts(deps: StepDeps): OutputContract[] {
  if (!deps.pushCapability || deps.pushCapability.patterns.length === 0) return [];
  return [{ kind: "unpushable-path", path: "", policy: "follow-up", patterns: deps.pushCapability.patterns }];
}
```

Scenarios:
- **null pushCapability**: TC-012 ✓
- **empty patterns array**: TC-013 ✓
- **non-empty patterns array**: TC-014 ✓（返却 contract の patterns は入力 array と同一）

#### Requirement: fixer steps SHALL rely on existing Layer 2 backstop when a follow-up cannot resolve the unpushable-path violation

`executor.ts:424` で executor gate から `unpushable-path` contracts を除外:
```ts
const allContracts = buildAllOutputContracts(step, state, deps)
  .filter((c) => c.kind !== "unpushable-path");
```

理由コメント (L415–421) も存在 ✓  
Layer 2 backstop (`commitAndPush → UnpushablePathBlockedError → makeUnpushablePathHalt → awaiting-resume halt`) は変更なし ✓

TC-015 (`fixer-push-capability.test.ts`) で Layer 1 → Layer 2 chain を段階的に検証:
1. `CodeFixerStep.outputContracts` が `policy: "follow-up"` 付き contract を宣言 ✓
2. attempt 1 で follow-up prompt が生成される (`buildOutputFollowUpPrompt`) ✓
3. attempt ≥ 2 では violations がフィルタ除外 → no second follow-up ✓
4. null-capability guard: `outputContracts` が `[]` を返す ✓

TC-014 (`unpushable-path-escalation.test.ts`): executor gate 除外を直接テスト —
`validateStepOutputs` は `unpushable-path` 単一 contract 宣言時に呼ばれない, `finalizeStepArtifacts` は呼ばれる ✓

TC-037 (`unpushable-path-escalation.test.ts`): `commitAndPush` が workflow ファイル存在時に `UNPUSHABLE_PATH_BLOCKED` をスローすることを確認 ✓

Scenario:
- **code-fixer follow-up does not resolve the violation**: TC-015 (chain), TC-037 (Layer 2) ✓

### Request Acceptance Criteria

| 受け入れ基準 | 確認結果 |
|---|---|
| pushCapability 宣言時、code-fixer / spec-fixer の prompt に capability notice が含まれる（unit test で固定） | ✓ TC-001, TC-002, TC-006–TC-008, TC-016, TC-017, TC-022, TC-023 pass |
| code-fixer / spec-fixer が unpushable path を変更した場合、Layer 2 halt の前に 1 回の follow-up prompt が送られる | ✓ outputContracts 宣言済み; TC-015 で chain 検証済み |
| follow-up 後も違反が残る場合は従来どおり UNPUSHABLE_PATH_BLOCKED で halt し、escalation marker が issue に投稿される | ✓ Layer 2 backstop 変更なし; TC-037 |
| implementer / request-review の既存挙動に変更がない | ✓ `git diff main -- implementer.ts request-review.ts`: 差分なし |
| typecheck / test / architecture tests が green | ✓ typecheck exit 0; 12601 tests passed |

### Gate Checks

| Gate | 結果 |
|---|---|
| TC-018: `bun run typecheck` exit 0 | ✓ |
| TC-019: `bun run test` 全 pass; fixer-push-capability.test.ts に最低 18 tests | ✓ 31 tests pass |
| TC-020: implementer.ts, request-review.ts 変更なし | ✓ diff なし |
| TC-021: step-context-builder.ts, output-verify.ts, commit-push.ts 変更なし | ✓ diff なし |

### Design / Tasks 参照（plan context — conformance gate 外）

- **D6 (executor gate 調整、retrospective)**: design.md D6 に documented, tasks.md T-06 に記録, operator ratified (issue #1086 decision 1 = option 2)。executor.ts への変更は設計上の non-goal を超えた修正だが、operator 決定によって規範化された。spec requirements および acceptance criteria にはすべて適合している。
- **Tasks.md checkbox 状態**: T-01 〜 T-06 すべて `[x]`。実装の完了を示す。

## 検証できなかった項目

None。すべての normative items（spec.md Requirements / Scenarios、request.md 受け入れ基準）が実装・テストにより確認された。

## Findings 詳細

None。normative 違反は検出されなかった。
