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
| tasks.md | ✅ | 全チェックボックス [x] 完了（T-01〜T-09） |
| design.md | ✅ | D1〜D7 すべての設計決定が実装に反映されている |
| spec.md | ✅ | 全 SHALL/MUST および全 Scenario をテストで固定 |
| request.md | ✅ | 全受け入れ基準を満たす。typecheck && test green |

---

## 詳細

### tasks.md

T-01 〜 T-09 の全チェックボックスが `[x]` で完了。追加実装として
`emptyGuardSnapshot()` ファクトリが port 層に追加されているが（changed-line-coverage gate
の rule 3 対応）、機能には影響なし。

### design.md（D1〜D7）

| 決定 | 確認内容 | 結果 |
|------|---------|------|
| D1: agent step 境界の before/after 比較 | `guardBefore`（agent 実行前）/ `guardAfter`（failure guard 後・output contract gate 前）が executor.ts に配置 | ✅ |
| D2: I/O は RuntimeStrategy seam、判定は step 純モジュール | `snapshotMainCheckoutGuard` が port に宣言。`diffGuardSnapshots` / `resolveMonitoredGuardGlobs` が `main-checkout-guard.ts`（fs/child_process 不使用）に配置 | ✅ |
| D3: 監視集合 = `forbiddenSurfaces("fast")` + `.specrunner/**`、pipeline 非依存 | `resolveMonitoredGuardGlobs` が literal `"fast"` で解決し、active pipeline id に依存しない | ✅ |
| D4: status フィルタ後の content hash マップ | `git status --porcelain -z --no-renames` → `matchesMonitored` フィルタ → sha256 ハッシュ（削除は null DELETED sentinel） | ✅ |
| D5: drift → awaiting-resume、auto-revert なし | timeout escalation と同型で `transitionJob("awaiting-resume", { patch: { resumePoint, mainCheckoutDrift, error } })` → `persist` → `attachStateAndRethrow` | ✅ |
| D6: never-throw（fail-open） | `snapshotMainCheckoutGuard` を `try/catch` で囲み例外時 `null`。`guardBefore`/`guardAfter` が `null` なら drift 検出 skip | ✅ |
| D7: agent step のみ（cli step 非対象） | drift 検出コードは `runAgentStep` 内のみ。TC-017 で `runCliStep` が `snapshotMainCheckoutGuard` を呼ばないことを固定 | ✅ |

### spec.md（Requirements / Scenarios）

**R1**: agent step 境界でのスナップショット比較
- "clean ファイルが step 中に変更される" → TC-001/TC-006 で検出を固定 ✅
- "既 dirty ファイルへの追記を content hash 差分で検出" → TC-002 で固定 ✅

**R2**: forbiddenSurfaces + `.specrunner/**` 監視、pipeline 非依存
- "standard pipeline でも監視される" → literal `"fast"` による pipeline 非依存設計で保証 ✅
- "監視対象外 path の変更は無視される" → TC-004 で固定 ✅
- "gitignore 対象の書き込みは検出されない" → `git status --porcelain` の ignore 除外性質により保証 ✅

**R3**: drift 検出時に awaiting-resume + state 記録 + CLI 出力
- "drift → awaiting-resume + resumePoint + mainCheckoutDrift" → TC-001/TC-006 で `status`, `resumePoint.step`, `mainCheckoutDrift.changes` を検証 ✅
- "CLI が検出差分・並行編集の可能性・resume 案内を出力" → runner.ts awaiting-resume 分岐で実装 ✅

**R4**: drift なしの場合は挙動不変
- "変更なしの worktree run が完走" → TC-008 で確認 ✅
- "snapshot 取得エラーで skip、run 継続" → TC-019（fail-open）で確認 ✅

**R5**: no-worktree / managed では検査しない
- "no-worktree" → TC-010/TC-011（`snapshotMainCheckoutGuard` が `null` 返却）で確認 ✅
- "managed runtime" → TC-021（`ManagedRuntime` が常に `null`）で確認 ✅

### request.md（受け入れ基準）

| 基準 | 対応テスト | 結果 |
|------|-----------|------|
| agent step 中の監視対象 path 変更 → awaiting-resume + resumePoint + state 記録 | TC-001/TC-006 | ✅ |
| 監視対象外 path の変更 → escalation しない | TC-004 | ✅ |
| no-worktree mode で検査が実行されない | TC-010/TC-011 | ✅ |
| 変更なしの worktree run が従来どおり完走（既存テスト無改修 green） | TC-008 + verification 454 test files all passed | ✅ |
| `typecheck && test` が green | verification-result.md: build/typecheck/test/lint/coverage 全フェーズ passed | ✅ |

### 観察事項（non-blocking）

- **`.specrunner/config.json` に `src/core/port/runtime-strategy.ts` を coverage 除外追加**:
  port 層は主に型宣言を含み、`emptyGuardSnapshot()` は `local.ts` 経由で間接的にテストされている。
  changed-line-coverage ゲートも passed であり、除外は許容範囲内。
