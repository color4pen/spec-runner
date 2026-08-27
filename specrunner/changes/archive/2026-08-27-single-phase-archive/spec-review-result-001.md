# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 読んだファイル

| ファイル | 確認内容 |
|---|---|
| `specrunner/changes/single-phase-archive/request.md` | 要件 1〜10、受け入れ条件 8 項目、非目標を全件読了 |
| `specrunner/changes/single-phase-archive/design.md` | D1〜D9・Risks/Trade-offs・Open Questions・Migration Plan を全件読了 |
| `specrunner/changes/single-phase-archive/spec.md` | 全 6 Requirement・14 Scenario を全件読了 |
| `specrunner/changes/single-phase-archive/tasks.md` | T-01〜T-09・全 Acceptance Criteria を読了 |
| `specrunner/changes/single-phase-archive/test-cases.md` | TC-001〜TC-041（41 件）を全件読了 |
| `src/core/archive/plain-archive.ts` | 現行 2 相契約の実装確認（変更前状態） |
| `src/core/archive/orchestrator.ts` | `runArchiveOrchestrator` の実装確認 |
| `src/core/archive/merge-completion.ts` | `completeAfterMerge` / `mergedBeforeRecordEscalation` の実装確認 |
| `src/core/archive/post-merge-cleanup.ts` | `runPostMergeCleanup` の remote branch 削除ロジック確認 |
| `src/core/archive/job-context.ts` | `resolveArchiveJobContext` / `resolveArchivedSlugByJobId` の実装確認 |
| `src/core/archive/merge-then-archive.ts` | `--with-merge` パスの `completeAfterMerge` 呼び出し箇所（3 箇所）確認 |
| `src/cli/archive.ts` | plain 分岐での GitHub client 構築ロジック確認 |
| `src/cli/archive-from-issue.ts` | `--from-issue` 解決フロー（3 段階: local → base-borne → closing PR）確認 |
| `src/core/issue-target/archive.ts` | `resolveArchiveBranchFromIssue` の fetch + 4-field match 確認 |
| `src/core/job-list/operations-view.ts` | `deriveNextAction`（L227〜228）・category label（L77）確認 |
| `src/core/finish/job-state-update.ts` | `markJobArchived` の signature 確認 |
| `specrunner/adr/2026-08-21-archive-state-after-merge.md` | 先行 ADR の内容確認（現行 2 相契約の根拠） |
| `.github/workflows/specrunner-dispatch.yml` | L30〜36: 2 相 archive の案内文言確認 |
| `tests/unit/no-worktree-archive.test.ts` | no-worktree モードテストのアサーション構造確認 |
| `src/core/archive/__tests__/plain-archive.test.ts` | 現行テスト構造・mock 対象確認 |

### 要件 → 設計 対応の確認

全 10 要件が設計判断（D1〜D9）にトレース可能であることを確認した。

| 要件 | 対応する設計判断 |
|---|---|
| 1. 1 回で archive 完了 | D1（GH client 除去）/ D2（push 後 transition）/ D3（remote 削除不要）|
| 2. archive commit を feature branch に push | D2（push 成功を終端条件の境界にする）|
| 3. push 成功後に transition | D2 |
| 4. archive 実行時に cleanup 完了 | D3（deleteRemoteBranch: false で merge 前 cleanup を安全化）|
| 5. PR merge は GitHub governance に委譲 | D3 / D6（advisory のみ）|
| 6. `completeAfterMerge` を通常操作に使わない | D7（`--with-merge` 専用に明記）|
| 7. workflow も 1 回で完結、2 相案内除去 | D8-1（specrunner-dispatch.yml 更新）|
| 8. `--with-merge` 契約を維持 | D7 / D9 |
| 9. PR MERGED の job に archive した場合の挙動明示 | D5 Path A（push skip guard）/ D6（advisory）|
| 10. 旧 2 相残置 job を 1 回で終端 | D5 Path A・Path B |

### 設計 → Spec Scenario 対応の確認

D1〜D8 のすべてに対応する Scenario が spec.md に存在することを確認した。

### Spec Scenario → Test Case 対応の確認

TC-001〜TC-017 の Scenario 由来テストが spec.md の全 Scenario（14 件）を網羅し、
TC-018〜TC-041 が tasks.md の Acceptance Criteria を追加でカバーしていることを確認した。

### セキュリティレビュー

- **コマンドインジェクション**: `git ls-remote --heads origin <branch>` はスポーン引数配列で呼ぶため、
  `branch` にシェル特殊文字が含まれてもインジェクションにならない。
- **パストラバーサル**: `worktreePath`・`branch` はジョブ状態から取得し、ジョブ作成時に検証済み。
  新しい入力経路は追加されない。
- **認証スコープ**: `PlainArchiveInput` から `githubClient`（GitHub API 資格情報）を除去し、
  `githubToken`（git transport 認証のみ）を残す変更はスコープを縮小する。
- **PR state への非依存**: GitHub PR API 呼び出しの除去は攻撃面を狭める。
- **fail-open の ls-remote**: ls-remote 失敗時に push を試みるのは安全側（archive を止めない）で
  権限エスカレーションにはならない。
- **新規 OWASP Top 10 リスク**: 外部データへの依存が減るため新規リスクは確認されない。

### `--from-issue` パスの end-to-end 確認

`archive-from-issue.ts` の解決フロー（local state → base-borne archive record → closing PR fetch + rebind）を確認。  
新設計での Path B（`archiveRecorded === true` + worktree 不在）が `archive --from-issue` の
GitHub Actions 経路（remote runner, local worktree なし, PR merge 済み）と整合することを確認した。  
`archive-from-issue.ts` 自体の変更が不要であることも確認した。

### `--with-merge` 回帰リスクの確認

`merge-then-archive.ts` が `completeAfterMerge`（3 箇所）を使い続け、
`runPostMergeCleanup` → `runArchiveCleanup`（`deleteRemoteBranch` 未指定 = `true`）への追従で
挙動が無変更になることを設計 D7 と T-01 で確認した。

### `no-worktree-archive.test.ts` の確認

テストが `JobStateStore.list`・`archiveChangeFolder`・`commitArchive` のみを mock し、
cleanup 関数は mock していないため、import path と symbol 名の追従のみでアサーション変更不要であることを確認した。

## 検証できなかった項目

- `archive --from-issue` を 1 回で完了させることの end-to-end テスト（spec.md に Scenario なし; 後述 F-2）
- `noWorktree === true` + `branch` ローカル不在で Path B に落ちる挙動（TC-038 は `noWorktree === false` のみ; 後述 F-3）
- `operations-view.ts` の category label `"merge・archive 待ち"` が更新されるかどうか（後述 F-4）
- 現行 ADR（`2026-08-21-archive-state-after-merge.md`）の amend 処理（adr-gen phase が担うため確認不可）

## Findings 詳細

### F-1（low）: `spec.md` に `--from-issue` の Scenario が存在しない

**対象ファイル**: `specrunner/changes/single-phase-archive/spec.md`  
**関連**: request.md 要件 1「`job archive --from-issue <issue>` は 1 回の実行で archive を完了する」

spec.md には `archive <slug>` の Scenario しかなく、`archive --from-issue <issue>` が 1 回で完結する
ことを検証する Scenario が存在しない。`--from-issue` は最終的に `runPlainArchive` を呼ぶため
挙動は同じだが、仕様書として「1 回で完結」の保証が明示されていない。

推奨対処: spec.md に Requirement を追加し、`archive --from-issue` が `runPlainArchive` 経由で
単相完了することを Scenario として明記する。または Requirement "plain archive shall complete in a
single run" の冒頭に `job archive --from-issue` も対象であることを明記する。

---

### F-2（low）: TC-038 が Path B の `noWorktree === true` ケースをカバーしない

**対象ファイル**: `specrunner/changes/single-phase-archive/test-cases.md`  
**関連**: tasks.md T-03「Path B の判定条件: `noWorktree === true` かつ `branch === null` または `git rev-parse --verify` 非 0」

TC-038 は `noWorktree === false` かつ `worktreePath` が物理的に存在しない場合のみを検証する。
`noWorktree === true` のときにローカルブランチが消えている（= `git rev-parse --verify --quiet refs/heads/<branch>` 非 0）場合の Path B 分岐がテストで固定されていない。

推奨対処: `noWorktree === true` かつ `git rev-parse --verify` 失敗で Path B に落ちることを検証する
TC を追加する（should 優先度で可）。

---

### F-3（low）: `operations-view.ts` カテゴリラベル `"merge・archive 待ち"` が tasks.md の更新対象外

**対象ファイル**: `src/core/job-list/operations-view.ts` L77  
**関連**: design.md D8 / tasks.md T-06

`CATEGORY_META` の `"awaiting-archive"` エントリのラベルが `"merge・archive 待ち"`（merge 優先の旧操作順を示唆）のままである。T-06 は `deriveNextAction` の return 値と JSDoc のみを更新対象に挙げており、カテゴリラベルの更新は scope 外となっている。

ラベルは `job ls` の表示に使われ、次アクションの決定（`deriveNextAction` が `job archive` を常に返す）とは独立しているため、機能的影響は限定的である。ただし「merge が先」という印象を操作者に与える点は新契約（archive → merge）と矛盾する。

推奨対処: T-06 に `"merge・archive 待ち"` → `"archive 待ち"` 等のラベル更新を追加する。または
design.md に「カテゴリラベルは変更しない」と Non-Goals として明示する。現状は意図が不明瞭。

---

### F-4（informational）: 先行 ADR が新設計と直接矛盾するが amend が明示されていない

**対象ファイル**: `specrunner/adr/2026-08-21-archive-state-after-merge.md`  
**関連**: request.md「#1049 / #1051 で採った前提を撤回する」/ request.meta adr: true

当該 ADR は 2 相契約（record 後 `awaiting-archive` 維持 → merge 後再実行で terminal）を "accepted" として採択した記録である。新設計はこれを全面的に撤回するが、tasks.md には当該 ADR の amend・supersede 指示が存在しない。

pipeline の `adr-gen` step が新 ADR を自動生成する予定だが、新 ADR が旧 ADR を明示的に amend しなければ、リポジトリに矛盾する accepted ADR が並存する状態になる。

推奨対処: `adr-gen` の prompt または tasks.md に「新 ADR は `2026-08-21-archive-state-after-merge.md` を amend する旨を記録すること」を明記する。機能的影響は皆無だが、ADR が history として参照されたときに誤解を招く可能性がある。
