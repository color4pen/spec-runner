# Conformance Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:   implementation conforms to tasks.md, design.md, spec.md, and request.md
  - needs-fix:  one or more upstream artifacts are not satisfied by the implementation
  - escalation: conformance cannot be determined (missing artifacts, unresolvable ambiguity)
- The Findings table records the per-artifact judgment.
-->

- **verdict**: approved

## Conformance Findings

| Artifact | Conforms | Notes |
|----------|----------|-------|
| tasks.md | ✓ | T-01〜T-06 全 checkbox [x]。architecture/ / specrunner/adr/ 変更なし |
| design.md | ✓ | D1〜D5 すべて実装に反映。port doc comment 更新済み |
| spec.md | ✓ | 全 Requirement / 全 Scenario をテストで固定（D5 member-pending も Scenario に記載あり・テストで固定） |
| request.md | ✓ | 全受け入れ基準充足。verification passed（build/typecheck/test/lint/coverage 全 green） |

---

## 1. Tasks — 全 checkbox 完了確認

T-01〜T-06 の全 checkbox が `[x]` で完了。スコープ外確認:

- `architecture/` 配下: git diff 範囲に含まれない ✓
- `specrunner/adr/` 配下: git diff 範囲に含まれない ✓
- `commitRoundArtifacts` / `partitionRoundChanges` のロジック: 不変（呼び出し条件のみ変更）✓

---

## 2. Design decisions — 実装照合

| 決定 | 内容 | 実装箇所 | 判定 |
|------|------|----------|------|
| D1 | `WorktreeInspectionResult` DU を port に定義・export。port/RealRuntimeStrategy の署名を `Promise<WorktreeInspectionResult>` に変更 | `runtime-strategy.ts:63-65`（型定義）、L440（port optional）、L550（RealRuntimeStrategy required） | ✓ |
| D2 | local: exit 0 → `{kind:"success", paths}`、非ゼロ → `{kind:"unavailable", reason}`（exit code）、catch → `{kind:"unavailable", reason}`（エラー概要）。パースロジック不変 | `local.ts:848-876` | ✓ |
| D3 | managed: 常に `{kind:"success", paths:[]}` を返す。unavailable にしない | `managed.ts:562-564` | ✓ |
| D4 | consumer: `unavailable` → `aggregateVerdictResult="escalation"`、`roundError.code="ROUND_INSPECTION_UNAVAILABLE"`、`commitRoundArtifacts` 不呼び出し | `parallel-review-round.ts:238-250` | ✓ |
| D5 | inspection escalation（unavailable / ROUND_NONDECLARED_CHANGE）のとき `applyRoundResults` を skip → members が pending のまま persist | `parallel-review-round.ts:226（inspectionEscalated フラグ）、290-292（guard）` | ✓ |

port doc comment の「Never throws — returns [] on any error」除去を確認（grep で旧文字列が存在しないことを確認）。新 contract（success / unavailable の DU）が `runtime-strategy.ts:422-434` に記載済み。

---

## 3. Spec Requirements / Scenarios — 照合

### Requirement 1 — seam は DU を返す

- port `listWorktreeChanges?` → `Promise<WorktreeInspectionResult>`（optional, L440）✓
- `RealRuntimeStrategy.listWorktreeChanges` → `Promise<WorktreeInspectionResult>`（required, L550）✓
- throw しない点維持。`reason: string` で ports→domain 非依存 ✓
- **Scenario: 検査成功は変更集合を伴って返る** → `local-round-git.test.ts` L82-123 の success cases ✓
- **Scenario: 検査不能は診断文字列を伴って返る** → `local-round-git.test.ts` L61-78 の unavailable cases ✓

### Requirement 2 — local runtime は git 失敗を unavailable で返す

- **Scenario: exit 0 → success** → `local-round-git.test.ts` L82-123（空/単一/複数/短エントリ skip/削除）✓
- **Scenario: 非ゼロ終了 → unavailable（reason に exit code）** → `local-round-git.test.ts` L62-69 ✓
- **Scenario: spawn 例外 → unavailable（reason にエラー概要）** → `local-round-git.test.ts` L71-78 ✓

### Requirement 3 — managed runtime は success:[] を返す

- **Scenario: managed は常に success:[]** → `managed-round-git.test.ts` L38-49（2 case）✓

### Requirement 4 — coordinator は unavailable で fail-closed escalation

- **Scenario: 検査不能 → escalation、ROUND_INSPECTION_UNAVAILABLE、commitRoundArtifacts 不呼び出し** → Scenario 7（L454-530、4 test）✓
- **Scenario: 検査 escalation では round member を pending のまま persist する** → Scenario 8 L548-567（unavailable）、L569-587（offending）✓
- **Scenario: 検査成功 → 従来の宣言外変更検出・scoped commit が働く** → Scenarios 1〜4 維持 ✓
- **Scenario: seam 未実装の runtime では検査を skip する** → Scenario 6 L422-448 ✓

---

## 4. 受け入れ基準 — request.md

| 基準 | テスト / 確認箇所 | 判定 |
|------|----------------|------|
| local: 非ゼロ終了・spawn 例外 → `{kind:"unavailable"}` | `local-round-git.test.ts` L62-78 | ✓ |
| local: exit 0 → `{kind:"success", paths}` | `local-round-git.test.ts` L82-123 | ✓ |
| managed: `{kind:"success", paths:[]}` | `managed-round-git.test.ts` L37-49 | ✓ |
| consumer: unavailable → escalation + ROUND_INSPECTION_UNAVAILABLE + commitRoundArtifacts 不呼び出し | Scenario 7（3 独立 test） | ✓ |
| success 経路: 宣言外変更検出・scoped commit が既存テストで維持 | Scenarios 1〜4 | ✓ |
| inspection escalation → member statuses が pending | Scenario 8 L548-587（unavailable / offending 各 1 case） | ✓ |
| inspection 成功時、member statuses が approved（対の正の制御） | Scenario 8 L589-605 | ✓ |
| port doc comment: 旧記述除去・新 contract 更新 | `runtime-strategy.ts:422-434`（grep で旧文字列不在確認） | ✓ |
| `typecheck && test` green | verification-result.md: build/typecheck/test/lint/coverage 全 passed | ✓ |

---

## 5. スコープ外の不変確認

- `architecture/` 配下: 変更なし ✓
- `specrunner/adr/` 配下: 変更なし ✓
- `commitRoundArtifacts` / `partitionRoundChanges` のロジック: 不変（呼び出し条件のみ変更）✓
- managed parallel custom reviewer サポート拡張: なし ✓

---

## 6. 前回レビュー（conformance-result-001.md）との差分

前回 O-1 観察事項で「spec.md Requirement 4 に D5（member pending）の Scenario が未記載」と指摘されていたが、これは誤り。`spec.md` には「検査 escalation では round member を pending のまま persist する」Scenario が L81-86 に明示的に記載されており、テスト（Scenario 8）でも固定されている。O-1 はファクトエラーであり、実装の瑕疵ではない。全 Requirement・Scenario が実装とテストで担保されている。
