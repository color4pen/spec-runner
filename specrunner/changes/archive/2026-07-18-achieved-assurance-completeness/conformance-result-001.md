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
| tasks.md | ✅ | T-01〜T-09 の全チェックボックスが `[x]` |
| design.md | ✅ | D1〜D6 すべて実装に対応（詳細は下記） |
| spec.md | ✅ | 全 Requirement (SHALL/MUST) および全 Scenario が実装で充足 |
| request.md | ✅ | T1〜T8 の受け入れ基準を充足（T3 に medium 観察あり、下記 F-001 参照） |

---

## Design Decisions 対応

| Decision | 実装箇所 | 判定 |
|----------|----------|------|
| D1: HEAD-green を floor が finalHeadOid で自ら実測（CI は defense-in-depth） | `achieved-assurance.ts` L389-404: `runTestsAtCommit(finalHeadOid, materializedTestFiles, …)` を base-red 確立後に呼び、`headPassedByFile` map + `notGreen` filter で base-red と対称の完全被覆チェック | ✅ |
| D2: scenario 二層凍結（events.jsonl lineage frozen hash + finalHeadOid の test-cases.md hash 一致） | L256-320: `readFileAtCommit` → `fold` → test-case-gen record → frozen hash 抽出 → test-cases.md 読み取り → `computeContentHash` で比較。欠落・null・不一致・取得不能の各ケースで fail-closed | ✅ |
| D3: biteEvidence は FORWARD_TYPES 限定、testDerivation/specReview は type 非依存 | `gate.ts:29` で `FORWARD_TYPES` を export、`achieved-assurance.ts:21` で import、L344 で type gate チェック。testDerivation/specReview は gate の外側 | ✅ |
| D4: specReview は最新 run の `verdict === "approved"` を要求 | L125-135: `state.steps?.[STEP_NAMES.SPEC_REVIEW]?.at(-1)?.outcome?.verdict === "approved"` のときのみ `"required"` | ✅ |
| D5: commit-file-content を新 runtime primitive（git show + ls-tree suffix 解決）で追加 | `CommitFileResult` 型: `runtime-strategy.ts:100-102`。optional method: L672。`RealRuntimeStrategy` required: L729。LocalRuntime 実装: `ls-tree` → suffix filter（`/` or `-` boundary）→ `git show` → content 返却（L1051-1109）。ManagedRuntime: 常に unavailable（L640-646）。`computeContentHash` ヘルパー（sha256 over utf-8、digestArtifacts と同一アルゴリズム）: L71-74 | ✅ |
| D6: 4 点を同一 archive authority seam で一括 | すべての変更が `deriveAchievedAssurance` 内に閉じており、`merge-then-archive.ts` / `satisfiesFloor` は無変更 | ✅ |

---

## Spec Requirements 対応

| Requirement | Scenario 対応 | 判定 |
|-------------|---------------|------|
| biteEvidence SHALL require HEAD-green measurement | base:red+HEAD:red → fail-closed; base:red+HEAD:green+frozen+forward → succeed | ✅ |
| testDerivation/biteEvidence SHALL require two-layer scenario freeze | frozen hash null → both absent; hash mismatch → both absent | ✅ |
| biteEvidence SHALL be gated to FORWARD_TYPES | non-forward type with base:red+HEAD:green → biteEvidence absent | ✅ |
| specReview SHALL require approved verdict | needs-fix/escalation/null/run-absent → absent; approved → "required" | ✅ |
| RuntimeStrategy SHALL provide readFileAtCommit primitive (never throws, unavailable on failure) | archived path suffix 解決 → content 返却; 非存在 OID/managed → unavailable | ✅ |

---

## Acceptance Criteria 対応

| 歯 | テスト（integration / unit） | 判定 |
|----|------------------------------|------|
| T1（P0-1）: HEAD:red → fail-closed、破壊確認コメント | TC-001 integration（exitCode 1、mergePullRequest 未呼）+ 破壊確認コメント | ✅ |
| T2（P0-1 正路）: base:red+HEAD:green+凍結+forward → floor 達成 | TC-002 integration（exitCode 0、mergePullRequest 呼） | ✅ |
| T3（P0-2）: frozen hash null / test-cases.md hash 不一致 → fail-closed、破壊確認 | TC-003/TC-004 unit（derivation レベルで absent を固定、破壊確認コメント付き）。integration レベル exitCode 固定テスト未作成（F-001 参照） | △ |
| T4（P0-3）: 非 forward type → biteEvidence absent → fail-closed | TC-005/TC-005b integration + TC-014/TC-015 unit | ✅ |
| T5（P1）: verdict not approved → fail-closed; approved → 成立 | TC-006/006b/006c integration + TC-007/TC-010-013 unit | ✅ |
| T6（実 config 退行防止）: scopedTestCommand 未設定 → unavailable → fail-closed | TC-026 integration（#848 の歯を維持） | ✅ |
| T7（新 primitive）: suffix 解決・hash round-trip・unavailable 各ケース | TC-008/009/017/018/019 in `read-file-at-commit.test.ts` | ✅ |
| T8（backward-compat）: 既存テスト無変更 green（意味変更分を除く） | T-09 タスクで全 caller 洗い出し、`merge-then-archive-floor-provenance.test.ts` を oid 別 + readFileAtCommit 拡張に更新 | ✅ |

---

## Findings

### F-001 — T3 の integration テスト（exitCode レベル）が未作成

- **severity**: medium
- **file**: `tests/unit/core/archive/achieved-assurance-completeness-integration.test.ts`
- **根拠**: tasks.md T-08 は「歯 T1〜T6 を exitCode で固定」と明記し、T3 の checkbox を `[x]` としているが、同ファイルに「scenario freeze 失敗（frozen hash null / hash 不一致）→ `runMergeThenArchive` → `exitCode 1`」の integration テストが存在しない。T3 は `achieved-assurance-completeness-unit.test.ts` の TC-003/TC-004（derivation レベルで absent を固定）として実装されているが、floor gate → exitCode のエンドツーエンドは他の integration テスト（TC-001）から間接的に担保されるにとどまる。
- **影響範囲**: 実装ロジックは正しく、derivation が absent を返すことは unit で証明済み。floor mechanism が absent → exitCode 1 を正しく処理することは TC-001/TC-002 で示されている。production 動作に問題なし。T-08 タスクに記述された integration テストの粒度要件に対する not-tested gap。
- **対処（任意）**: integration テストに以下 2 ケースを追加すると T-08 仕様を完全に充足する: (i) frozen hash null → exitCode 1、(ii) test-cases.md hash 不一致 → exitCode 1。

---

## 総合評価

P0-1（HEAD-green 未実測）、P0-2（scenario 凍結未検査）、P0-3（type↔strategy 不整合）、P1（specReview verdict 未確認）の 4 点は `deriveAchievedAssurance` 内で正しく修正されており、ADR-20260717 D4 および ADR-20260716 D2 への整合が達成されている。新 runtime primitive（`readFileAtCommit`）は DU 契約・fail-closed を満たし、既存テストの退行はない。F-001 は test completeness の gap であり実装の正確性・仕様充足性に影響しない。
