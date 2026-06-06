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
| tasks.md | ✅ | T-01〜T-09 全チェックボックス [x] |
| design.md | ✅ | D1〜D7 すべて実装で満たされている |
| spec.md | ✅ | 全 SHALL/MUST/MUST NOT 要件を実装が満たす |
| request.md | ✅ | 受け入れ基準 AC-1〜AC-4 すべて green |

---

## 詳細

### tasks.md — 全チェックボックス complete

T-01〜T-09 の全チェックボックスが `[x]`。

### design.md — 設計判断 D1〜D7 との整合

| 判断 | 確認結果 |
|------|----------|
| D1: `buildInitialJobState()` 純粋関数 + `bootstrapJob()` ポート | `LocalRuntime.bootstrapJob()` は I/O なし。`ManagedRuntime.bootstrapJob()` は `JobStateStore.create()` 委譲。`pipeline-run.ts` は `this.runtime.bootstrapJob()` に切り替え ✓ |
| D2: `setupWorkspace` で seed + `updateJobState` slug 一本化 | `WorkspaceOptions.bootstrapState` 追加。新規 worktree 作成 3 経路すべてで seed。`updateJobState()` は slug store のみ ✓ |
| D3: machine-local / portable の writer 単一化 | slug-mode strip で portable のみ slug 正本へ。`writeLivenessSidecar()` が machine-local の唯一 writer。resume-reuse で pid refresh ✓ |
| D4: cross-cutting persist を runtime-dispatch / sidecar-inference に分離 | `persistJobState()` ポート追加（runner で使用）。`resolveStateStoreByJobId()` を `core/job-access/` に新設（resume / cancel / exit-guard global で使用）。pipeline crash は `deps.storeFactory()` 経由 ✓ |
| D5: bootstrap crash window 許容 | 設計レベルの判断。`LocalRuntime.bootstrapJob()` は I/O なし、design.md に明示 ✓ |
| D6: cancel の local job は degraded 許容 | `cancelSingleJob()` で store=null 時は skip。jobId は sidecar に保持 ✓ |
| D7: managed 書き込み・load fallback・xdg 温存 | `ManagedRuntime.persistJobState()` は jobId store 書き込み維持。`load()` fallback / xdg 変更なし ✓ |

### spec.md — 要件との整合

**Req 1（初期 state defer）**: `LocalRuntime.bootstrapJob()` は `buildInitialJobState()` のみ（MUST NOT I/O）。TC-NJW-001 が `fs.access(getJobsDir(tempDir))` ENOENT をアサート ✓

**Req 2（updateJobState slug-only）**: `updateJobState()` は slug store のみ。slug-mode strip で machine-local フィールドは slug 正本に書かれない ✓

**Req 3（全 persist 経路 jobId store に書かない）**:
- WORKSPACE_SETUP_FAILED → `persistJobState(…, null, …)` → local: slug store 未解決 → skip ✓
- INIT_FAILED → `persistJobState(…, workspace, …)` → workspace.worktreePath 経由で slug store ✓
- pipeline crash → `deps.storeFactory()` → local: slug store ✓
- resume → `resolveStateStoreByJobId()` → sidecar kind="local" → slug store / null ✓
- exit-guard global → `resolveStateStoreByJobId()` → slug store ✓
- cancel → `resolveStateStoreByJobId()` → worktree 消失時 null → skip ✓
- managed → jobId store（温存） ✓

**Req 4（jobs-dir 生成なし）**: TC-NJW-001〜005 が全経路を網羅 ✓

**Req 5（R1 読み取り経路温存 + 検証 green）**: 283 test files / 3322 tests green ✓

### request.md — 受け入れ基準

| AC | 確認結果 |
|----|----------|
| local run/resume/cancel 後に `.specrunner/jobs/<jobId>/` 作成・更新なし（integration test） | TC-NJW-001〜005 が全経路でアサート ✓ |
| state 更新後、slug 正本と sidecar が最新化 | TC-NJW-002: worktree 内 slug state.json 存在確認。TC-NJW-003/005: canonical dir の status 更新確認。全新規 worktree 経路で `writeLivenessSidecar()` 呼び出し ✓ |
| R1 読み取り経路が引き続き state 取得（既存テスト green） | 3322 tests green ✓ |
| `bun run typecheck && bun run test` green | verification-result.md: build/typecheck/test/lint 全 passed ✓ |

---

## 観察事項（非ブロッキング）

- TC-NJW-003（cancel）はワークツリー `null` の状態でテストしており、`resolveCanonicalStateDir()` が canonical dir を解決して canceled state を書き込む。design D6 が想定する「worktree 削除後の slug 正本消失 → skip」とは別ケースだが、AC「jobs-dir に書かない」は満たしている。
- `runner.ts` pipeline crash 経路は `deps.storeFactory()` を使用。local では slug store に解決されるが、worktree 未確立時（到達不能）は jobId store fallback が残存する（design に「到達不能として温存、`retire-jobs-dir` で対応」と明記済み）。
