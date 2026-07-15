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
| tasks.md | ✅ yes | T-01〜T-06 すべてのチェックボックスが [x] 完了 |
| design.md | ✅ yes | D1〜D9 すべての設計判断に適合。D6 の `ctx.slug` 明示アサート欠落は低重度・機能影響なし（後述） |
| spec.md | ✅ yes | 全 Requirements / Scenarios が実装で充足。slug 観測は jobId 一致により構造的に保証 |
| request.md | ✅ yes | 10 件の受け入れ基準すべて充足。`typecheck && test` 全通過（7044 tests） |

---

## 詳細確認

### Judgment 1: tasks.md — チェックボックス完了確認

| タスク | 状態 |
|--------|------|
| T-01: attach を実 `LocalRuntime.setupWorkspace({attachCheckpoint})` に置き換え | ✅ [x] |
| T-02: proxy 撤去（`IMPLEMENTER_ONLY_DESCRIPTOR` / `transitionJob` / hand-seed / pipeline mock） | ✅ [x] |
| T-03: 実 `ResumeCommand` × 実 `LocalRuntime` 駆動、fake runner のみ注入 | ✅ [x] |
| T-04: 6 つの歯を observable なアサーションで固定 | ✅ [x] |
| T-05: Machine A 不変 / spec 文言を実体に一致 | ✅ [x] |
| T-06: `typecheck && test` green / 既存テスト無変更で green | ✅ [x] |

### Judgment 2: design.md — 設計判断への適合

| 決定 | 適合確認 |
|------|---------|
| D1: Machine B を `ResumeCommand.execute()` × 実 `LocalRuntime` で駆動 | `new ResumeCommand(resumeRuntime, machineBEvents, SLUG, { cwd: machineBDir }).execute()`（L464-469）✅ |
| D2: attach 成果物は実 `LocalRuntime.setupWorkspace({attachCheckpoint})` 由来 | `attachRuntime.setupWorkspace(SLUG, jobId, { attachCheckpoint: { branch: BRANCH, checkpointRef: verified.checkpointOid }, baseBranch })`（L384-387）✅ |
| D3: fake 化は `createAgentRunner()` のみ、他は実 `LocalRuntime` | `ResumeLocalRuntime` が `createAgentRunner()` だけ override（L439-448）✅ |
| D4: fake runner は `timeout` を返し implementer で guard-halt | `completionReason: "timeout"`（L421）✅ |
| D5: descriptor 選択は `buildPipelineForJob` 経由（STANDARD 署名で証明） | `vi.mock` なし。最終 state: `awaiting-resume` + `resumePoint.step === implementer`（L493-495）✅ |
| D6: 6 つの observable アサーション | 下記参照。1 点軽微ギャップあり（低重度、機能影響なし） |
| D7: config 前提（project-local config / XDG 隔離） | `machineBDir/.specrunner/config.json` 書き込み（L356-361）、`XDG_CONFIG_HOME` 隔離（L365-368）、`finally` で restore（L501-507）✅ |
| D8: Machine A は無変更 | L249-330: アサート a〜d（status / resumePoint / runner count / checkpoint commit / tree）変更なし ✅ |
| D9: 実 interop gap は proxy で塞がず停止 | proxy 痕跡なし。`IMPLEMENTER_ONLY_DESCRIPTOR` / `makeRealMaterializerHost` / `transitionJob` / hand-seed が実コードから削除済み ✅ |

**D6 の observable アサーション詳細**:

| 歯 | アサーション | 充足 |
|----|-------------|------|
| sidecar/worktree 経由の attached state 解決 (jobId) | `expect(machineBRunnerCalledJobId).toBe(jobId)`（L477）| ✅ |
| sidecar/worktree 経由の attached state 解決 (slug) | `ctx.slug` をキャプチャ・アサートしていない | ⚠️ 低重度 |
| sidecar/worktree 経由の attached state 解決 (status) | disk 読み `awaiting-resume`（L400）| ✅ |
| resumePoint→startStep 解決 | `expect(machineBRunnerCalledAtStep).toBe(STEP_NAMES.IMPLEMENTER)` + `verified.state.resumePoint!.step`（L480-481）| ✅ |
| running 遷移の永続化 | 事前: L400（awaiting-resume）/ runner 呼び出し時: L484（running）| ✅ |
| existing worktree の再利用 | `createSpy` 0 回（L487）/ `machineBRunnerCwd === attachWorktreePath`（L488）| ✅ |
| descriptor 実選択 (STANDARD 署名) | `finalDiskState.status === "awaiting-resume"` かつ `resumePoint.step === implementer`（L493-495）| ✅ |
| resume の開始 | fake runner 呼び出し 1 回（L476）/ exitCode === 1（L499）| ✅ |

**⚠️ 軽微ギャップ: `ctx.slug` の明示アサート欠落**

`ctx.slug` のキャプチャ・アサートが存在しない。ただし機能的影響はない。`ResumeCommand` が `SLUG` を引数として受け取り、slug 不一致なら `resolveJobStateBySlug` が失敗して fake runner は呼ばれないため、`machineBRunnerCalledJobId === jobId`（L477）が成立している時点で正しい slug の state が解決されたことが構造的に保証される。code-review-feedback-001 が finding #1（severity=low、fix=no）として記録済み。conformance をブロックしない。

### Judgment 3: spec.md / request.md — 要件・受け入れ基準への適合

| 受け入れ基準 | 充足 |
|-------------|------|
| 主役 E2E: 実 attach → 実 `ResumeCommand` → `Pipeline.run()` → fake runner | ✅ |
| sidecar/worktree 経由で attached state 解決（jobId 観測） | ✅ (slug は⚠️ 低重度) |
| 開始 step === `resumePoint.step` | ✅ |
| disk `state.json` が `awaiting-resume` → `running` に遷移・永続化 | ✅ |
| 新規 worktree を作らず attach 生成 worktree を再利用（create 0 回 / path 一致） | ✅ |
| descriptor は `buildPipelineForJob` が選ぶ（mock でない） | ✅ |
| `buildPipelineForJob` を `vi.mock` しない | ✅ (vi.mock はコメント内のみ言及) |
| Machine A アサーションは #838 と同一で green | ✅ |
| 既存テストが無変更で green | ✅ (7044 tests passed) |
| `typecheck && test` が green | ✅ (build / typecheck / test / lint 全通過) |

### Judgment 4: typecheck && test

verification-result.md より:

| フェーズ | 結果 | 時間 |
|----------|------|------|
| build | passed | 0.3s |
| typecheck | passed | 3.9s |
| test | passed (512 files / 7044 tests) | 21.2s |
| lint | passed | 4.3s |
| changed-line-coverage | passed | 26.2s |

全フェーズ通過。

---

## 総評

本実装は request の核心目的「看板と実体の一致」を達成している。

撤去確認済みの proxy:
- `IMPLEMENTER_ONLY_DESCRIPTOR`
- `makeRealMaterializerHost` / `WorkspaceMaterializer` 直呼び
- `transitionJob(running)` 直呼び
- `persist(runningState)` 手 seed
- `buildPipelineForJob` の `vi.mock`

実経路確認済み:
- `LocalRuntime.setupWorkspace({attachCheckpoint})` が worktree と liveness sidecar を生成
- `ResumeCommand.execute()` → `prepare()` → `buildPipelineForJob()` → `Pipeline.run()` の一連が production と同一コード経路を通る

残存する軽微ギャップ（`ctx.slug` 明示アサート欠落）は機能的正確性に影響せず、code review で low/no-fix と判定済み。承認に値する実装品質。
