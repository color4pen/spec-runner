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
| tasks.md | ✓ | 全チェックボックス [x] 完了 |
| design.md | ✓ | D1〜D6 全決定が実装に反映 |
| spec.md | ✓ | 全 Requirements/Scenarios を実装とテストが満たす |
| request.md | ✓ | 全受け入れ基準を実装とテストが満たす。typecheck && test green |

---

## 詳細

### tasks.md

T-01〜T-10 の全チェックボックスが `[x]` で完了済み。

### design.md

| 決定 | 実装確認 |
|------|----------|
| D1: ガードを `prepare()` の `bootstrapJob` 直前に配置 | `pipeline-run.ts:124` で `assertNoDuplicateLiveJob?.(cwd, slug)` が `bootstrapJob`（127行目）より前に存在。`slug` は nullable ではない `request.slug`（66行目）を使用（D1 代替案排除と整合） |
| D2: port に optional seam、RealRuntimeStrategy に required | `runtime-strategy.ts:413` optional、同 434 行で `RealRuntimeStrategy` 交差型に required として追加 |
| D3: injectable ピュア helper を `duplicate-slug-guard.ts` に切り出し | `checkDuplicateLiveJob(repoRoot, slug, deps?)` 実装。import は `node:fs/promises`/`node:path`/`util/paths`/`resume/safety`/`errors` に限定 |
| D4: 5段階の許容/拒否判定ロジック | 不在→許容、破損→許容、pid非number→許容、dead pid→許容、live pid→throw を順に実装 |
| D5: `DUPLICATE_LIVE_JOB` エラーコード、exitCode=2(ARG_ERROR)、actionable hint | `errors.ts` に `ERROR_CODES`・`EXIT_CODE_MAP`・`duplicateLiveJobError` factory を追加。priorJobId null/非null 両経路対応 |
| D6: `ManagedRuntime` は no-op | `managed.ts:540` で `// no-op` の空実装 |

### spec.md

| Requirement | テスト |
|-------------|--------|
| live な先行 job があるとき run を拒否（MUST）、job state を作らない（MUST NOT） | TC-01（unit）・TC-LR-01（integration）・TC-GUARD-01（bootstrapJob 未呼び出しを spy で固定） |
| stale/不在時は通常起動（MUST） | TC-02（dead pid）・TC-03（不在）・TC-LR-02（integration 不在）・TC-04（JSON破損）・TC-05（pid欠如） |
| 拒否エラーに先行 jobId と対処手段を含む（MUST） | TC-01 hint テスト・TC-GUARD-03 |
| isProcessAlive 再利用（MUST）、新規 pid 判定禁止（MUST NOT） | `duplicate-slug-guard.ts` の import が `safety.ts` の `isProcessAlive` のみ |
| managed runtime は no-op（MUST） | TC-015（`local-duplicate-guard.test.ts:146`） |

### request.md

| 受け入れ基準 | 確認 |
|-------------|------|
| live liveness.json → job state 未生成でエラー拒否（テスト固定） | TC-GUARD-01・TC-01・TC-LR-01 |
| stale/不在 → 通常起動（テスト固定） | TC-02・TC-03・TC-LR-02 |
| エラーメッセージに先行 jobId と対処手段（テスト固定） | TC-GUARD-03・TC-01 hint テスト |
| 既存テスト無変更 green | verification-result.md: 5853 tests passed |
| `typecheck && test` が green | build/typecheck/test/lint 全フェーズ passed |

### 追加観察

- アーキテクチャ不変条件 B-11（`src/core/runtime/` の具象クラスは `RealRuntimeStrategy` を使う）維持済み。
- regression-gate-result-001.md: approved。review feedback の2件（JSON.parse null 対処・TC-015 実装）が fix 確認済み。
- TC-GUARD-04 が追加されており、`assertNoDuplicateLiveJob` を持たない既存 fake runtime でのガードスキップ（optional-on-port + `?.` 呼び出し）も固定されている。
