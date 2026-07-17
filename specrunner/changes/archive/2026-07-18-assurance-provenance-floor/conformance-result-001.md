# Conformance Result — assurance-provenance-floor — Iteration 001

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
| tasks.md | ✓ | 全チェックボックス [x] 済み（T-01〜T-07 全完了） |
| design.md | ✓ | D1〜D5 すべて実装に対応（achieved-assurance モジュール、floor gate 差し替え、runtime seam、BiteEvidenceRecord 拡張、CLI 供給） |
| spec.md | ✓ | 全 Requirements（achieved provenance / freeze+base-red / fail-closed / testDerivation+specReview / 二 OID primitive / BiteEvidenceRecord 後方互換 / 既存 gate 保存）と Scenarios が実装・テストで充足 |
| request.md | ✓ | 受け入れ基準 T1〜T8 すべて対応するテストが green（7265 tests passed）。TC-011 反転・T1〜T6 新規テスト・T7 スキーマテスト・T8 回帰保存すべて確認済み |

---

## 判定詳細

### tasks.md — 全タスク完了確認

T-01（diffPathsBetweenCommits 追加）、T-02（BiteEvidenceRecord schema）、T-03（in-loop gate OID 記入）、T-04（achieved-assurance モジュール）、T-05（archive floor gate 差し替え）、T-06（CLI 供給）、T-07（テスト群）のすべてのチェックボックスが `[x]`。

### design.md — D1〜D5 整合

- **D1**: `merge-then-archive.ts` Step 3.6 の `satisfiesFloor` 引数を `achieved` に差し替え。`getProfile`/`satisfiesFloor`/`STANDARD_PROFILE` は無変更。
- **D2**: `src/core/archive/achieved-assurance.ts` に `deriveAchievedAssurance()` を分離。Never throws 契約。specReview（純 state lookup）、testDerivation（baseOid+freeze）、biteEvidence（baseOid+freeze+base-red）の 3 次元を fail-closed で導出。
- **D3**: `BiteEvidenceRecord` に `baseOid?`/`candidateOid?`/`testHash?` を optional 追加。validation は present 時のみ string 型強制。旧形式は valid。in-loop gate が record 生成時に OID を埋める。
- **D4**: `RuntimeStrategy` に `diffPathsBetweenCommits?` 追加。`RealRuntimeStrategy` で required に昇格。local: `git diff --name-only <base> <head> -- <paths>`。managed: 常に unavailable。
- **D5**: `MergeThenArchiveInput` に `assuranceRuntime?`/`config?` 追加。`jobStateForFloor` を outer scope に hoist。CLI が `LocalRuntime` と `mergeConfig` を注入。

### spec.md — Requirements / Scenarios 充足

すべての SHALL/MUST 要件と Scenarios が実装とテストで充足されている。

- Requirement 1（achieved provenance 評価）: `reason === "match"` 分岐で `deriveAchievedAssurance` → `satisfiesFloor(achieved, floor)` に変更。Scenarios: TC-001（custom commands fail-closed）、TC-011反転（legacy profile fail-closed）、TC-003（達成 job 通過）。
- Requirement 2（freeze + base-red）: (a)baseOid+(b)freeze+(c)all-red の AND 条件。Scenarios: TC-004（tamper）、TC-005（hollow）。
- Requirement 3（fail-closed 網羅）: TC-006〜TC-011 で 6 経路すべて固定。
- Requirement 4（testDerivation/specReview 導出）: `state.steps[spec-review]` 有無で specReview、baseOid+freeze で testDerivation。Scenarios 固定済み。
- Requirement 5（二 OID primitive）: `diff-paths-between-commits.test.ts` で unchanged/changed/managed を固定。
- Requirement 6（BiteEvidenceRecord 後方互換）: `bite-evidence-record-schema.test.ts` で round-trip と旧形式 valid を固定。
- Requirement 7（既存 gate 保存）: 7265 tests green、既存テスト無変更（TC-011 反転のみ）。

### request.md — 受け入れ基準 T1〜T8

| 基準 | 対応テスト | 結果 |
|------|-----------|------|
| T1（anti-regression）| TC-001 | ✓ green |
| T2（宣言不認可）| merge-then-archive-floor.test.ts TC-011 反転 | ✓ green |
| T3（達成は通す）| TC-003 | ✓ green |
| T4（凍結の歯）| TC-004 | ✓ green |
| T5（空洞の歯）| TC-005 | ✓ green |
| T6（fail-closed 網羅）| TC-006〜TC-011 | ✓ green |
| T7（record 束縛）| bite-evidence-record-schema.test.ts | ✓ green |
| T8（回帰保存）| 7265 tests passed | ✓ green |
| typecheck && test | tsc --noEmit + vitest run | ✓ green |

---

## Observations（non-blocking）

クロスバウンダリレビュー（approved）で承認済みの低優先度指摘を引き継ぐ。

**OBS-1（LOW）**: `deriveAchievedAssurance` の `config === undefined` early return が `testDerivation` 導出まで落とす over-approximation。`testDerivation` は `config` を必要としないが、CLI では `config` undefined のとき `minimumAssurance` も undefined で gate が no-op のため dead code パス。実運用上の誤 fail-closed は発生しない。Phase 2 前に解消推奨。

**OBS-2（LOW）**: `core/archive → core/step/bite-evidence` クロスモジュール import（`resolveBaseCandidateOids`/`isExcludedPath`）が意味的結合を作る。design.md Risks 節に既知リスクとして計画あり。Phase 2 前に中立モジュールへ move 推奨。
