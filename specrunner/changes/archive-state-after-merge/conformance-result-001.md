# Conformance Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### request.md — 受け入れ基準 (8 項目)

| 項目 | 確認結果 |
|------|---------|
| plain `job archive` 成功後、PR 未mergeなら state は `awaiting-archive` | ✅ `runPlainArchive` step 5: prNumber あり → `markJobArchived` を呼ばず、guidance を stdout に出す |
| archive record commit は feature branch に push される | ✅ `runArchiveOrchestrator` の `git push origin <branch>` はそのまま維持 |
| archive record push 後に CI が failure でも state は `awaiting-archive` | ✅ `runPlainArchive` は `getCheckStatus` / `mergePullRequest` を一切呼ばない |
| out-of-band で PR merge 後、正規コマンド再実行により `archived` + cleanup まで完了 | ✅ Step 3: MERGED + archiveRecorded → `completeAfterMerge`（TC-013） |
| `--with-merge` は既存どおり CI green を待って merge 後に `archived` | ✅ `merge-then-archive.ts` の挙動は意味・出力とも維持（`merge-then-archive.test.ts` 無変更 green） |
| archive record 済み状態からの再実行は冪等 | ✅ archiveRecorded + OPEN → orchestrator 呼び出し（内部で skip）、markJobArchived なし（TC-017） |
| branch/worktree cleanup は merge 前には行われない | ✅ `runPostMergeCleanup` の呼び出し箇所が `completeAfterMerge` 経由の MERGED 検出分岐のみ |
| 既存テストのうち旧意味 pin テストのみ更新可能 | ✅ TC-010 のみ更新（`merge-then-archive.test.ts` / `archive-from-issue.test.ts` / `archive-minimum-assurance.test.ts` は無変更 green） |

### spec.md — 全 Requirement / Scenario

**Req: plain job archive は archive record を作っても awaiting-archive を維持する**
- Scenario "PR が未merge の状態で plain archive が成功する": `runPlainArchive` は prNumber あり + OPEN → markJobArchived 未呼び出し、exit 0（TC-011）✅
- Scenario "archive record commit が feature branch に push される": orchestrator 内で `git push origin <branch>`（TC-012）✅

**Req: archive orchestrator は terminal transition を行わない**
- `orchestrator.ts` に `markJobArchived` の参照ゼロ（import も削除）
- `deferArchivedTransition` は deprecated 入力として残置（JSDoc 明記）、TC-009 / TC-010 ともに markJobArchived NOT called ✅

**Req: archived への terminal transition は PR merge 後にのみ行われる**
- Scenario "out-of-band merge 後の再実行": MERGED + archiveRecorded → `completeAfterMerge`（TC-013）✅
- Scenario "PR が未merge の間は cleanup が行われない": OPEN → `runPostMergeCleanup` 未呼び出し（TC-014）✅

**Req: merge 状態の確認は archive record の記帳より前に行われる**
- `runPlainArchive` の Step 3（PR 状態確認）は Step 4（orchestrator）より前 ✅
- Scenario "merge 済み PR に対して push を試みない": MERGED → completeAfterMerge で return、orchestrator 未呼び出し（TC-015）✅

**Req: archive record 前に merge された場合は escalation する**
- Scenario "記帳前に merge された job": MERGED + !archiveRecorded → `mergedBeforeRecordEscalation`（exit 1、escalation）（TC-016）✅

**Req: archive record 済み状態からの再実行は冪等である**
- Scenario "記帳済み・未merge からの再実行": archiveRecorded + OPEN → orchestrator 呼び出し（内部 skip）、transition なし（TC-017）✅

**Req: plain archive は CI 結果を観測せず、CI 結果によって状態を変えない**
- Scenario "plain archive は check status を問い合わせない": `getCheckStatus` 未呼び出し（TC-018）✅
- Scenario "CI failure でも状態は変わらない": 再実行でも markJobArchived・runPostMergeCleanup・getCheckStatus 未呼び出し（TC-019）✅

**Req: merge 状態を判定できない場合は awaiting-archive を維持して成功する**
- Scenario "GitHub client が利用できない": githubClient absent → orchestrator 呼び出し / 遷移なし / exit 0（TC-020）✅
  - ⚠️ ただし「merge 未確認である旨が警告として出力される」（stderrWrite）は未実装。詳細は Findings 詳細を参照。
- Scenario "PR 状態の取得が失敗する": `getPullRequest` throw → stderrWrite warning 出力 / orchestrator 呼び出し / 遷移なし / exit 0（TC-021）✅

**Req: PR を持たない job は記帳時点で archived になる**
- Scenario "PR を持たない job の archive": orchestrator 呼び出し / markJobArchived 呼び出し / getPullRequest 未呼び出し / runPostMergeCleanup 未呼び出し / exit 0（TC-022）✅

**Req: terminal status の job に対する plain archive は no-op である**
- Scenario "既に archived の job": exit 0、orchestrator / getPullRequest / cleanup いずれも未呼び出し（TC-023）✅
- Scenario "既に canceled の job": 同上（TC-040）✅

**Req: --with-merge の既存経路は維持される**
- Scenario "CI green を待って merge 後に archived": `merge-then-archive.ts` の挙動は completeAfterMerge 経由で維持（TC-031 相当）✅
- Scenario "CI failure では merge も遷移も行われない": merge-then-archive.ts の CI wait / escalation ロジック無変更（TC-032 相当）✅

**Req: plain archive は次のアクションを操作者に提示する**
- Scenario "記帳成功時の案内出力": step 5 で "Archive record pushed to feature branch. Job '...' remains in awaiting-archive until PR #N is merged. After the PR is merged, re-run: specrunner job archive <slug>" を stdout 出力（TC-024）✅

### 設計制約・不変条件の確認

| 制約 | 確認結果 |
|------|---------|
| `VALID_TRANSITIONS` / `TERMINAL_STATUSES` 無変更 | ✅ `lifecycle.ts` diff なし |
| `attachArchivePolicy` 無変更 | ✅ `checkpoint-policy.ts` diff なし |
| `orchestrator.ts` が GitHubClient を import しない | ✅ grep 結果でヒットなし |
| 新規 CLI コマンド / flag なし | ✅ `command-registry.ts` の ARCHIVE_USAGE 追記のみ |
| ARCHIVE_USAGE に "Archive the completed change folder" を含む | ✅ 文字列維持確認 |
| ARCHIVE_USAGE に新契約（awaiting-archive / merge 後再実行）が明記 | ✅ "leaves the job in awaiting-archive until the PR is merged. After the PR is merged, re-run..." |
| README.md 更新 | ✅ `specrunner job archive <slug>` の説明行が新契約に対応 |
| `merge-then-archive.test.ts` 無変更 | ✅ diff なし（31 tests green） |
| `archive-from-issue.test.ts` 無変更 | ✅ diff なし |
| `archive-minimum-assurance.test.ts` 無変更 | ✅ diff なし |

## 検証できなかった項目

None（全 spec Requirement / Scenario を確認）

## Findings 詳細

### Finding: TC-020 / Spec Scenario "GitHub client が利用できない" — stderrWrite warning 未出力

**場所**: `src/core/archive/plain-archive.ts` Step 3（L112付近）

**spec 要求**（spec.md, Requirement: merge 状態を判定できない場合は awaiting-archive を維持して成功する, Scenario: GitHub client が利用できない）:
```
Then コマンドは exit code 0 を返し、merge 未確認である旨が警告として出力される
```

**実装状況**:
- `getPullRequest` が例外を投げる場合 → `stderrWrite("Warning: could not check PR #...")` が出力される ✅
- `githubClient` が absent の場合（step 3 のガード条件 `!githubClient` で全体をスキップ）→ stderrWrite は呼ばれない ❌

`githubClient` absent 時は step 5 で "Archive record pushed to feature branch. Job '...' remains in awaiting-archive..." の **stdout** メッセージのみが出力される。spec が要求する "警告として出力される"（= stderrWrite の warning）は出力されない。

**影響**:
- 機能的な動作（archive record の作成・awaiting-archive 維持・exit 0）は正しい
- ユーザー向けガイダンスは step 5 の stdout メッセージで補完されているが、「merge 状態を確認できなかった」ことの明示的な警告が欠落している
- TC-020 の test も warning 出力を pin しておらず、この gap を検出できない

**深刻度**: low（主要な機能要件は満たされており、ユーザーへの情報は step 5 メッセージで最低限伝わる）

**修正対象**: implementer
- `plain-archive.ts`: step 3 をスキップする分岐（`!githubClient || !owner || !repo || prNumber === undefined`）に、prNumber があるのに githubClient が無い場合の stderrWrite を追加する
- `plain-archive.test.ts` の TC-020: stderrWrite warning が出力されることを assertion に追加する
