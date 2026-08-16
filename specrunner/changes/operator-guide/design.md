# Design: specrunner guide サブコマンド — 運用知識の CLI 正本化と skill のダイエット

## Context

spec-runner を agent session から運用する知識(状況別コマンド・flag の使い分け、escalation
復帰の分岐、起票・レビューの規律)には repo の正本が無い。`.claude/skills/` の 4 skill が一部を
持つが、skill を厚くしても中身は CLI のコマンド面に強結合しており、CLI と別経路(plugin 等)で
配ると project ごとの CLI 版と必ずずれる。

現状の関連コード:

- **stdout 知識注入の先例**: `request prompt` (`src/core/command/request-prompt.ts`) は純粋な
  builder 関数 `buildRequestPrompt()` を持ち、handler `executePrompt()` が `stdoutWrite` で出す。
  ネットワーク・repo 状態に依存しない。
- **単一ソース + drift-guard の先例**: `src/prompts/pipeline-map.ts` の `PIPELINE_MAP` 定数を各
  prompt が埋め込み、`prompt-skeleton-drift-guard.test.ts` が `toContain(PIPELINE_MAP)` で固定。
- **command registry**: `src/cli/command-registry.ts` の `COMMANDS` ツリーが parser / help /
  dispatch の単一正本。top-level usage は `generateTopLevelUsage()` が `help.group` / `help.summary`
  から生成する。export 済み `resolveCommand(tokens)` がコマンド解決 API。
- **escalation 出力面(2 つ)**:
  - `formatEscalation` (`src/core/finish/escalation.ts`) — finish / archive 系 halt の整形。
    `recommendedAction` は呼び出し側(archive orchestrator 等)から渡る。
  - `buildCanonEscalationReason` (`src/core/step/canon-escalation.ts`) — 保護正典 fixable finding の
    resumePoint.reason 文面(`CANON_FINDING_ESCALATION`)。**leaf module**(import は
    kernel/report-result の型のみ)。
- **init**: `runInit` (`src/cli/init.ts`) は config scaffold と per-repo scaffold を作り、各 artifact の
  created/exists を `logResult` する。CLAUDE.md snippet は現状出さない。
- **skills**: acceptance-and-issue-audit / job-run-monitor / parallel-request-workflow /
  rebase-finish。厚い手順本文を持ち、parallel-request-workflow は廃止済み `request review` 前提で
  陳腐化。

制約: guide は実行時のネットワーク・repo 状態に依存しない(要件 1)。docs / README 再構成、skill
配布機構、i18n / pager、pipeline の step / 遷移 / prompt 変更はスコープ外。

## Goals / Non-Goals

**Goals**:

- `specrunner guide [topic]` を追加し、運用知識を CLI パッケージ内の静的資産として正本化する。
- topic 名・一行説明・本文を**単一の topic registry** に集約し、一覧 / 未知 topic エラー候補 /
  init snippet の topic 一覧がすべて registry から導出されることを test で固定する。
- 発見性の導線を 3 経路で敷く: escalation 出力の一行 / init の CLAUDE.md snippet / `--help` の一行。
- 既存 3 skill を「guide を引け」の薄いトリガーへ縮退し、parallel-request-workflow を削除する。
- guide 本文に載せる specrunner コマンドが現行 CLI に実在することを機械検証する。

**Non-Goals**:

- docs / README の再構成(後段の別 request)。
- skill の配布機構(init による skill 展開 / plugin 化)。
- guide 内容の i18n・pager 対応。
- pipeline の step / 遷移 / prompt の変更。
- `LOOP_ERROR_CODES.hint` 等、要件 3 が名指ししない escalation 文面への導線追加(→ Open Questions)。

## Decisions

### D1: topic registry を単一モジュール `src/core/command/guide.ts` に置き、純粋 builder + 薄い handler にする

registry と導出ロジックを 1 ファイルに集約する。

- `export interface GuideTopic { name: string; summary: string; body: string }`
- `export const GUIDE_TOPICS: readonly GuideTopic[]` — 9 topic(jobs / merge / audit / setup /
  escalation / request / review / inject / inbox)を宣言順で保持。
- 純粋 builder(stdout に触れない):
  - `renderTopicList(): string` — `GUIDE_TOPICS` から `<name> — <summary>` を各行生成。
  - `findTopic(name): GuideTopic | undefined`。
  - `renderUnknownTopicError(name): string` — エラー行 + `renderTopicList()`。
  - `buildClaudeMdSnippet(): string` — CLAUDE.md 貼付用 snippet。topic 一覧一行は
    `GUIDE_TOPICS.map(t => t.name)` から導出(手書きしない)。
- 薄い handler `runGuide(topic: string | undefined): number` — topic 未指定は `renderTopicList()`
  を stdout、既知 topic は body を stdout(exit 0)、未知 topic は `renderUnknownTopicError` を
  stderr(exit 2)。

**Rationale**: `request prompt` と同じ「純粋 builder + 薄い handler」構造にすると、test は stdout を
キャプチャせず builder を直接 assert できる(歯が単純)。1 ファイルに集約すると PIPELINE_MAP と同型の
drift-guard(`toContain(renderTopicList())`)が一意に書け、topic の手書き重複が構造的に不可能になる。

**Alternatives considered**:

- topic ごとに別ファイル(`guide/jobs.ts` 等)+ index で集約 — ファイル数が増え、単一 registry の
  drift-guard が index の手書き列挙に依存してしまう。却下。
- 本文を Markdown 資産ファイルとして同梱し実行時 read — 「実行時 repo 状態に非依存」を満たすには
  bundle 同梱が要り、TS 定数より脆い。却下(要件 1 は「定数/資産として保持」を許すが、定数が最小)。

### D2: `guide [topic]` を command-registry に top-level コマンドとして登録し、`--help` 末尾に一行を出す

- `COMMANDS.guide`: `path: ["guide"]`、`args: [{ name: "topic", required: false }]`、
  `requiresRepo` は付けない(repo 外でも動く。要件 1)。handler は `runGuide(parsed.positional)`。
- `help.group` を新設の `"Guide"` にし、`generateTopLevelUsage()` の `groupOrder` 末尾に `"Guide"` を
  追加する。これで `--help` の末尾に guide 案内一行が出る(要件 3)。

**Rationale**: registry は parser / help / dispatch の単一正本。既存 pattern(`request prompt` 等の
stdout コマンド)に一致。`requiresRepo` を付けないことで repo 非依存を保証する。

**Alternatives considered**: `generateTopLevelUsage()` に literal 行を直接追記 — group 機構を迂回し
一貫性を崩す。却下。

### D3: escalation 導線は固定一行 literal を 2 つの出力面に埋め、topic 存在を registry test で固定する

- 一行 `詳細: \`specrunner guide escalation\`` を **formatEscalation** の出力テンプレートと
  **buildCanonEscalationReason** の reason 文面に加える。
- この一行は registry 導出ではなく固定 literal とする。参照先 topic 名 `escalation` が消えないことは
  「`GUIDE_TOPICS` に name === "escalation" が存在する」test で固定し、dangling 参照を防ぐ。

**Rationale**: `canon-escalation.ts` は leaf module(I/O 非依存)。stdout を持つ `guide.ts` を import
すると leaf 制約を壊す。参照される topic 名は固定文字列 1 個であり、共有定数モジュールを 1 文字列の
ために新設するのは過剰。drift は「escalation topic が registry に在ること」の test で十分に噛む。

**Alternatives considered**:

- `GUIDE_ESCALATION_HINT` を新しい leaf 定数モジュールに置いて両所から import — ファイル 1 個を
  1 文字列のために増やす。却下。
- formatEscalation の `recommendedAction` 引数側(各 archive 呼び出し)に足す — 呼び出し点が多数で
  重複し patchwork になる。テンプレート側 1 箇所に足すのが root-cause(全 finish/archive halt を一括
  カバー)。採用。

### D4: init の CLAUDE.md snippet は `buildClaudeMdSnippet()` を stdout に出す(ファイル書込なし)

`runInit` の末尾で snippet を stdout に出す(`stdoutWrite` / `logResult` は下位の logger 都合で実装が
選ぶ。CLAUDE.md への自動書込はしない)。snippet は「spec-runner 運用時は `specrunner guide <topic>`
を参照」+ topic 一覧一行(registry 導出)。

**Rationale**: 単一 registry からの導出(要件 4/6)。書込なしは要件 4 の明示制約。

**Alternatives considered**: snippet 文字列を init.ts に直書き — topic 一覧の手書き重複を生む。却下。

### D5: skill を薄いトリガーへ縮退し、parallel-request-workflow を削除する

- job-run-monitor → `guide jobs`、rebase-finish → `guide merge`、acceptance-and-issue-audit →
  `guide audit`。各 skill の frontmatter `description`(発火トリガー)は残し、本文は
  「`… guide <topic>` を実行して従う」誘導のみ(本文 10 行以内)に書き換える。厚い手順は残さない。
- parallel-request-workflow は内容を `guide jobs`(並列起動の stagger)へ畳んだ上でディレクトリごと
  削除する。
- skills 配下から廃止済みコマンド文字列(`request review` / `job finish` / `specrunner ps`)を一掃する。
  縮退後の薄い本文にそれらを再導入しない。

**Rationale**: 厚い手順の正本を CLI に移したので、skill は誘導だけで足りる(重複著述の廃止)。この repo
内 skill は `bun ./bin/specrunner.ts guide <topic>` 形で誘導する(repo-local 実行形)。

**Alternatives considered**: skill を全削除 — 発火トリガー(description の自然文)を失い、agent が guide
を引くきっかけが消える。却下(薄いトリガーは残す)。

### D6: 「コマンド実在」の歯は本文から `specrunner <path>` を抽出し `resolveCommand` で解決する

test が全 `GUIDE_TOPICS[*].body` を走査し、backtick 内の `specrunner <tokens>` を抽出、コマンドパス
トークン(先頭の小文字語列。`<` `[` `-` `/` `.` で停止)を `resolveCommand(tokens)` に渡し
`status === "ok"` を確認する。存在しない specrunner コマンドの案内を落とす。

**Rationale**: `resolveCommand` は registry の export 済み解決 API。抽出 + 解決で「案内先が実在」を
機械の歯にできる(AC 8)。外部ツール(`gh` / `claude` 等)は `specrunner ` prefix に一致しないため
対象外(正しく無視される)。flag の実在は、escalation の重要 flag を body 固定 test(AC 6)が別途
噛み、それら flag の実在は request-review が事実確認済み。

## Risks / Trade-offs

- **[Risk] 抽出正規表現の脆さ**: body 内のコマンド表記揺れ(shorthand `resume` 等)を拾えず、
  検証漏れが起きる。→ **Mitigation**: 本文では機械検証したいコマンドを必ず完全形 `specrunner <path>`
  で最低 1 回書く方針を tasks に明記。table 内の flag shorthand は AC 6 の固定 test が別途噛む。
- **[Risk] 固定 literal の escalation 一行が topic rename で dangling 化**: → **Mitigation**: D3 の
  「escalation topic 存在」test で噛む。
- **[Risk] skill 縮退で運用手順が失われる懸念**: → **Mitigation**: 縮退前に (a)〜(c) topic へ内容を
  移設し、移設完了を tasks の順序で担保(先に guide.ts、後で skill 削除)。
- **[Trade-off] 本文を TS 定数に持つと i18n / pager が将来困難**: 現時点スコープ外。
  `ponytail: guide body は単一言語 TS 定数。i18n/pager が要れば資産ファイル + loader へ移行`。

## Open Questions

- 要件 3 は formatEscalation と resumePoint.reason(CANON_FINDING_ESCALATION)を名指しする。
  `LOOP_ERROR_CODES`(SPEC_REVIEW_RETRIES_EXHAUSTED 等)の `hint` にも同じ導線を足すべきか。
  本設計は要件が名指しする 2 面のみを対象とし、それ以外は明示合意が無い限り広げない(スコープ規律)。
  → 実装は 2 面のみに導線を入れる。broadening が必要なら別 request。

<!-- spec-fixer-deferred: TC-019 Priority "should" → "must" への変更 [test-cases.md は spec-fixer のスコープ外(設計は tasks.md T-06 に must レベルとして明示済み)] -->
<!-- spec-fixer-deferred: TC-002 全 9 topic body 非空の iterable 検証追加 [test-cases.md は spec-fixer のスコープ外(tasks.md T-06 に全 9 topic body 非空チェックを must として追記済み)] -->
<!-- spec-fixer-deferred: TC-003 Category "integration" → "unit" への変更 [test-cases.md は spec-fixer のスコープ外(tasks.md T-06 に unit 配置を明記済み)] -->
