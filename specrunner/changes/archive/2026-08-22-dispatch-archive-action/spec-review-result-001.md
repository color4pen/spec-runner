# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 前提コードの事実確認

| 項目 | 確認内容 | 結果 |
|------|---------|------|
| `.github/workflows/specrunner-dispatch.yml` | `action` choices が `start` / `resume` のみ（`archive` なし） | ✓ 一致 |
| `src/git/checkpoint-ref.ts:21` | `EXCLUDED_CHANGE_DIRS = new Set(["archive", "canceled"])` | ✓ 一致 |
| `src/core/job-access/load-by-job-id.ts:85` | fallback scan で `entry.name === "archive"` を skip | ✓ 一致 |
| `src/core/archive/job-context.ts:47` | `JobStateStore.listWithSourceDirs(cwd, { includeArchived: true })` | ✓ 一致 |
| `src/core/archive/job-context.ts:68` | `archiveRecorded` のインライン式 `basename(dirname(sourceChangeDir)) === "archive"` | ✓ 一致 |
| `src/core/archive/merge-completion.ts:44-51` | `markJobArchived` 失敗を catch して警告のみ・cleanup 継続 | ✓ 一致 |
| `src/core/archive/post-merge-cleanup.ts:112` | `isRemoteRefNotFound` で remote 削除エラーを吸収 | ✓ 一致 |
| `src/store/job-catalog.ts:40-47` | `tryMerge` で jobId キーの dedup（`updatedAt` 最新が勝つ） | ✓ 一致 |
| `src/store/job-state-store.ts:178` | `JobStateStore.listWithSourceDirs` が `JobCatalog.listWithSourceDirs` に委譲 | ✓ 一致 |
| `src/state/schema/types.ts:496` | `JobState.issueNumber?: number \| null` が定義されている | ✓ 一致 |
| `src/core/command/pipeline-run.ts:169-172` | `this.options.issue` 存在時に `jobState.issueNumber` に設定 | ✓ 一致 |
| `src/core/issue-target/start.ts:85` | `materializeDraftAndStart` が `issue: issueNumber` を startPrimitive に渡す | ✓ 一致 |
| `src/state/job-slug.ts:69` | `getJobSlug` が `request.slug → branch → path → ""` の順 | ✓ 一致 |

### 設計クレームの検証

| 設計 D# | クレーム | 検証結果 |
|---------|---------|---------|
| D3 | `job-context.ts` は `nodePath` / `JobStateStore` / `getJobSlug` を既に import しており新規 import 不要 | ✓ 確認 |
| D3 | `isArchiveRecordDir` による判定一本化（fallback と `resolveArchiveJobContext` で同じ述語）| ✓ 設計正当 |
| D4 | archive record は merge 後の base に初めて載る。merge 前の worktree archive も `isArchiveRecordDir` で hit するが `runPlainArchive` の PR OPEN 分岐で冪等 | ✓ plain-archive.ts Step 3/4 で確認 |
| D5 | 同一 jobId の候補はたかだか 1 件（`listWithSourceDirs` が jobId で dedup） | ✓ job-catalog.ts `tryMerge` で確認 |
| D5 | `issueNumber` が `undefined` / `null` の record は不一致扱い（`undefined === 42` → false） | ✓ TypeScript 等値比較で自動成立 |
| D6 | `runPlainArchive` の `archiveRecorded + PR MERGED` → `completeAfterMerge` の既存フローに委譲 | ✓ plain-archive.ts:126-148 で確認 |

### Spec ↔ Request 対応確認

| 受け入れ条件 | spec.md Scenario | 対応 |
|-------------|-----------------|------|
| workflow choices に `archive` が含まれる | action choices contain archive | ✓ |
| archive 分岐が CLI 呼び出し 1 件のみ | archive branch delegates to the CLI only | ✓ |
| fallback が slug 解決後 attach を経ずに `runArchive` へ | post-merge resolution with the head branch deleted | ✓ |
| jobId 不一致 record は対象外 | record with a mismatched jobId is not resolved | ✓ |
| issueNumber 不一致 record は対象外 | record with a mismatched issueNumber is not resolved | ✓ |
| active な change folder は対象外 | an active change folder is not treated as an archive record | ✓ |
| local state が優先 | local state takes priority over the archive record | ✓ |
| merge 前は closing PR 経路 | pre-merge falls through to the closing PR path | ✓ |
| いずれも不成立は従来動作 | neither path resolves a target | ✓（後述 F-001 参照）|
| 単一述語要件 | fallback-resolved slug is seen as archive-recorded by the archive run | ✓ |

### テストケース ↔ Spec 対応確認

- TC-001〜TC-003: workflow YAML 構造（T-04 の新規テスト）— spec Requirement 1 の 3 Scenario に 1:1 対応 ✓
- TC-004〜TC-007: archive record fallback 照合（T-05）— spec Requirement 2 の主要 Scenario に対応 ✓
- TC-008〜TC-010: 解決順序（T-06）— spec Requirement 3 の Scenario に対応 ✓
- TC-011: 単一述語整合（T-05）— spec Requirement 4 に対応 ✓
- TC-012〜TC-014: edge case・診断出力（T-05, T-06）— tasks.md から追加 ✓
- TC-015〜TC-018: gate / 既存テスト非退行確認 ✓

### セキュリティ観点

| 観点 | 検証内容 | 結果 |
|------|---------|------|
| Shell injection（workflow） | `"$ISSUE"` が正しく二重引用符で囲まれている | ✓ 安全 |
| CLI 入力検証 | `from-issue` フラグが `{ type: "integer", min: 1 }` で定義（command-registry.ts:1333） | ✓ 非整数は parse エラー |
| 新規認証面の有無 | fallback はローカル filesystem read のみ。GitHub API 呼び出し追加なし | ✓ |
| OWASP A01（アクセス制御）| workflow_dispatch は write 権限が必要（GitHub の既存ゲート）。新たな bypass なし | ✓ |

---

## 検証できなかった項目

- **ephemeral runner での実際の動作**: `markJobArchived` が `JOB_NOT_FOUND` を throw して警告が出る経路（Risk 1）は E2E でのみ確認可能。設計の Mitigation（merge-completion.ts の catch）はコードで確認済み。
- **`issueNumber` の end-to-end 書き込み**: `materializeDraftAndStart` → `startPrimitive` → `pipeline-run.ts:170-172` の連鎖は各ファイルで個別に確認したが、結合テストは範囲外。なお T-05 の fixture で `issueNumber` を state.json に含める前提が置かれており、issue 起点の実際の書き込みとの整合はその fixture が担保する。

---

## Findings 詳細

### F-001: spec.md の "neither path resolves" 要件文が pre-existing の `ARCHIVE_FROM_ISSUE_NO_PR` ケースを暗黙的に含む

**場所**: `specrunner/changes/dispatch-archive-action/spec.md` — Requirement: Existing resolution paths shall retain priority and fallback behavior の要件本文

**内容**:  
要件本文の SHALL 節は「いずれの経路でも target を確定できない場合は `ARCHIVE_FROM_ISSUE_UNCONFIRMED` を返 SHALL す」と断言している。しかし closing PR がゼロ件の場合、既存コードは `archiveFromIssueNoPrError`（`ARCHIVE_FROM_ISSUE_NO_PR`、exit 2）を返し、`ARCHIVE_FROM_ISSUE_UNCONFIRMED` ではない。exit code は同じ 2（`ARG_ERROR`）だが error code は異なる。

Scenario 本文（"closing PR のいずれも identity 照合を通らない"）と T-06 のモック設定は正しくこのケースをスコープとしており、テストは妥当。問題は要件本文の述語が「一般の no-target ケース全体」に `ARCHIVE_FROM_ISSUE_UNCONFIRMED` を保証するように読める点。

**修正案**: 要件本文を「closing PR が存在するが identity 照合を通らない場合は `ARCHIVE_FROM_ISSUE_UNCONFIRMED` を返 SHALL す（closing PR がゼロ件の場合は pre-existing の `ARCHIVE_FROM_ISSUE_NO_PR` を返す）」に絞り込む。

**影響**: テスト・実装に変更不要。spec.md の要件文のみの精度向上。
