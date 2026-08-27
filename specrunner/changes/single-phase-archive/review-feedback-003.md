# Code Review Feedback — single-phase-archive — iteration 3

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### 読んだファイル

- `specrunner/changes/single-phase-archive/design.md` — D1〜D9 の設計決定を精読
- `specrunner/changes/single-phase-archive/tasks.md` — T-01〜T-09-pre のタスクと受け入れ条件を精読
- `specrunner/changes/single-phase-archive/test-cases.md` — 全 43 TC（must 31 / should 12）を精読
- `src/core/archive/plain-archive.ts` — 全実装（Path A / Path B / terminal short-circuit）
- `src/core/archive/orchestrator.ts` — 全実装（idempotent push guard TC-022〜TC-026 を含む）
- `src/core/archive/cleanup.ts` — 全実装（`deleteRemoteBranch` フラグ）
- `src/core/archive/merge-completion.ts` — JSDoc および `--with-merge` 専用宣言を確認
- `src/cli/archive.ts` — plain 分岐に `createGitHubClient` / `getOriginInfo` が存在しないことを確認
- `src/core/archive/job-context.ts` — `resolveArchiveJobContext` / `isArchiveRecordDir` の実装
- `src/core/job-list/operations-view.ts` — `deriveNextAction` と `CATEGORY_META` の更新
- `.github/workflows/specrunner-dispatch.yml` — archive アクションのコメントと CLI 呼び出し
- `specrunner/adr/2026-08-21-archive-state-after-merge.md` — superseded ステータス確認
- `src/core/archive/__tests__/plain-archive.test.ts` — 全テスト（TC-001〜TC-042）
- `tests/unit/core/archive/orchestrator.test.ts` — 全テスト（TC-022〜TC-026 ls-remote guard を含む）
- `tests/unit/core/archive/archive-cleanup.test.ts` — TC-018 / TC-019 / TC-020
- `tests/unit/core/job-list/operations-view.test.ts` — TC-021 / TC-022（prMerged false/null）
- `tests/unit/cli/archive-plain-merge-detection.test.ts` — TC-027 / TC-028 / TC-029
- `specrunner/changes/single-phase-archive/verification-result.md` — 全フェーズ green を確認

### 確認した gate TC

| TC | 確認方法 | 結果 |
|----|---------|------|
| TC-021: post-merge-cleanup.ts が存在しない | `grep -rn "runPostMergeCleanup" src tests` | 空 ✓ |
| TC-027: plain-archive.ts に GitHubClient 参照なし | `grep -n "GitHubClient\|merge-completion" src/core/archive/plain-archive.ts` | 空 ✓ |
| TC-028: cli/archive.ts の plain 分岐に createGitHubClient なし | コード確認（L246〜L279 は else ブランチ） | ✓ |
| TC-029: merge-completion.ts を import しているのが merge-then-archive.ts のみ | `grep -rn "merge-completion" src tests` | 1 件のみ ✓ |
| TC-032: workflow に「2 相」「再実行」等の語が存在しない | `grep -n "2 相\|再実行\|completeAfterMerge"` | 空 ✓ |
| TC-033: workflow の archive CLI 呼び出しが変更前と同一 | L243 を確認 | `--from-issue "$ISSUE"` ✓ |
| TC-037: build/typecheck/test すべて green | verification-result.md | 全フェーズ passed ✓ |

### 受け入れ条件の確認

- `awaiting-archive` + OPEN PR → 1 回で `archived` + cleanup + exit 0: TC-001 ✓
- success stdout に「再実行」「awaiting-archive」等の語なし: TC-002 ✓
- archived 済み job 再実行 → short-circuit exit 0: TC-003 ✓
- 全経路で PR API 呼び出し 0 回: TC-004 / 型による構造保証 ✓
- cleanup が常に `deleteRemoteBranch: false` を伴う: TC-006 ✓
- push 失敗 → exit 1 / 未遷移 / cleanup 未実行: TC-008 ✓
- transition 失敗 → exit 1 / cleanup 未実行: TC-009 ✓
- 旧 2 相残置 job → 1 回の archive で archived + cleanup: TC-010 / TC-011 ✓
- 記録済み + worktree 欠損 → Path B で exit 0: TC-012 / TC-038 / TC-042 ✓
- 未記録 + worktree 欠損 → escalation exit 1: TC-013 ✓
- PR なし job も cleanup: TC-014 ✓
- `job ls` が prMerged 問わず archive を推奨: TC-021 / TC-022（operations-view）✓
- markJobArchived が cleanup より先: TC-039 ✓
- D5 ls-remote guard (TC-022〜TC-026): orchestrator.test.ts 全 5 ケース ✓

## 検証できなかった項目

- TC-016（手動 TC）: workflow YAML のコメントを目視確認することは構造上可能だが、
  manual TC のため本 review では確認対象外とした（gate TC-032 / TC-033 で代替検証）。
- TC-043（`--from-issue` の単相完結）: 直接のエンド・ツー・エンドテストは存在せず、
  CLI 呼び出し連鎖（`runArchiveFromIssue` → `runArchive` → `runPlainArchive`）を
  トランジティブに確認するにとどまる（詳細: Findings 詳細 O-1 参照）。

## Findings 詳細

### Finding 1 (Medium / Fixable): TC-022 の headSha 取得アサーション欠落

**ファイル**: `tests/unit/core/archive/orchestrator.test.ts`（TC-022 describe ブロック、L894〜L946）

TC-022 の THEN 節には「headSha は従来どおり `git rev-parse HEAD` で取得される」と明記されているが、
テストはこれを検証していない。`result.exitCode === 0` と push が呼ばれないことだけを確認しており、
`result.headSha` の検証も `rev-parse HEAD` のスポーン呼び出し確認もない。

実装（`orchestrator.ts` L354）は正しく早期 return 前に `git rev-parse HEAD` を呼んでいる:
```ts
const headShaResult2 = await spawn("git", ["rev-parse", "HEAD"], { cwd: recordDir });
return { exitCode: 0, headSha: headShaResult2.exitCode === 0 ? (headShaResult2.stdout.trim() || undefined) : undefined };
```

必要なアサーション追加:
- `rev-parse HEAD` がスポーンされることを verify
- `result.headSha` が defined (または事前にセットしたモック SHA) を assert

TC-022 は must-priority TC であり、T-02 の受け入れ条件として明示されているため medium として報告する。

---

### Finding 2 (Low / Fixable): Path B が assertJobFinishable を省略（design.md D5 との齟齬）

**ファイル**: `src/core/archive/plain-archive.ts`（Path B ブロック、L127〜L163）

design.md D5 Path B の実行順序は:
> "finishable gate → `markJobArchived(slug, cwd)` → cleanup の順で best-effort に終端する。"

しかし実装の Path B は `assertJobFinishable` を明示的に呼ばない。Path A では orchestrator の
Phase 0 が finishable gate を担うが、Path B はこれを通らない。

実用上の影響は限定的: `markJobArchived` 内の `transitionJob` が `awaiting-archive → archived`
以外の遷移を throw し、Path B の try/catch が warning として握り潰す（cleanup は続行）。
したがって実行安全性は確保されており、`archiveRecorded: true` の job が `running` 等の
不整合状態にある可能性は実装上ほぼ発生しない。

**推奨対応（いずれか）**:
1. Path B のブロック先頭で `canTransition(state.status, "archived")` をチェックし、
   遷移不可なら `stderrWrite` で警告して cleanup へ進む（明示的 gate）。
2. コメントに「Path B は best-effort のため finishable gate を省略。`markJobArchived` 内の
   lifecycle 検証が implicit gate として機能する」と明記する（コメントのみ）。

設計の best-effort セマンティクスと「transition 失敗は warning に留め cleanup を続行し exit 0」の
方針に鑑み、コメントのみ（推奨 2）でも受け入れ可能。

---

### Observation O-1: TC-043 はトランジティブ検証

TC-043（`--from-issue` 単相完結）は test-cases.md で must-priority とされているが、
`src/core/archive/__tests__/plain-archive.test.ts` の TC-043 コメントは
「structural / caller-level; verified by CLI test」と記載する。

CLI テスト（`archive-plain-merge-detection.test.ts`）は `runPlainArchive` が呼ばれることを
確認するが、`--from-issue` の resolve chain（`runArchiveFromIssue → runArchive → runPlainArchive`）の
端点動作をエンド・ツー・エンドで確認するケースは存在しない。

`runPlainArchive` の TC-001 が単相完結を網羅的に検証しているため、トランジティブには証明されており、
単独でブロック要因とはしない。ただし TC-043 の "must" 分類に対してカバレッジの完全性を
主張するには追加の CLI 統合テストが望ましい（could 扱いの follow-up として残す）。

---

### Observation O-2: T-09-pre の ADR リンクは adr-gen 実行後に確定する

`2026-08-21-archive-state-after-merge.md` のステータスは正しく
`superseded by [ADR-20260826-single-phase-archive](../changes/single-phase-archive/spec.md)`
に更新されているが、リンク先が `spec.md`（実体は spec/設計書）になっており、
正式な ADR ファイルではない。

`tasks.md` T-09-pre の「新 ADR のヘッダに `Amends:` を追記する」チェックボックスは
adr-gen（pipeline step 12）が実行する作業の要件を表している。adr-gen が新 ADR を
`specrunner/adr/` に生成し、旧 ADR の superseded リンクを更新する段階で正式に完結する。
現時点の [x] マークは intent marker として解釈する。action は adr-gen に委ねる。

---

### Observation O-3: 構造的不変条件がすべて確認済み

- D1（client-closed）: `PlainArchiveInput` に `githubClient` / `owner` / `repo` フィールドが存在しない ✓
- D2（push 成功 → transition → cleanup の順序）: TC-039 でコール順序が固定済み ✓
- D3（remote branch 保持）: 全 cleanup 呼び出しに `deleteRemoteBranch: false` ✓
- D7（merge-completion は `--with-merge` 専用）: import が `merge-then-archive.ts` のみ ✓
- D8（operations-view の操作順更新）: label = `"archive・merge 待ち"`、prMerged 問わず archive 推奨 ✓
- D5 ls-remote guard: TC-022〜TC-026 の 5 ケースすべて実装・テスト済み ✓
