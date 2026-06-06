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
| tasks.md | ✅ | 全 T-01〜T-08 が [x] 済み、コード実装と一致 |
| design.md | ✅ | D1〜D6 すべて実装済み。list() sidecar 補完での resolveCanonicalStateDir 省略は AC 上無害（archived は section 1b で捕捉） |
| spec.md | ✅ | 全 SHALL/MUST 要件を満たし、全 Scenario に対応する検証が存在する |
| request.md | ✅ | AC1〜AC5 すべて pass（typecheck + 3319 tests green） |

## Details

### tasks.md

全チェックボックスが `[x]` 済み。実装との照合:

- **T-01** `src/store/local-job-index.ts` 新設。`fs` + `src/util/paths.ts` のみ依存（`core/` import なし）。`localSidecarBaseDirRel()` を `paths.ts` に追加済み。`listLocalSidecars` / `resolveJobIdToSlug` の動作が tests/local-job-index.test.ts TC-014〜TC-020 で検証済み。
- **T-02** `list()` の旧 section 3（`getJobsDir` readdir）を撤去済み。新 section 3 として sidecar 補完を追加。section 4（managed marker → jobs-dir）は不変。
- **T-03** `resolveId()` の候補集合を `list()` ∪ `listLocalSidecars()` の union に更新済み。full UUID 素通し不変。0/1/2+ 件の分岐・エラーコード不変。
- **T-04** `src/core/job-access/load-by-job-id.ts` 新設。sidecar → worktreePath slug dir → canonDir → jobs-dir fallback の解決順を実装。読み取り専用。
- **T-05** 4 callers（job-show / cancel runner / resume / resolve-target）が `loadStateByJobId` 経由に移行済み。各 caller の persist（dual-write）は不変。
- **T-06** `orchestrator.ts` Phase 2 が `liveness.json` の `worktreePath` を `null` に更新。jobId ストアの read/write なし。TC-032 / TC-034 で検証済み。
- **T-07** 統合テスト（`jobs-dir-no-readdir.test.ts`）、`local-job-index.test.ts`、`load-by-job-id.test.ts`、orchestrator/cancel/resume の unit tests が追加・更新済み。
- **T-08** `bun run typecheck` pass、`bun run test` 282 files / 3319 tests pass。

### design.md

D1〜D6 の実装を確認:

- **D1** `local-job-index.ts` — 依存制約（`core/` import なし）を遵守。`localSidecarBaseDirRel()` ヘルパーを `paths.ts` で定義し経由している。
- **D2** `list()` 旧 section 3 撤去済み。sidecar 補完（新 section 3）は `worktreePath` あり entry のみ slug dir を試みる。`worktreePath` が `null` のエントリは skip し `resolveCanonicalStateDir` を試みない（design 記述と微差あり）が、archived 状態は section 1b で捕捉されるため AC 上無害。
- **D3** `resolveId()` の候補集合が `Promise.all([list(), listLocalSidecars()])` の union。worktree 削除済み・未 archive の degraded job でも sidecar の jobId が候補に入り prefix 解決可能。
- **D4** `loadStateByJobId()` で解決順（sidecar → worktreePath → canonDir → fallback）を実装。managed は jobs-dir fallback へ。sidecar 不在は legacy readFile へ。
- **D5** archive Phase 2 での sidecar repoint が実装済み。`fs.readFile(sidecarAbsPath)` → `worktreePath: null` → `fs.writeFile(sidecarAbsPath, ...)` のフロー。
- **D6** cancel/resume の persist 呼び出し（jobId ストアへの書き込み）は変更なし。section 4（managed marker → jobs-dir）のコードは不変。

### spec.md

全 Requirement / Scenario の充足を確認:

| Requirement | Scenario | 検証 |
|---|---|---|
| list() / resolveId() が local jobs-dir を readdir しない | list() / resolveId() が readdir しない | TC-001 / TC-007 |
| jobId / cross-branch 解決が sidecar index 起点 | prefix が sidecar 経由で解決 / degrade でも jobId 保持 | TC-007 / local-job-index tests |
| local runtime state-read caller が slug 経由 | show / cancel / resume / resolve-target の各 Scenario | load-by-job-id tests / caller unit tests |
| cross-branch / managed 可視性維持 | 別ブランチ active / managed active が見える | TC-037 / TC-038 |
| archive Phase 2 が sidecar を更新 | sidecar worktreePath クリア / sidecar 不在でも失敗しない | TC-032 / TC-034 |
| dual-write / managed 温存、検証 green | dual-write 不変 / typecheck + test green | cancel/resume tests / T-08 |

### request.md

受け入れ基準 5 件すべて pass:

- AC1: `fs.readdir` spy で jobs-dir readdir を呼ばないことを確認（TC-001 / TC-007）。
- AC2: `loadStateByJobId` により job show / cancel / resume が sidecar 経由で jobId → slug 解決。
- AC3: section 2（worktrees scan）と section 4（managed marker）が不変で可視性を維持。
- AC4: `cancelSingleJob` / resume の `JobStateStore.persist()` 呼び出しは変更なし。
- AC5: `bun run typecheck` + `bun run test`（282 files / 3319 tests）が green。
