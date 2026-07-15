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
| tasks.md | ✓ | T-01〜T-08 の全チェックボックスが [x]。変更ファイルスコープも T-08 の期待と一致 |
| design.md | ✓ | D1〜D8 の全決定が忠実に実装されている。§4 行なし・新 ADR なし（D8）を git diff で確認 |
| spec.md | ✓ | 全 SHALL/MUST 要件（seam DU / local 失敗経路 / managed unavailable / scope-check fail-closed / activation gate fail-closed / 挙動保存 consumer / predicate 相補）が実装・テストで固定されている |
| request.md | ✓ | 7 件の受け入れ基準を全充足。typecheck && test green（verification-result.md: passed） |

---

## 詳細

### J-1: tasks.md — 全チェックボックス完了

T-01〜T-08 の全チェックボックスが `[x]`。T-08 で指定された変更ファイルスコープ（`src/core/port/runtime-strategy.ts`、`local.ts`、`managed.ts`、`scope-check.ts`、`executor.ts`、`parallel-review-round.ts`、`no-op-detect.ts`、対応 test、`architecture/components.md`、`architecture/dynamic-model.md`）に収まっており、追加変更はいずれも T-06 の「grep で全 stub を列挙」マンデートに基づく機械的 DU 移行（`pipeline-integration.test.ts`、`commit-and-push.test.ts` 等）。

### J-2: design.md — 設計決定の実装忠実性

| 決定 | 実装箇所 | 確認 |
|------|---------|------|
| D1: `ChangedFilesResult` DU を port に定義 | `runtime-strategy.ts:75-77` — `{kind:"success"; files:string[]} \| {kind:"unavailable"; reason:string}` | ✓ |
| D2: LocalRuntime — exit 0→success / 非ゼロ→unavailable(exitCode) / throw→unavailable(msg) | `local.ts:699-718` | ✓ |
| D3: ManagedRuntime — unavailable、reason に worktree 不在説明 | `managed.ts:534-540` | ✓ |
| D4: fail-closed consumer — 既存ハンドラ再利用 | `scope-check.ts:62-64`（`synthesizeScopeUnverifiableFinding` 再利用）/ `executor.ts:278-283`（`changedFilesDerivable=false` 既存経路） | ✓ |
| D5: 挙動保存 consumer — `unavailable → []` 写像 | `parallel-review-round.ts:126` / `no-op-detect.ts:62` | ✓ |
| D6: 全 test fake DU 移行 + fail-closed 新挙動固定 | `list-changed-files.test.ts` / `scope-escalation.test.ts:1207-1310` / `executor-activation.test.ts:471-537` | ✓ |
| D7: architecture prose 更新 | `components.md:27,148,149` / `dynamic-model.md:61` — per-call 導出失敗を fail-closed 対象に明記 | ✓ |
| D8: §4 行なし・ADR なし | `architecture/model.md` diff 0 bytes / `specrunner/adr/` diff 0 bytes | ✓ |

### J-3: spec.md — 全要件適合

**Requirement: seam は success/unavailable を DU で区別する**
`ChangedFilesResult` が port 定義に存在し、port→domain 非依存（`reason: string` のみ）。seam は throw しない（try-catch / 同期返却）。空 success と unavailable が型で区別される。**適合**。

**Requirement: local runtime は git diff 失敗を unavailable として返す**
`local.ts:699-718`: exit 0→success / 非ゼロ→unavailable(exitCode) / catch→unavailable(msg)。`canDeriveChangedFiles()===true` 維持。success-empty を失敗時に返さない regression guard テスト（`list-changed-files.test.ts:122-133`）。**適合**。

**Requirement: managed runtime は unavailable を返す**
`managed.ts:534-540`: 常に unavailable。`canDeriveChangedFiles()===false` 維持。**適合**。

**Requirement: scope-check は unavailable を UNKNOWN 合成で fail-closed 化する**
`scope-check.ts:49-64`: canDerive===false 短絡（既存）不変 + `result.kind !== "success"` → `synthesizeScopeUnverifiableFinding` 新分岐。新 escalation 機構なし。**適合**。

**Requirement: activation gate は unavailable を reviewer 活性化で fail-closed 化する**
`executor.ts:272-289`: `result.kind !== "success"` → `changedFilesDerivable = false` → 既存 `evaluateActivation` の `changedFilesDerivable===false → activated:true` 経路。**適合**。

**Requirement: round-invalidation / no-op-detect は unavailable を no-signal として扱い現挙動を保存する**
両 consumer が `result.kind === "success" ? result.files : []` で写像。managed invalidation 不発・no-op escalate 方向が保存。fail-closed 化しない。**適合**。

**Requirement: capability predicate は DU と相補で維持される**
`local.ts:724`（true）・`managed.ts:550`（false）。`RealRuntimeStrategy` B-11 無傷。`components.md:149` に相補関係を明文化。**適合**。

### J-4: request.md — 受け入れ基準の全充足

1. `listChangedFiles` が `ChangedFilesResult` DU を返し、LocalRuntime で git diff 失敗時に `unavailable` を返すことをテストで固定 → `list-changed-files.test.ts` で非ゼロ終了・spawn throw の両失敗経路を固定、success-empty regression guard あり ✓
2. ManagedRuntime が `unavailable` を返すことをテストで固定 → 同ファイル ManagedRuntime セクション ✓
3. 導出能力のある runtime で `unavailable` の時、scope-check が UNKNOWN decision-needed finding を合成することをテストで固定 → `scope-escalation.test.ts:1207-1310`（verdict=escalation / resolution:decision-needed / severity:high / options≥2） ✓
4. 同 `unavailable` の時、activation gate が paths 条件付き reviewer を活性化する（skip しない）ことをテストで固定 → `executor-activation.test.ts:475-537`（runMock.toHaveBeenCalledOnce / verdict≠skipped） ✓
5. round-invalidation・no-op-detect の既存テストが無改変で green（挙動保存）。managed の invalidation 不発が不変 → verification-result.md test phase passed ✓
6. DU 化により全 consumer が discriminant を扱い、`[]`=「変更なし」への暗黙 fold が型として不能であることを確認 → typecheck phase passed、src 内 `string[]` 返却 stub 残存なし ✓
7. `typecheck && test` green → verification-result.md 全フェーズ passed ✓

---

## 非ブロッキング観察

以下は regression-gate（verdict: approved）と cross-boundary-invariants（verdict: approved）が承認済みの LOW 事項。本 verdict に影響しない。

- **F-01（LOW）**: `parallel-review-round.ts:74,104` ステイルコメント（「`listChangedFiles returns []`」旧記述）。行動的正しさは line 122–126 の実装と新コメントで担保。Fix=no・regression なし（regression-gate 確認済み）。
- **F-02（LOW）**: `scope.ts:176` rationale 文言が managed 向け旧文のまま（per-call 導出失敗経路では精度が低い）。escalation / decision-ledger / options は正確。Fix=no（regression-gate 確認済み）。
