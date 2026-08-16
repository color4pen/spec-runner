# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### Code Assertions (コードの前提検証)

**コマンド・flag の実在確認** (`src/cli/command-registry.ts`)

| 主張 | 検証結果 |
|------|---------|
| `job start --detach` | ✅ `RUN_JOB_FLAGS.detach` に存在 |
| `job wait` | ✅ command-registry.ts に handler あり |
| `job archive --with-merge` | ✅ archive flags に `"with-merge": { type: "boolean" }` |
| `job resume --apply-canon` | ✅ resume flags に存在 |
| `job resume --adopt-commits` | ✅ resume flags に存在 |
| `job resume --from / --force / --prompt / --prompt-file / --detach` | ✅ 全フラグ存在 |
| `job reopen --from / --reason` | ✅ 存在 |
| `job reopen` に `apply-canon / adopt-commits / detach` が無い | ✅ reopen flags に不在 |
| `job cancel --restore-draft` | ✅ cancel flags に存在 |
| `job prune --force` | ✅ prune flags に存在 |
| `job attach --branch` | ✅ attach flags に存在 |
| `request template` / `request validate` | ✅ request children に存在 |
| `rules new <step> <slug>` | ✅ rules.children.new に存在 |
| `reviewers new <name>` | ✅ reviewers.children.new に存在 |
| `config effective [--type <t>]` | ✅ config.children.effective に存在 |
| `specrunner login --force` | ✅ login flags に存在 |
| `specrunner credentials set claude-code` | ✅ credentials.children.set に存在 |
| `inbox run` | ✅ inbox.children.run に存在 |

**escalation 関連** (`src/core/finish/escalation.ts`)

- `formatEscalation` 関数が存在し、operator 向け halt 出力を組み立てる ✅
- 現行は 4 フィールド(`failedStep / detectedState / recommendedAction / resumeCommand`)のみで `guide escalation` 導線は未追加 ✅（要件 3 で追加対象）

**skills 検証**

- `.claude/skills/job-run-monitor/SKILL.md` が存在し、厚い手順本文を持つ ✅
- `.claude/skills/rebase-finish/SKILL.md` が存在し、厚い手順本文を持つ ✅
- `.claude/skills/acceptance-and-issue-audit/SKILL.md` が存在し、厚い手順本文を持つ ✅
- `.claude/skills/parallel-request-workflow/SKILL.md` が存在し、廃止済みコマンド `request review` を参照している ✅（削除対象）

**単一ソース + drift-guard パターン**

- `src/prompts/pipeline-map.ts` に `PIPELINE_MAP` 定数が存在 ✅
- `src/prompts/__tests__/prompt-skeleton-drift-guard.test.ts` が `toContain(PIPELINE_MAP)` でピン ✅（topic registry の drift-guard の設計モデル）

**inbox**

- `DEFAULT_INBOX_APPROVE_LABEL = "specrunner-approved"` は `src/config/schema/types.ts` で確認 ✅
- INBOX_RUN_USAGE に "Exits after one pass. Does not run as a daemon." ✅

**init**

- 現行 `init` 完了出力に CLAUDE.md snippet は未出力 ✅（要件 4 で追加対象）

**chore 型の spec 免除**

- `chore` が spec-exempt type として `src/templates/step-output-templates.ts` で確認 ✅
  topic (f) "chore はテスト生成免除" は正確

**worktree stagger**

- `job-run-monitor` skill に "並列起動は `sleep 3` で stagger する (= `git worktree add` の `.git/config` ロック競合回避)" ✅

**`guide` サブコマンドの現状**

- 現時点で `guide` コマンドは command-registry.ts に存在しない ✅（新規追加対象）

### 実装の妥当性

- 9 topic 全ての内容に裏付けとなるコード・設定が確認できた
- `reopen` と `resume` のフラグ差異（reopen に detach/apply-canon/adopt-commits なし）は CLI 実装と合致している
- `rules new` の delivery frontmatter (`followup` / `prompt`) は RULES_USAGE に正確に記述されている

## 検証できなかった項目

- `claude setup-token` の存在（Claude Code CLI の外部コマンドのため、本リポジトリ内では確認不可。specrunner の制御外として request に "外部前提" 扱いで記載されているのが適切な書き方）
- `buildAdoptionHaltMessage`（`src/core/resume/adopt-commits.ts`）への `guide escalation` 導線追加の要否 — 要件 3 は "formatEscalation、resumePoint.reason 系の案内文" を明示しており、`buildAdoptionHaltMessage` は要件テキストに列挙されていない。実装者が escalation 系出力として追加するかは裁量

## Findings 詳細

指摘なし。要件・前提・コード断言の全てが現行コードと整合している。
