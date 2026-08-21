# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 読んだ spec ファイル
- `request.md` — 背景・要件・受け入れ基準・設計上の注意を通読
- `design.md` — D1〜D8 の設計判断・Risks / Trade-offs・Open Questions・Migration Plan を通読
- `spec.md` — 全 Requirements + Scenarios を通読
- `tasks.md` — T-01〜T-07 + 共通不変条件を通読
- `test-cases.md` — TC-001〜TC-039 (39 件) を通読

### 確認した既存ソース
| ファイル | 確認した内容 |
|---------|------------|
| `src/core/archive/orchestrator.ts` | `deferArchivedTransition` 分岐・`markJobArchived` 呼び出し位置（L240-258）・module docstring・client-closed 宣言 |
| `src/core/archive/merge-then-archive.ts` | Step 1〜6 の実装・`archiveRecorded` 導出（L211）・`recordDir` 導出（L214）・`performPostMergeTransition` の位置・`deferArchivedTransition: true` で呼び出す箇所（L283） |
| `src/core/archive/__tests__/orchestrator.test.ts` | TC-009・TC-010 の既存 assertion（特に `markJobArchived IS called` を pin する TC-010 L790-803）・T-01〜T-10 / T-DTE-01〜03 が `markJobArchived` に触れないことを確認 |
| `src/core/archive/__tests__/merge-then-archive.test.ts` | TC-001（`deferArchivedTransition: true` で `runArchiveOrchestrator` が呼ばれることを pin する）・module mock の構成（`vi.mock` 絶対 module id 形式） |
| `src/core/archive/post-merge-cleanup.ts` | best-effort・idempotent な実装の確認 |
| `src/cli/archive.ts` | 非 `--with-merge` 分岐（L265-277）が `runArchiveOrchestrator` を直呼びしていることを確認（変更対象） |
| `src/cli/archive-from-issue.ts` | 最後に `runArchive()` を呼ぶことを確認（D3 の「継承」の前提） |
| `src/core/attach/checkpoint-policy.ts` | `attachArchivePolicy`（L128-143）が `status === "awaiting-archive"` かつ `pullRequest.number` あり を要求することを確認 |
| `src/core/finish/job-state-update.ts` | `markJobArchived` の実装・`resolveCanonicalStateDir` への委譲・idempotent 挙動 |
| `src/state/lifecycle.ts` | `VALID_TRANSITIONS`・`TERMINAL_STATUSES`（`archived` / `canceled`）の内容確認 |
| `src/core/finish/resolve-canonical-state-dir.ts` | active → archive の優先順位・state.json 走査ロジック |
| `src/store/job-state-store.ts` | `listWithSourceDirs` の返却型（`ListedJobEntry` = `{ state, sourceChangeDir }`） |

### 要件 ↔ Design の整合確認
- **D1（orchestrator から terminal transition を除去）** ↔ spec.md "archive orchestrator は terminal transition を行わない" + tasks.md T-03 ✓
- **D2（GitHub API PR state で merge 判定）** ↔ spec.md "archived への terminal transition は PR merge 後にのみ行われる" + request.md 要件 2 ✓
- **D3（`runPlainArchive` module）** ↔ spec.md "merge 状態の確認は archive record の記帳より前に行われる" + tasks.md T-04 ✓
- **D4（共有 module 抽出: `job-context.ts` / `merge-completion.ts`）** ↔ tasks.md T-01 / T-02 ✓
- **D5（PR 無し job は記帳時点で archived）** ↔ spec.md "PR を持たない job は記帳時点で archived になる" ✓
- **D6（merge 判定不能は fail-safe）** ↔ spec.md "merge 状態を判定できない場合は awaiting-archive を維持して成功する" ✓
- **D7（`runPostMergeCleanup` 再利用）** ↔ request.md 要件 7 ✓
- **D8（状態機械・checkpoint policy・CLI 面は変更なし）** ↔ tasks.md 共通不変条件・`attachArchivePolicy` の既存契約と新 contract の整合 ✓

### テストケース ↔ 受け入れ基準の対応確認
| 受け入れ基準 | 対応 TC |
|-------------|---------|
| plain archive 成功後 PR 未merge なら `awaiting-archive` | TC-011, TC-012 |
| archive record commit は feature branch に push される | TC-012 |
| CI failure でも `awaiting-archive` | TC-018, TC-019 |
| out-of-band merge 後の再実行で `archived` + cleanup | TC-013, TC-015 |
| `--with-merge` は既存どおり CI green 後に `archived` | TC-031, TC-032 |
| archive record 済み状態からの再実行は冪等 | TC-017 |
| branch/worktree cleanup は merge 前には行われない | TC-014, TC-026 |
| 旧意味 TC-010 のみ更新可 | TC-033 |

### 既存テストへの影響分析
- **orchestrator.test.ts TC-009**（`deferArchivedTransition: true → markJobArchived NOT called`）: T-03 実装後も引き続き pass（orchestrator は一切 `markJobArchived` を呼ばなくなるため）✓
- **orchestrator.test.ts TC-010**（`markJobArchived IS called`）: T-06 で新契約に更新することが明記されており、tasks.md / test-cases.md TC-033 が pinしている ✓
- **merge-then-archive.test.ts TC-001**（`deferArchivedTransition: true` で `runArchiveOrchestrator` が呼ばれることを pin）: D1 の「フィールドは残すが無視する」方針により、`merge-then-archive.ts` は引き続き `deferArchivedTransition: true` を渡す → 無変更で pass ✓
- **merge-then-archive.test.ts 全体**: `vi.mock` が絶対 module id 単位で効くため、`markJobArchived` / `runPostMergeCleanup` の mock は `completeAfterMerge` 経由でも有効 ✓

### セキュリティ観点
- 新規 CLI flag / コマンドなし。input surface の増加なし。
- GitHub token は既存パターン（`resolveGitHubToken` → 関数引数経由）で扱われる。ログ出力なし。
- `getPullRequest` の返却値（`state` / `mergeStateStatus`）は string 比較のみで使用。injection リスクなし。
- OWASP Top 10 に関連する新規リスクは導入されない（Web API 呼び出しは既存 `GitHubClient` port を通じており、input validation は adapter 側で行われる）。

---

## 検証できなかった項目

- **T-01〜T-07 の実装後の実際の挙動**: spec review は実装前に実施するため、`job-context.ts` / `merge-completion.ts` / `plain-archive.ts` の実際のコードは確認できない。記述されたインターフェース・型シグネチャの正確性は実装フェーズで検証される。
- **`archive-from-issue.test.ts` / `archive-minimum-assurance.test.ts` の詳細内容**: touched files に含まれていないため読まなかった。TC-034 の "無変更 green" 判定は verification/gate に委ねる。
- **`src/cli/command-registry.ts` の `ARCHIVE_USAGE`**: T-07 の対象ファイルだが spec review 時点では変更前であるため、変更後の文言適合は gate (bun run test) が確認する。

---

## Findings 詳細

### F-001: spec.md の terminal status シナリオが `canceled` を明示しない

**対象**: `spec.md` > Requirement: terminal status の job に対する plain archive は no-op である

シナリオ名が "既に archived の job" であり、`canceled` 状態の job に対する振る舞いを例示していない。実装は `TERMINAL_STATUSES.has(state.status)`（`archived` / `canceled` の両方をカバー）を使うため機能上の問題はないが、受け入れ基準から見て `canceled` ケースがテストで明示的に担保されない。tasks.md T-06 が追加する `plain-archive.test.ts` は `archived` ケース（TC-023）のみを必須で挙げており、`canceled` ケースは含まれない。

**影響範囲**: 軽微。実装コードは `TERMINAL_STATUSES.has()` で正しく処理する。ただし受け入れ基準の完全性という観点で補完を推奨。

---

### F-002: PR 無し job での `markJobArchived` 失敗ケースに対応するテストケースが不在

**対象**: `design.md` > D3 step 5「prNumber なし → `markJobArchived(slug, recordDir)` を呼び（失敗時は escalation を返す）」

`spec.md` Requirement "PR を持たない job は記帳時点で archived になる" の Scenario は成功パスのみを記述している。`test-cases.md` TC-022 も同様に成功パスのみ。`markJobArchived` が `SpecRunnerError(JOB_NOT_FOUND)` 等で失敗した場合の escalation（exitCode 1）をカバーするテストケースが存在しない。

設計の意図は明確（既存 orchestrator の L243-258 の `try/catch` と同等の処理を引き継ぐ）だが、テスト仕様に明示されていない。

**影響範囲**: 軽微。PR 無し job は `design-only` profile 等の限定的なユースケースであり、`markJobArchived` が失敗する窓も稀。不整合が顕在化するのは change folder の state.json が消失した場合など。

---

### F-003: test-cases.md TC-009 と orchestrator.test.ts 内の既存ラベル "TC-009" の命名重複

**対象**: `test-cases.md` TC-009 と `src/core/archive/__tests__/orchestrator.test.ts` 内のテスト説明ラベル

- `test-cases.md` TC-009: 「merge-then-archive.ts が markJobArchived / runPostMergeCleanup を直接呼ばない」を確認する新規テスト（T-02 成果物の構造確認）
- `orchestrator.test.ts` 内 "TC-009": 「deferArchivedTransition: true → markJobArchived NOT called; mv/commit/push still run」（既存テスト、tasks.md T-03 Acceptance Criteria で "無変更 green" が要求されている）

両者は異なるファイル・異なるスコープのため実行上の衝突はない。しかし実装者が tasks.md の「TC-010 以外は無変更で green」という記述を参照した際に、どちらの "TC-009" を指すのかが一瞬曖昧になりうる。tasks.md の記述は `orchestrator.test.ts` 内の既存ラベルを指しており、test-cases.md TC-009 は新しく作成するテストファイル（`merge-then-archive.ts` の構造確認）を指す。

**影響範囲**: 実行上の問題なし。実装時の読み違いリスクのみ。
