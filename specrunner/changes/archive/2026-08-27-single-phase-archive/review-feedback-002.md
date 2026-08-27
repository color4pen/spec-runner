# Code Review Feedback — iteration 002

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

- iter 1 の 2 findings（workflow YAML 2 相記述・orchestrator.ts JSDoc）が commit 7b287328 で修正済みであることを確認
- `git diff main...HEAD --stat`（37 ファイル、4484 挿入 / 823 削除）で変更範囲を確認
- 実装コア再読: `plain-archive.ts` / `cleanup.ts` / `orchestrator.ts` / `merge-completion.ts` / `job-context.ts`
- CLI: `src/cli/archive.ts`（plain 分岐と `--with-merge` 分岐の分離）
- `src/core/job-list/operations-view.ts`（`deriveNextAction` + CATEGORY_META ラベル更新）
- `.github/workflows/specrunner-dispatch.yml`（単相契約の説明への書き換えを確認）
- テストスイート全体（verification-result.md で passed 確認、839 files / 12 545 tests all pass）
- Gate grep チェック（TC-021 / TC-027 / TC-028 / TC-029 / TC-032 / TC-033 / TC-034）
- unit tests 個別確認（TC-018/019/020, TC-030/031, TC-038, TC-039, TC-042 等）
- `tasks.md` T-02 の新規テスト要件とテストスイートの照合
- old ADR (`2026-08-21-archive-state-after-merge.md`) の `superseded` ステータス更新を確認

---

## Gate チェック結果

| Gate | コマンド / 確認内容 | 結果 |
|------|---------------------|------|
| TC-021 | `grep -rn "runPostMergeCleanup\|PostMergeCleanupInput\|post-merge-cleanup" src/ tests/ .github/` | ✅ 空（削除済み） |
| TC-027 | `grep -n "GitHubClient\|merge-completion\|getPullRequest\|mergePullRequest" src/core/archive/plain-archive.ts src/cli/archive.ts` | ✅ `--with-merge` 分岐のみ |
| TC-028 | `grep -n "createGitHubClient\|getOriginInfo" src/cli/archive.ts` | ✅ L204/L214 は `if (opts.withMerge)` ブロック内のみ |
| TC-029 | `grep -rn "merge-completion" src/ tests/` | ✅ `merge-then-archive.ts` のみ（1 件） |
| TC-032 | `grep -n "2 相\|2相\|再実行\|completeAfterMerge\|1 回目\|2 回目..." .github/workflows/specrunner-dispatch.yml` | ✅ 空（iter 1 finding 修正済み） |
| TC-033 | workflow archive ブロックの実行コマンド確認 | ✅ `bun ./bin/specrunner.ts job archive --from-issue "$ISSUE"` 不変 |
| TC-034 | `grep -n "awaiting-archive\|re-run..." src/core/archive/__tests__/plain-archive.test.ts` | ✅ 2 相前提のアサーションなし |
| TC-037 | `bun run test`（verification-result.md） | ✅ 全 pass |

---

## unit test 個別確認

| TC | 確認内容 | 結果 |
|----|----------|------|
| TC-018 | `deleteRemoteBranch: false` → `push --delete` 未発行 | ✅ archive-cleanup.test.ts に存在 |
| TC-019 | `deleteRemoteBranch` 未指定（既定 true）→ `push --delete` 発行 | ✅ archive-cleanup.test.ts に存在 |
| TC-020 | `deleteRemoteBranch: false` → advisory が stdout に出力 | ✅ archive-cleanup.test.ts に存在 |
| TC-030 | `awaiting-archive` + `prMerged: null` → `job archive <slug>` を返す | ✅ operations-view.test.ts に存在 |
| TC-031 | `awaiting-archive` + `prMerged: false` → `job archive <slug>` を返す | ✅ operations-view.test.ts に存在 |
| TC-038 | Path B — worktree 欠損 → best-effort transition + cleanup + exit 0 | ✅ plain-archive.test.ts に存在 |
| TC-039 | `markJobArchived` → `runArchiveCleanup` の呼び出し順序 | ✅ plain-archive.test.ts に存在 |
| TC-042 | Path B — noWorktree=true + local branch 不在 → best-effort + cleanup + exit 0 | ✅ plain-archive.test.ts に存在 |
| **TC-022** | mv/commit 双方 skip + ls-remote 空 → push を skip して exit 0 | ❌ **テスト不在** |
| **TC-023** | mv/commit 双方 skip + ls-remote が branch を返す → push が実行される | ❌ **テスト不在** |
| **TC-024** | mv/commit 双方 skip + push 失敗 → escalation されず exit 0 | ❌ **テスト不在** |
| **TC-025** | 新規記帳あり + push 失敗 → 従来どおり escalation / exit 1 | ❌ **テスト不在**（orchestrator 内部テストとして） |
| **TC-026** | ls-remote 失敗 → fail-open で push を試行 | ❌ **テスト不在** |

---

## 検証できなかった項目

- TC-016（manual）: workflow YAML の目視確認は自動検証の範囲外。TC-032 gate grep の結果（空）から同等に検証済み。
- `bun run build` の個別実行: verification-result.md の build phase passed で代替確認。

---

## Findings 詳細

### Finding 1: orchestrator の ls-remote idempotent push guard に対するテストが 5 本未実装（high / fixable）

**ファイル**: `src/core/archive/orchestrator.ts` L336–381 / `tests/unit/core/archive/orchestrator.test.ts` / `src/core/archive/__tests__/orchestrator.test.ts`

#### 状況

`tasks.md` T-02 は「新規テストを追加する: (a)〜(e) の 5 挙動がテストで固定されている」を
acceptance criteria に掲げ、チェックボックスも `[x]`（完了）になっている。

しかし `orchestrator.ts` の `recordedSomething === false` 分岐（L343–381）が
実装する以下の 5 挙動に対応するテストが、**いずれのテストファイルにも存在しない**:

| 対応 TC | 優先度 | 検証する挙動 |
|---------|--------|--------------|
| TC-022 | must | mv/commit 双方 skip + `ls-remote` 空 → push が spawn されず exit 0 |
| TC-023 | should | mv/commit 双方 skip + `ls-remote` が branch を返す → push が spawn される |
| TC-024 | must | mv/commit 双方 skip + push 失敗 → warning のみ、exit 0（escalation なし） |
| TC-025 | must | 新規記帳あり（mv または commit が実行された）+ push 失敗 → escalation exit 1 |
| TC-026 | should | ls-remote 非 0 終了 → fail-open: push が依然として spawn される |

確認コマンド:
```
grep -rn "ls-remote\|ls.remote\|recordedSomething\|!mvSkipped\|!commitSkipped" \
  tests/ src/core/archive/__tests__/
```
→ テストファイルからの参照ゼロ件。実装ファイル（orchestrator.ts）のみにヒット。

**TC-AO-IDEMPOTENT との相違**:
`tests/unit/core/archive/orchestrator.test.ts` の `TC-AO-IDEMPOTENT` は
`archiveChangeFolder` を `skipped: true`、`commitArchive` を `skipped: false`（= 実際に commit が走る）
でモックする。この場合 `recordedSomething = !true || !false = true` となり、
ls-remote guard は**発火しない**。TC-022〜026 は両方 `skipped: true`（`recordedSomething === false`）
が前提であり、完全に異なるシナリオである。

**TC-025 の注意点**:
`plain-archive.test.ts` の TC-008 は「orchestrator が exit 1 を返したとき plain-archive が
escalation を伝播する」ことを検証するが、これは orchestrator をモックしている（内部は走らない）。
orchestrator 自身が「新規記帳あり + push 失敗 → escalation」を返す内部ロジック（L367–380）は
orchestrator のテストで未検証。

#### リスク

ls-remote guard は D5 Path A の核心である。旧 2 相契約残置 job（archive record push 済み・
PR merge 済み・`awaiting-archive`）を処理するために導入した「record を再作成せず、
remote branch の存在を確認してから push」というロジックが、将来のリファクタリングで
誤って除去されてもテストなしでは検知できない。

TC-022/024/025 は `must` 優先度かつ T-02 AC の明示的要件であるため、
tasks.md 完了マークとの乖離が特に大きい。

#### 修正方法

`src/core/archive/__tests__/orchestrator.test.ts` に
以下のセットアップで 5 テストを追加する（既存の mock 構造を踏襲）:

```typescript
// 共通セットアップ: archiveChangeFolder と commitArchive を両方 skipped: true にする
vi.mocked(archiveChangeFolder).mockResolvedValue({ ok: true, skipped: true, message: "" });
vi.mocked(commitArchive).mockResolvedValue({ ok: true, skipped: true, message: "" });

// TC-022: spawn で ls-remote → stdout 空 → push 未発行
// TC-023: spawn で ls-remote → stdout に branch ref → push 発行
// TC-024: spawn で ls-remote → branch あり → push exit 1 → 警告のみ exit 0
// TC-025: archiveChangeFolder を skipped: false に戻す → push exit 1 → escalation exit 1
// TC-026: spawn で ls-remote → exit 1 → push が試行される（fail-open）
```
