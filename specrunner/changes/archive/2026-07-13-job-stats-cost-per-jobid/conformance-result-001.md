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
| tasks.md | ✅ | 全チェックボックス [x] 完了。T-01〜T-05 すべて実装済み |
| design.md | ✅ | D1（listWithSourceDirs 追加・list() 委譲）、D2（各 Section の sourceChangeDir 計算）、D3（resolveChangeDir 削除）いずれも実装通り |
| spec.md | ✅ | 3 Requirement / 3 Scenario すべて対応するテスト（TC-CROSS-001/002/003）で固定済み |
| request.md | ✅ | 全受け入れ基準を満たす。typecheck && test green（6473 tests passed） |

---

## 詳細

### tasks.md チェックボックス

全タスクが `[x]` で完了している。

| Task | 状態 |
|------|------|
| T-01: `ListedJobEntry` + `listWithSourceDirs()` 追加 | ✅ |
| T-02: `runJobStats` を `listWithSourceDirs()` に切替 | ✅ |
| T-03: IO fixture テスト（TC-CROSS-001/002/003） | ✅ |
| T-04: store 単体テスト（TC-SRC-01/02/03） | ✅ |
| T-05: typecheck + test 全体 green | ✅ |

### design.md 決定への適合

**D1**: `src/store/job-state-store.ts` に `ListedJobEntry` interface が export 追加。`listWithSourceDirs()` に元スキャンロジックを移植し、`list()` は委譲（`entries.map(e => e.state)`）に書き換え済み。既存 caller の型・挙動は不変。

**D2**: 各 Section が `stateJsonPath` の親に等価な式で `sourceChangeDir` を計算している。Section 4（managed marker）のみ `changeFolderPath(slug)` で active slug dir を指すという D2 例外規定に従っている。

**D3**: `import { resolveChangeDir }` が `job-stats.ts` から削除済み。`resolveChangeDir` 呼び出しと `if (changeDir)` ガードも削除され、`usagePath = path.join(sourceChangeDir, "usage.json")` で直接構成されている。

### spec.md Requirements への適合

- **R1（source change-dir から usage.json 解決）**: TC-CROSS-001 が archive / active の 2 dir を分離して読むことを検証（$0.80 / $1.60 / 合計 $2.40）
- **R2（legacy invocation は自行のみ）**: TC-CROSS-002 が jobId なし invocation の cross-dir 混入なしを検証
- **R3（usage.json 欠落 → null / drop なし）**: TC-CROSS-003 が `costUsd === null` かつ行存在を確認

### request.md 受け入れ基準

| 基準 | 状態 | 根拠 |
|------|------|------|
| 同一 base-slug・別 jobId の 2 run が各自の cost を計上 | ✅ | TC-CROSS-001 |
| legacy invocation が別 base-slug 行の集計へ混入しない | ✅ | TC-CROSS-002 |
| durationSec / convergence 導出が無変更 | ✅ | 既存 6473 tests green |
| usage.json 欠落行が null / drop なし | ✅ | TC-CROSS-003 |
| typecheck && test green | ✅ | verification-result.md: 全 5 phase passed |

### スコープ外逸脱確認

- `resolveChangeDir` のシグネチャ・挙動は変更なし ✅
- `list()` 返り値型 `JobState[]` は不変 ✅
- stats 出力フォーマット・集計ロジックに変更なし ✅
- `src/cli/__tests__/view-commands-worktree-guard.test.ts` で `mockList` → `mockListWithSourceDirs` に差し替えられているが、`runJobStats` 実装変更の直接的な帰結であり逸脱ではない
