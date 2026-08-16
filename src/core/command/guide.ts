/**
 * Guide topic registry and pure builders.
 * Single source of truth for all guide topics: name, summary, body.
 *
 * Design: pure builder + thin handler (same pattern as request-prompt.ts).
 * No network, no repo state, no I/O in builders.
 */
import { stdoutWrite, stderrWrite } from "../../logger/stdout.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GuideTopic {
  name: string;
  summary: string;
  body: string;
}

// ---------------------------------------------------------------------------
// Topic registry (single source of truth)
// ---------------------------------------------------------------------------

export const GUIDE_TOPICS: readonly GuideTopic[] = [
  {
    name: "jobs",
    summary: "job の起動 → 監視 → halt 対応 → 取り込み",
    body: `# guide: jobs — job 起動・監視・取り込み

## 1. 起動 — 必ず --detach

\`\`\`bash
specrunner job start <slug|file> --detach [--issue <n>]
specrunner job resume <slug> --detach
\`\`\`

- **run_in_background を使わない**: harness が SIGTERM で撃つ。--detach がプロセスを切り離す正しい経路。
- 並列起動は \`sleep 3\` で stagger する (worktree ロック競合 Issue #166 の回避)。

## 2. 監視 — job wait

起動直後は state 登録に数秒ラグあり。\`specrunner job ls\` で running を確認してから:

\`\`\`bash
specrunner job wait <slug>
\`\`\`

Monitor tool に渡す場合は 1 行 echo して exit させる (settle 通知 1 回のみ):

\`\`\`bash
specrunner job wait <slug> >/dev/null 2>&1
rc=$?
jline=$(specrunner job show <slug> 2>/dev/null | grep -im1 "status")
echo "<slug> settled: rc=$rc $jline"
\`\`\`

判定は exit code でなく Status フィールドで行う (halt でも非ゼロになる)。

## 3. halt (awaiting-resume) 対応

\`\`\`bash
specrunner job show <slug>          # resumePoint.reason を確認
\`\`\`

詳細な復帰手順: \`specrunner guide escalation\`

## 4. 取り込み — archive --with-merge

\`\`\`bash
specrunner job archive <slug> --with-merge
\`\`\`

- --with-merge: CI 待ち → squash merge → cleanup を一括実行。gh で merge を分割しない。
- 完了判定は archive プロセス終了 + ログの「marked as archived」で行う (job ls ではない)。

## 5. 並列起動の stagger

\`\`\`bash
specrunner job start a.md --detach
sleep 3
specrunner job start b.md --detach
\`\`\`

git worktree add の .git/config ロック競合 (Issue #166) を回避するために必要。
`,
  },
  {
    name: "merge",
    summary: "archive 前の手動 rebase 手順と --with-merge",
    body: `# guide: merge — 手動 rebase + archive

## 前提確認

\`\`\`bash
specrunner job ls          # awaiting-archive を確認
\`\`\`

## PR が CLEAN/MERGEABLE な場合 — rebase 省略可

\`\`\`bash
specrunner job archive <slug> --with-merge
\`\`\`

--with-merge が PR status 確認 → squash merge → cleanup を一括で行う。
PR が既に MERGED なら archive のみ実行される。

## 手動 rebase が必要な場合

archive は rebase を行わない。main が進んでいる場合は worktree 内で先に rebase する:

\`\`\`bash
cd .git/specrunner-worktrees/<slug>-<jobId>
git fetch origin main
git rebase origin/main
# 衝突があれば解消 → git rebase --continue
git push --force-with-lease origin HEAD:<branch-name>
cd <repo-root>
\`\`\`

その後 archive を実行する:

\`\`\`bash
specrunner job archive <slug> --with-merge
\`\`\`

## 複数 PR を順次 archive する場合

1 件完了 → \`git pull --ff-only\` で main 最新化 → 次の worktree で rebase → archive を繰り返す。

## 失敗パターン

- **BLOCKED/UNSTABLE**: branch protection 要件未充足。CI が通るまで待つ。
- **non-fast-forward**: 別 worktree から push した可能性。job の worktree 内から push する。
- rebase 衝突で意味的に矛盾する場合はユーザーに仰ぐ。
`,
  },
  {
    name: "audit",
    summary: "merge 済み PR の受け入れ基準監査",
    body: `# guide: audit — 受け入れ基準 + 構造的問題の事後監査

## 目的

完走 / merged 済み PR を 3 軸で監査する:
1. **AC 突合せ**: request.md の受け入れ基準と PR 実装の照合
2. **実装ギャップの分類**: 実害ゼロ / 追加 commit / 新規 issue 候補
3. **構造的問題の検出**: 同型事故累積 / LLM 不確定性パターン / scope 漏れ

本監査は read-only が基本。修正 commit / issue 起票はユーザー明示承認後のみ。

## 対象 PR の確認

\`\`\`bash
specrunner job ls --all       # job 一覧
\`\`\`

## AC 突合せ手順

request.md の \`## 受け入れ基準\` 各項目に対応するコード変更 / テスト追加を確認する。
\`## スコープ外\` の項目が実装に含まれていないことも確認する(scope 違反検出)。

結果を以下の形式で整理:

| AC | 実装 | 判定 |
|----|------|------|
| <criterion> | <file:line または PR#> | ✅ / ⚠️ 部分 / ❌ 未 |

## ギャップの 3 区分分類

| 区分 | 対応 |
|------|------|
| 実害ゼロ | 警告のみ |
| 追加 commit で対応 | 実装漏れ / テスト抜け → commit 案提示 |
| 新規 issue 候補 | scope 外の構造問題 → issue draft 作成 |

## 構造的問題の横断観察

- 同じ層に rule / prompt 規律を 3 件以上繰り返す → 構造変更を疑う
- agent の判断場面を消す構造解を検討する
- scope 外宣言から派生した追加対応候補を列挙する

## レビューの起点 issue 照合

- レビューは request.md ではなく起点 issue の正典と照合する
- request.md 作成時の無言の要件弱体化は全 gate を素通りするため注意
`,
  },
  {
    name: "setup",
    summary: "初期セットアップ: install → init → doctor → 最初の 1 本",
    body: `# guide: setup — 初期セットアップ

## 前提

\`\`\`bash
bun install    # または npm install
\`\`\`

## 1. init — 2 層 config scaffold

\`\`\`bash
specrunner init
\`\`\`

- user-global config: \`~/.config/specrunner/config.json\` (0600) — provider 選択 anthropic|openai
- per-repo scaffold: \`specrunner/drafts/\`・\`specrunner/changes/\`・\`.gitignore\` 追記

## 2. doctor — 不足を確認

\`\`\`bash
specrunner doctor
\`\`\`

fail 0 かつ warn が残っていても Ready。足りないものだけ以下でセットアップする。

## 3. GitHub 認証

\`gh auth login\` 済み / \`GH_TOKEN\`・\`GITHUB_TOKEN\` env 供給済みなら不要。
なければ:

\`\`\`bash
specrunner login
\`\`\`

GitHub Device Flow 専用。公式 GitHub App の client_id が CLI に組み込み済み。
有効な token を検出すると出所を表示して Device Flow を自動省略する (\`--force\` で強制実行)。

## 4. headless 用 token (attended 利用では不要)

cron / inbox 向け Claude Code token:

\`\`\`bash
claude setup-token    # claude CLI で token 生成
specrunner credentials set claude-code
\`\`\`

managed runtime 向け API key:

\`\`\`bash
specrunner credentials set anthropic-api-key
\`\`\`

credential は \`~/.config/specrunner/credentials.json\` (0600) に保存。
入力は echo されない (TTY silent / 非 TTY stdin)。**token の cat / echo 禁止**。
attended 利用では headless token は不要 — doctor は warn 表示のみ。

## 5. 再確認

\`\`\`bash
specrunner doctor
\`\`\`

fail 0 なら Ready。

## 6. 最初の 1 本

\`\`\`bash
specrunner request template > specrunner/drafts/my-request.md
# request.md を編集
specrunner request validate specrunner/drafts/my-request.md
specrunner job start specrunner/drafts/my-request.md --detach
specrunner job wait my-request
\`\`\`
`,
  },
  {
    name: "escalation",
    summary: "halt 診断と復帰 flag 分岐、後片付け",
    body: `# guide: escalation — halt 診断と復帰

## 1. 診断

\`\`\`bash
specrunner job show <slug>          # resumePoint.reason を確認
\`\`\`

verbose log の末尾で escalation finding を確認:

\`\`\`bash
grep -n "CANON_FINDING\\|escalat" .specrunner/logs/<jobId>.log | tail -20
\`\`\`

## 2. 復帰 flag 分岐

| 状況 | 手当て | コマンド |
|------|--------|----------|
| 保護正典を worktree 内で編集 (commit しない) | そのまま | \`specrunner job resume <slug> --apply-canon\` |
| worktree に commit を追加した | commit 済み | \`specrunner job resume <slug> --adopt-commits\` |
| 正典 + commit の両方 | 両方 | \`specrunner job resume <slug> --apply-canon --adopt-commits\` |
| 転記型 fix (code-fixer に委ねる) | 置換後の文面まで指定 | \`specrunner job resume <slug> --from code-fixer --prompt "<具体的な置換後文面>"\` (曖昧指示は fixer が no-op) |
| spec-review escalation (plain resume が空回り) | spec-fixer に渡す | \`specrunner job resume <slug> --from spec-fixer --prompt "<修正内容>"\` |
| operator commit 採択後、judge から再開 | judge step 指定 | \`specrunner job resume <slug> --from code-review\` |
| 3 連続 escalation guard (手当て済み) | guard を override | \`specrunner job resume <slug> --force\` |

**注意**:
- custom-reviewers / regression-gate は複合 step のため --from の対象外。
- 複合 step から先に resume すると自動的に正しい step から再開される。

## 3. awaiting-archive からの再開

resume ではなく reopen を使う:

\`\`\`bash
specrunner job reopen <slug> --from <step> --reason "<理由>"
\`\`\`

**reopen の制約**: --apply-canon / --adopt-commits / --detach / --prompt は使えない。
--from と --reason が必須。

## 4. 後片付け

\`\`\`bash
specrunner job cancel <slug> --restore-draft   # job をキャンセルし request.md を drafts/ に復元
specrunner job prune --force                   # orphan worktree・sidecar を削除
specrunner job attach --branch <branch>        # remote branch の quiescent checkpoint を attach
\`\`\`
`,
  },
  {
    name: "request",
    summary: "起票規律: type 選択・受け入れ基準・validate",
    body: `# guide: request — 起票規律

## 1. template から始める

\`\`\`bash
specrunner request template > specrunner/drafts/<slug>.md
# または
specrunner request template --type bug-fix > specrunner/drafts/<slug>.md
\`\`\`

## 2. type 選択

| type | 使う場面 |
|------|----------|
| new-feature | 新機能の追加 |
| spec-change | 仕様・設計の変更(機能追加なし) |
| bug-fix | 不具合・誤動作の修正のみ |
| refactoring | 外部挙動を変えないコード再構成 |
| chore | テスト生成免除の軽微作業 |

**chore は機械の歯が要る変更に使わない** (テスト生成が免除される)。
設計追加を含む場合は bug-fix でなく spec-change / new-feature を選ぶ。

## 3. 受け入れ基準の書き方

- 機械検証できる文にする: 「テストで固定する」「typecheck && test が green」など
- 必要な「歯」(assertion / pin テスト / import guard 等) を名指しする
- 既定値変更は旧値 pin テストを全列挙し更新許容を明記する

## 4. スコープ外の明記

実装中に「ついでにやりたくなる」隣接変更を \`## スコープ外\` に列挙する。
設計分岐を先に潰すことで pipeline の迷走を防ぐ。

## 5. 外部 SDK / API 制約

CLI は外部の情報を持たない。外部 SDK・API の制約は起票者が request.md に明示する。

## 6. validate → start

\`\`\`bash
specrunner request validate specrunner/drafts/<slug>.md
specrunner job start specrunner/drafts/<slug>.md --detach
\`\`\`

意味レビューは pipeline 先頭の request-review step が担う。
`,
  },
  {
    name: "review",
    summary: "PR 精読の観点と深度判断",
    body: `# guide: review — PR 精読の観点

## 基本姿勢

- **起点 issue / request の正典と照合する**: request.md でなく起点 issue の正典を canon とする。
  request.md 作成時の無言の要件弱体化は全 gate を素通りする。
- **断定前に現物を読む**: 「収束する」「routing する」と断定する前に該当関数を現物で読む。
  別経路の緑テストを証拠にしない。
- **AC が名指しした歯の生存を確認**: 受け入れ基準で名指しした pin テスト・assertion が
  最終 HEAD で生存していることを確認する。
- **fail-open を safe 扱いしない**: 例外を catch して成功扱いするコードは fail-open。安全ではない。

## 深度判断

| 規模 | 判断 |
|------|------|
| 小粒 bug-fix | 機械検証 (typecheck + test) で足りる |
| spec-change / new-feature | 精読レビュー (コード + テスト + spec 照合) |
| 設計判断を含む | escalation で spec を見直す手戻りは健全 |

## 修正対応

- 修正は 1 件ずつでなく **分類してバッチ適用** する。
- approve が出たら非ブロッキング指摘で **再レビューに回さない**。

## レビュー後

approve を出したら merge フローへ: \`specrunner guide merge\`
`,
  },
  {
    name: "inject",
    summary: "project 固有知識を pipeline に注入する方法",
    body: `# guide: inject — project 固有知識の注入

## 原則

CLI 組み込み prompt に repo 固有資源を直接書かない。
固有知識は \`rules new\` / \`reviewers new\` で step 単位に注入する。

## rules — 既存 step への規律追加

\`\`\`bash
specrunner rules new <step-name> <rule-slug>
\`\`\`

例:

\`\`\`bash
specrunner rules new implementer no-inline-comment
specrunner rules new code-review prefer-explicit-types
\`\`\`

ファイルが \`specrunner/rules/<step-name>/NN-<rule-slug>.md\` に生成される。

### delivery frontmatter

\`\`\`yaml
---
delivery: followup   # 既定。事後検証型(コード規約等)
---
\`\`\`

\`\`\`yaml
---
delivery: prompt     # 行動制約型(禁止コマンド・触ってはいけないファイル等)
                     # 作業中に効かなければ意味がないルールはこちら
---
\`\`\`

### rules 化の判断基準

同種 escalation の反復 → rules 化。ただし rules 追加は対症療法。
根本対策は **agent の判断場面を消す構造化**。

## reviewers — 独立レビューレンズの追加

既存 gate に無い観点がある時のみ:

\`\`\`bash
specrunner reviewers new <name>
\`\`\`

ファイルが \`specrunner/reviewers/<name>.md\` に生成される。
frontmatter の \`paths\` / \`requestTypes\` で起動条件を宣言できる。

## 実効値確認

\`\`\`bash
specrunner config effective
specrunner config effective --type spec-change
\`\`\`
`,
  },
  {
    name: "inbox",
    summary: "無人運用: 承認ラベル発火・/resume・cron",
    body: `# guide: inbox — 無人運用

## 発火のしくみ

- **承認ラベル** (既定: \`specrunner-approved\`) が付いた issue から job を自動発火。
- \`/resume\` コメントが付いた awaiting-resume job を再開。
- terminal 時 / reject 時は issue にコメント通知。reject は承認ラベルを除去。

## inbox run — 1 pass 実行

\`\`\`bash
specrunner inbox run
\`\`\`

**daemon ではない**。1 pass で終了する。定期実行には外部スケジューラ (cron 等) を使う。

dry-run で確認:

\`\`\`bash
specrunner inbox run --dry-run
\`\`\`

## 手動起動と issue 紐付け

\`\`\`bash
specrunner job start <slug|file> --issue <n>
\`\`\`

terminal 時に issue にコメント通知される。

## issue を判断台帳として使う

escalation の裁定を issue コメントに残し、\`/resume\` コメントで再開する。
発火・裁定・完了が issue 上に時系列で残るため、過去の判断が追跡できる。

## escalation の裁定フロー

1. job が halt → issue に escalation コメントが投稿される
2. operator が裁定をコメントし issue にメモを残す
3. worktree で手当て後、\`/resume\` コメントを投稿 → \`inbox run\` が再開

詳細: \`specrunner guide escalation\`
`,
  },
];

// ---------------------------------------------------------------------------
// Pure builders
// ---------------------------------------------------------------------------

/**
 * Render the topic list (one line per topic: "<name> — <summary>").
 * Derived from GUIDE_TOPICS — no hand-written enumeration.
 */
export function renderTopicList(): string {
  const lines = GUIDE_TOPICS.map((t) => `  ${t.name.padEnd(12)} — ${t.summary}`);
  return ["Available topics:", ...lines, ""].join("\n");
}

/** Find a topic by exact name. */
export function findTopic(name: string): GuideTopic | undefined {
  return GUIDE_TOPICS.find((t) => t.name === name);
}

/** Render error message for unknown topic, including topic list. */
export function renderUnknownTopicError(name: string): string {
  return [`Error: unknown topic "${name}"`, "", renderTopicList()].join("\n");
}

/**
 * Build a CLAUDE.md snippet for pasting.
 * Topic list derived from GUIDE_TOPICS — not hand-written.
 */
export function buildClaudeMdSnippet(): string {
  const topicNames = GUIDE_TOPICS.map((t) => t.name).join(" / ");
  return `## spec-runner 運用ガイド

spec-runner を運用する際は \`specrunner guide <topic>\` で運用ガイドを参照してください。
topics: ${topicNames}
`;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Run the guide command.
 * - topic undefined → print topic list to stdout, return 0
 * - known topic → print body to stdout, return 0
 * - unknown topic → print error + list to stderr, return 2
 */
export function runGuide(topic: string | undefined): number {
  if (topic === undefined) {
    stdoutWrite(renderTopicList());
    return 0;
  }
  const found = findTopic(topic);
  if (found) {
    stdoutWrite(found.body + "\n");
    return 0;
  }
  stderrWrite(renderUnknownTopicError(topic));
  return 2;
}
