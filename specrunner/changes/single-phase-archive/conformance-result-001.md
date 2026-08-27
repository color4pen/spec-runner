# Conformance Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### 参照ドキュメント

- `request.md` — 受け入れ条件 8 項目、要件 1–10
- `spec.md` — 7 Requirements、19 Scenarios（SHA/MUST を全列挙して確認）
- `design.md` — D1–D9（計画コンテキスト）
- `tasks.md` — T-01〜T-09（計画コンテキスト）
- `git diff main...HEAD --stat` — 41 files changed

### Requirement 1: plain archive shall complete in a single run

- `runPlainArchive` の全コードパスを確認。`prNumber` 存在を条件に `awaiting-archive` のまま exit 0 する分岐は完全に削除済み ✓
- Path A（通常記帳）: orchestrator → markJobArchived → runArchiveCleanup → exit 0 ✓
- Path B（縮退）: best-effort markJobArchived → runArchiveCleanup → exit 0 ✓
- terminal short-circuit（status=archived / canceled）: exit 0 即返し ✓
- TC-001（OPEN PR + awaiting-archive → 1 回で complete）✓
- TC-002（成功 stdout に「再実行せよ」「awaiting-archive のまま」相当の文言なし）✓
- TC-003（already archived → short-circuit exit 0）✓
- TC-043 については F-001 を参照

### Requirement 2: plain archive shall not read GitHub PR state

- `PlainArchiveInput` に `githubClient` / `owner` / `repo` フィールドが存在しないことを型定義で確認 ✓
- `plain-archive.ts` に `GitHubClient` import なし、`merge-completion.js` import なし ✓
- `src/cli/archive.ts` の非 `--with-merge` 分岐に `createGitHubClient` / `getOriginInfo` 呼び出しなし ✓
- `merge-completion.ts` を import するのが `merge-then-archive.ts` のみ（grep 確認）✓
- TC-004（spawn calls に PR API なし）✓
- TC-029（plain call args に githubClient/owner/repo なし）✓

### Requirement 3: plain archive cleanup shall preserve the remote feature branch

- `plain-archive.ts` の全 `runArchiveCleanup` 呼び出しが `deleteRemoteBranch: false` を渡す ✓
- `merge-completion.ts` の `completeAfterMerge` は `deleteRemoteBranch` 未指定（= `true`）✓
- `cleanup.ts` の `deleteRemoteBranch !== false` デフォルト true の実装を確認 ✓
- TC-006（cleanup が deleteRemoteBranch:false で呼ばれる）✓
- TC-018（deleteRemoteBranch:false で push --delete が spawn されない）✓
- TC-019（deleteRemoteBranch 未指定で push --delete が spawn される）✓

### Requirement 4: archived transition gated on successful push

- `plain-archive.ts` の実行順序: orchestrator → markJobArchived → runArchiveCleanup を確認 ✓
- orchestrator 失敗時に markJobArchived / cleanup を呼ばないコードパス確認 ✓
- markJobArchived 失敗時に cleanup を呼ばないコードパス確認（Path A 限定）✓
- TC-008（push failure → exit 1、未遷移、cleanup なし）✓
- TC-009（transition failure → exit 1、cleanup なし）✓
- TC-039（markJobArchived が runArchiveCleanup より前に呼ばれる順序保証）✓

### Requirement 5: idempotent finish for leftover two-phase jobs

- `orchestrator.ts` の idempotent push guard（L343–381）を確認:
  - `recordedSomething = !mvSkipped || !commitSkipped`
  - `recordedSomething === false` → `git ls-remote --heads origin <branch>` で remote 確認
  - remote なし → push skip + warning（TC-022）✓
  - remote あり → push、失敗は warning のみ（TC-023/TC-024）✓
  - ls-remote 失敗 → fail-open で push 試行（TC-026）✓
  - 新規記録あり + push 失敗 → escalation（TC-025）✓
- Path B（degraded）条件: `archiveRecorded === true` かつ worktree/branch 不在を実装確認 ✓
- TC-012/TC-038（recorded + worktree missing → Path B → exit 0）✓
- TC-013（unrecorded + worktree missing → Path A → orchestrator escalation）✓
- TC-042（noWorktree + local branch absent → Path B → exit 0）✓

### Requirement 6: PR-less jobs treated identically

- `plain-archive.ts` に `prNumber` を条件とするコードパス分岐なし（advisory 出力のみ）✓
- TC-014（PR-less → orchestrator + markJobArchived + cleanup + exit 0）✓

### Requirement 7: operator-facing guidance states archive-then-merge order

- `deriveNextAction` の `case "awaiting-archive"` が `prMerged` 非依存で `job archive ${slug}` を返す ✓
- `CATEGORY_META` の `awaiting-archive` ラベルが `"archive・merge 待ち"` ✓
- `.github/workflows/specrunner-dispatch.yml` L30–35 の archive 案内を確認:
  - 「1 回の実行で完結」「PR merge は GitHub UI に委譲」「merge を待たない・検出しない」✓
  - 「2 相」「1 回目 / 2 回目」「再実行」相当の記述なし ✓
- TC-021（prMerged:false → `job archive <slug>`）✓
- TC-022（prMerged:null → `job archive <slug>`）✓
- TC-017（成功 stdout が GitHub での PR merge を次手順として示す + 既 merge 警告）✓
- dispatch-workflow-archive-action.test.ts で archive branch が 1 行 `--from-issue "$ISSUE"` のみ確認 ✓

### 受け入れ条件すべてを確認

| 受け入れ条件 | 確認 |
|---|---|
| awaiting-archive + OPEN PR → 1 回 → folder move + commit/push + cleanup + archived | ✓ |
| archive 後、PR OPEN のままでも `archived` | ✓ |
| その後 PR merge しても再実行不要（terminal short-circuit） | ✓ |
| archive commit が PR に含まれる（feature branch へ push） | ✓ |
| 旧 2 相残置 job → 1 回で `archived` + cleanup | ✓ |
| workflow_dispatch archive は 1 回で完結、「merge 後再 archive」案内なし | ✓ |
| plain archive は MERGED 判定を terminal transition 条件にしない | ✓ |
| typecheck / test / architecture tests が green（12545 passed） | ✓ |

## 検証できなかった項目

None — 全 Scenario、全受け入れ条件について実装・テストを確認した。
ただし F-001 に記載の通り TC-043 のテスト不在は確認済みの gap。

## Findings 詳細

### F-001: TC-043「--from-issue invocation completes in one run」のテスト body が存在しない

**対応する spec.md Scenario**: Requirement 1 > Scenario: --from-issue invocation completes in one run

**test-cases.md での分類**: category=unit, priority=must

spec.md が要求するアサーション:
> `runPlainArchive` が 1 回だけ呼ばれ、archive が完了し、exit code 0 を返す（`specrunner job archive <slug>` と同一の振る舞い）

`src/core/archive/__tests__/plain-archive.test.ts` のヘッダーコメントには TC-043 が記載されているが、対応する `describe`/`it` ブロックが存在しない。コメントには「verified by CLI test」とあり、`tests/unit/cli/archive-plain-merge-detection.test.ts` の TC-027 を指していると読めるが、TC-027 は `runArchive({withMerge: false}) → runPlainArchive` を検証するのみで、`runArchiveFromIssue → runArchive → runPlainArchive` の経路を検証していない。

**コードは構造的に正しい**:
`archive-from-issue.ts` の最終ステップ（L193）で `runArchive({slug, withMerge: opts.withMerge, ...})` を 1 回だけ呼ぶことは確認済み。実装上の不備ではなく、spec scenario に対応する automated test body が欠如している。

**修正方法**: `runArchiveFromIssue` を呼ぶ unit test を追加し、`runPlainArchive` が 1 回だけ呼ばれること（または `runMergeThenArchive` が呼ばれないこと）を `vi.mock` + `expect.toHaveBeenCalledTimes(1)` で検証する。
