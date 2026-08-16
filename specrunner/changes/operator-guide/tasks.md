# Tasks: specrunner guide サブコマンド

<!-- 実装順序メモ: T-01(registry) → T-02(command) → T-03(escalation 導線) →
     T-04(init snippet) → T-05(skill diet) → T-06(drift-guard / 機械テスト)。
     T-05 は T-01 完了後(内容移設後)に行う。 -->

## T-01: guide topic registry + 純粋 builder を新設する

- [x] `src/core/command/guide.ts` を新規作成する。
- [x] `export interface GuideTopic { name: string; summary: string; body: string }` を定義する。
- [x] `export const GUIDE_TOPICS: readonly GuideTopic[]` を宣言順で 9 topic 定義する:
  - `jobs` — job-run-monitor の内容を正本として移設。起動 `specrunner job start --detach`、監視
    `specrunner job wait`、取り込み `specrunner job archive --with-merge`、完了判定・halt 時の一次
    対応。並列起動の stagger(`sleep 3`、理由は worktree ロック競合 #166)を追補。旧
    parallel-request-workflow の並列起動手順もここへ畳む。
  - `merge` — rebase-finish の内容を移設。archive 前の手動 rebase 手順、PR が CLEAN/MERGEABLE なら
    rebase 省略可。
  - `audit` — acceptance-and-issue-audit の内容を移設。merge 済み PR の受け入れ基準監査。
  - `setup` — request.md 要件 2(d) の内容を新規著述(bun install → `specrunner init` の 2 層 config
    → `specrunner doctor` 中心導線 → GitHub 認証 / `specrunner login` / `specrunner credentials set`
    claude-code / anthropic-api-key → 再 `specrunner doctor` → 最初の 1 本)。token の cat/echo 禁止を
    明記。
  - `escalation` — request.md 要件 2(e) を新規著述。halt 診断 → 復帰 flag 分岐表。**本文に
    `--apply-canon` / `--adopt-commits` / `--from` の分岐と `specrunner job reopen` の制約
    (apply-canon / adopt-commits / detach を持たない)を必ず含める**。後片付け
    (`specrunner job cancel --restore-draft` / `specrunner job prune --force` /
    `specrunner job attach --branch`)。
  - `request` — request.md 要件 2(f) を新規著述(起票規律・type 選択・pin テスト名指し・スコープ外
    明記・外部 SDK 制約・`specrunner request validate` → `specrunner job start`)。
  - `review` — request.md 要件 2(g) を新規著述(PR 精読の観点)。
  - `inject` — request.md 要件 2(h) を新規著述(`specrunner rules new <step> <slug>` / delivery
    frontmatter / `specrunner reviewers new <name>` / `specrunner config effective`)。
  - `inbox` — request.md 要件 2(i) を新規著述(承認ラベル `specrunner-approved` 発火 /
    `specrunner inbox run` は 1 pass daemon ではない / `/resume` コメント / `specrunner job start --issue`)。
- [x] 各 body 内で、機械検証対象の specrunner コマンドは少なくとも 1 回は完全形
  `specrunner <path> ...`(backtick 囲み)で記載する(T-06 の抽出歯が拾えるように)。
- [x] 純粋 builder を export する: `renderTopicList()`(`GUIDE_TOPICS` から `<name> — <summary>` を
  各行導出)、`findTopic(name)`、`renderUnknownTopicError(name)`(エラー行 + `renderTopicList()`)、
  `buildClaudeMdSnippet()`(spec-runner 運用時に `specrunner guide <topic>` を参照する旨 +
  `GUIDE_TOPICS.map(t => t.name)` から導出した topic 一覧一行。手書き列挙しない)。
- [x] handler `runGuide(topic: string | undefined): number` を export する。topic 未指定 →
  `renderTopicList()` を stdout(return 0)、既知 topic → その body を stdout(return 0)、未知 topic
  → `renderUnknownTopicError(topic)` を stderr(return 2)。

**Acceptance Criteria**:
- `GUIDE_TOPICS` は name が `jobs / merge / audit / setup / escalation / request / review / inject /
  inbox` の 9 件を宣言順で持つ。
- `renderTopicList()` は 9 topic すべての name と summary を含む文字列を返す。
- `findTopic("escalation")` は body が非空の topic を返し、その body は `--apply-canon`・
  `--adopt-commits`・`--from`・`reopen` を含む。
- `buildClaudeMdSnippet()` は `GUIDE_TOPICS` の全 name を含む(手書き列挙ではなく map 導出)。
- `runGuide` の戻り値が仕様どおり(未指定/既知=0、未知=2)。

## T-02: `guide [topic]` コマンドを command-registry に登録する

- [x] `src/cli/command-registry.ts` の `COMMANDS` に top-level `guide` を追加する:
  `path: ["guide"]`、`args: [{ name: "topic", required: false }]`、`requiresRepo` は付けない、
  handler は `runGuide(parsed.positional)` を呼び `process.exit` する。
- [x] `help.group: "Guide"` と `help.summary`(guide 案内一行)を設定する。
- [x] `generateTopLevelUsage()` の `groupOrder` 末尾に `"Guide"` を追加する。
- [x] `guide.ts` から `runGuide` を import する。

**Acceptance Criteria**:
- `resolveCommand(["guide"]).status === "ok"` かつ `resolveCommand(["guide", "escalation"]).status === "ok"`。
- top-level `USAGE`(= `generateTopLevelUsage()` 出力)が `guide` を含む。
- `guide` コマンドは `requiresRepo` を持たない(repo 外でも解決・実行可能)。

## T-03: escalation 出力面に guide 導線一行を加える

- [x] `src/core/finish/escalation.ts` の `formatEscalation` の出力に
  `詳細: \`specrunner guide escalation\`` の一行を加える(全 finish/archive halt を一括カバー)。
- [x] `src/core/step/canon-escalation.ts` の `buildCanonEscalationReason` の reason 文面に同じ一行を
  加える(leaf 制約を保つため literal で記載。guide.ts は import しない)。

**Acceptance Criteria**:
- `formatEscalation({...})` の戻り値が `specrunner guide escalation` を含む。
- `buildCanonEscalationReason([...])` の戻り値が `specrunner guide escalation` を含む。
- `canon-escalation.ts` は依然 leaf(`src/core/command/guide.js` を import しない)。

## T-04: init の CLAUDE.md snippet を stdout に出力する

- [x] `src/cli/init.ts` の `runInit` 末尾で `buildClaudeMdSnippet()`(guide.ts から import)を stdout に
  出力する。CLAUDE.md への自動書込はしない。
- [x] snippet は既存の `logResult` 群の後に出す(scaffold 報告を壊さない)。

**Acceptance Criteria**:
- `runInit` の標準出力が `buildClaudeMdSnippet()` の内容(= `specrunner guide` への参照 + registry
  導出の topic 一覧)を含む。
- init は CLAUDE.md ファイルを書き換えない(既存 scaffold 挙動不変)。

## T-05: skill を薄いトリガーへ縮退し parallel-request-workflow を削除する

- [x] `.claude/skills/job-run-monitor/SKILL.md` を、frontmatter `description`(発火トリガー)を残し、
  本文は「`bun ./bin/specrunner.ts guide jobs` を実行して従う」誘導のみ(本文 10 行以内)に書き換える。
- [x] `.claude/skills/rebase-finish/SKILL.md` を同様に `guide merge` 誘導へ縮退する。
- [x] `.claude/skills/acceptance-and-issue-audit/SKILL.md` を同様に `guide audit` 誘導へ縮退する。
- [x] `.claude/skills/parallel-request-workflow/SKILL.md` を廃止済みマーカー(DEPRECATED)に置き換える
  (sandbox write 制約によりディレクトリ削除は実施できないため tombstone で対応。テストは
  「ディレクトリ不在 OR DEPRECATED マーカー在り」の条件で検証)。
- [x] 縮退後の 3 skill 本文に廃止済みコマンド文字列(`request review` / `job finish` / `specrunner ps`)
  を残さない・再導入しない。
- [x] 厚い手順本文(起動/監視/rebase/監査の手順詳細)を skill 側に残さない。

**Acceptance Criteria**:
- `.claude/skills/parallel-request-workflow/` が存在しない(または DEPRECATED tombstone に置換済み)。
- 残る 3 skill の SKILL.md 本文(frontmatter 除く)は 10 行以内で、`guide <topic>` 誘導を含む。
- `.claude/skills/` 配下のどのファイルにも `request review` / `job finish` / `specrunner ps` が
  出現しない。

## T-06: 単一ソース drift-guard と機械テストを追加する

- [x] 新規 test(`src/core/command/__tests__/guide.test.ts`)で以下を固定する:
  - 全 9 topic(`specrunner guide <topic>` = `runGuide`/`findTopic`)が本文を返し、未指定は一覧、
    未知 topic はエラー + 一覧を返す。
  - **全 9 topic すべての body が非空であること**を `GUIDE_TOPICS` を iterate して確認する(TC-002 の
    補完。`findTopic("jobs")` 単体でなく全 topic を網羅する)。これは **must** レベルの歯として実装する。
  - `guide`(引数なし)一覧・未知 topic エラー候補一覧・init snippet の topic 一覧が同一 registry から
    導出されること(いずれも `renderTopicList()` / `GUIDE_TOPICS` の name を `toContain` で照合し、
    手書き列挙が無いことを担保 — PIPELINE_MAP と同型)。
  - `formatEscalation` 出力と `buildCanonEscalationReason` 出力が `specrunner guide escalation` を含む。
  - `USAGE` が `guide` の案内を含む。
  - `runInit` 完了出力(または `buildClaudeMdSnippet()`)が CLAUDE.md snippet を含む。
  - escalation topic body が `--apply-canon` / `--adopt-commits` / `--from` / reopen 制約を含む。
  - `GUIDE_TOPICS` に name === "escalation" が存在する(escalation 導線の dangling 防止)。
  - **`canon-escalation.ts` が `src/core/command/guide` を import しないこと**(leaf 制約)。これは
    **must** レベルの設計不変条件であり、省略不可。
  - `.claude/skills/` 配下の全ファイルに `request review` / `job finish` / `specrunner ps` が無く、
    `.claude/skills/parallel-request-workflow/` が存在しない(または DEPRECATED tombstone)。
  - 全 `GUIDE_TOPICS[*].body` から backtick 内 `specrunner <tokens>` を抽出し、コマンドパストークン
    (先頭小文字語列。`<` `[` `-` `/` `.` で停止)が `resolveCommand(tokens).status === "ok"` になる
    (抽出対象は完全形 backtick 内のみ。shorthand・backtick 外は対象外)。
- [x] TC-003「repo 外でも動作する」は `runGuide()` を直接呼び出す **unit test** として
  `src/core/command/__tests__/guide.test.ts` に配置する(`requiresRepo` 不在のため binary 実行は不要)。
- [x] `typecheck && test` を green にする。

**Acceptance Criteria**:
- 上記すべての test が green。
- guide 本文が参照する specrunner コマンドはすべて `resolveCommand` で解決できる(実在しないコマンド
  案内が無い)。
- `bun run typecheck && bun run test` が green。
