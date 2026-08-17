# Conformance Result — guide-correctness-hardening — iter 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### spec.md 全 Requirements / Scenarios

**Req: review topic SHALL describe request.md as the canonical reference post-pipeline-start**
- `guide.ts` review body: "pipeline 開始後の規範は request.md / spec: pipeline 開始後は request.md が規範。issue との比較は audit topic の転記監査観点であり、review では行わない。" — "起点 issue の正典を canon とする" は不在 ✅
- TC-022/023 が本文に固定 ✅

**Req: audit topic SHALL position issue comparison as a transcription-audit concern only**
- audit body に `## issue 対 request.md 転記監査(オプション観点)` セクションが存在し "転記監査" を含む ✅
- "起点 issue の正典と照合する" は不在 ✅
- TC-024/025 が固定 ✅

**Req: escalation topic cancel guidance SHALL use jobId, not slug**
- 後片付けセクションに `specrunner job show <slug>  # Job ID を確認` → `specrunner job cancel <jobId> --restore-draft` の 2 段 ✅
- `job cancel <slug>` は存在しない ✅
- TC-026/027/037 が固定 ✅

**Req: merge topic worktree path SHALL specify the 8-character jobId prefix**
- `cd .git/specrunner-worktrees/<slug>-<jobIdの先頭8文字>` に修正済み ✅
- `<slug>-<jobId>` (full) 表記は不在 ✅
- TC-028/038 が固定 ✅

**Req: jobs topic SHALL NOT contain the stale job-ls pre-check step**
- "job ls で running を確認" は jobs body に不在 ✅
- TC-029 が固定 ✅

**Req: setup topic init description SHALL reflect global config + repository scaffold**
- 見出し: `## 1. init — global config + repository scaffold` ✅
- "2 層 config scaffold" は不在 ✅
- TC-030 が固定 ✅

**Req: runner.ts halt output SHALL include a guide escalation link**
- `runner.ts:452`: `logInfo("詳細: specrunner guide escalation");` が else ブロック内に追加済み ✅
- TC-031 が 500 char window で固定 ✅

**Req: invocation contract SHALL cover triple-backtick code blocks**
- `extractSpecrunnerLinesFromCodeBlocks` + `parseInvocation` + `validateInvocation` 実装済み ✅
- `INVOCATION_CONTRACT_SKIP_PATTERNS` が `{ pattern, reason }` 配列で定義、現エントリ `/[|$>]/` に reason あり ✅
- TC-032 が全 topic code block コマンドを網羅的に検証 ✅
- TC-033 が空 reason 不在を確認 ✅

**Req: invocation contract SHALL fail on placeholder name mismatch**
- TC-034: `specrunner job cancel <slug> --restore-draft` → `positional-name-mismatch` (detail に "slug" を含む) ✅
- TC-039: `specrunner job cancel <jobId> --restore-draft` → violations 空配列 ✅

**Req: acceptance-and-issue-audit SKILL.md SHALL NOT mention parallel-request-workflow**
- SKILL.md frontmatter に "parallel-request-workflow" は不在 ✅
- TC-035 が固定 ✅

**Req: ADR SHALL reflect actual state of parallel-request-workflow deletion**
- ADR:49 "directory ごと削除する (tombstone なし)" に修正済み ✅
- "tombstone を置いて実質削除する" は不在 ✅
- TC-036 が固定 ✅

### request.md 受け入れ基準 (全 12 項)

| # | 受け入れ基準 | 判定 | 根拠 |
|---|-------------|------|------|
| 1 | review/audit topic に issue-as-canon 記述なし、request.md/spec を規範とする記述あり (テスト固定) | ✅ | TC-022〜025 |
| 2 | escalation cancel 案内が job show → job cancel \<jobId\> の 2 段 (テスト固定) | ✅ | TC-026/027/037 |
| 3 | merge topic worktree path が先頭 8 文字表記 (テスト固定) | ✅ | TC-028/038 |
| 4 | 全コマンド例 (inline + code block) を path/flag/positional で検証、除外は明示リスト管理 (テスト固定) | ✅ | TC-032/033 |
| 5 | `job cancel <slug>` が positional-name-mismatch violation を返す (テスト固定) | ✅ | TC-034 |
| 6 | runner.ts halt 出力に `specrunner guide escalation` を含む (テスト固定) | ✅ | TC-031 |
| 7 | jobs topic に `job ls で running を確認` 手順なし (テスト固定) | ✅ | TC-029 |
| 8 | setup topic init 記述が global config + repository scaffold の実態と一致 | ✅ | TC-030 + guide.ts:197 |
| 9 | SKILL.md に `parallel-request-workflow` 文字列なし | ✅ | TC-035 + 実ファイル確認 |
| 10 | ADR が directory 削除の実状態と一致 | ✅ | TC-036 + ADR:49 確認 |
| 11 | 既存 TC-001〜021 が無変更で green | ✅ | verification-result: 11721 passed |
| 12 | `typecheck && test` が green | ✅ | verification-result: all phases passed, exit 0 |

### tasks.md チェックボックス状態 (参考)

全タスク (T-01〜T-07) が [x] 完了状態。conformance gate ではない。

## 検証できなかった項目

None

## Findings 詳細

None
