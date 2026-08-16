# Design: rules の配送方式に `delivery: prompt` を追加する

## Context

`specrunner/rules/<step>/*.md` の project rules は **follow-up prompt 専用**の配送経路しか持たない。

- `resolveStepRules`（`src/core/step/rules-resolve.ts`）が step ディレクトリの `.md` を昇順列挙し、ファイル内容の `string[]` を返す。frontmatter の概念は無い。
- `buildRulesFollowUpPrompts`（`src/core/step/rules-followup-prompts.ts`）が各内容を wrap 文言（「直前の作業結果を確認してください」+ 修正範囲 / stop 条件 / 意図解釈の 3 要素）でラップする。これは**事後検証**の枠組みである。
- `buildStepContext`（`src/core/step/step-context-builder.ts:85-96`）が `resolveStepRules` → `buildRulesFollowUpPrompts` → `allFollowUpPrompts` と繋ぎ、`policy.postWorkPrompts` に載せる。配送経路はこの 1 本のみ。
- 各 adapter は `policy.postWorkPrompts` を **main work turn 後**に `resume: sessionId` で順次投げる（`claude-code/agent-runner.ts:1030-`、`managed-agent/agent-runner.ts:525-`、`codex/agent-runner.ts:639-`）。

このため「禁止コマンド・触ってはいけないファイル・ツールの使い方」のような**行動制約型**ルールは、main work turn 中に agent へ一文字も届かない。さらに main turn が timeout / abort で死んだ attempt では follow-up 自体が発火せず、ルールは一度も配送されない（issue #1004 実測: `rules/implementer/02-test-command.md` の `bun test` 禁止が 4 attempt の transcript に 0 件）。

制約は、行動の**前**に届かなければ行動を制約できない。follow-up は本質的に事後であり、この用途には構造的に合わない。

## Goals / Non-Goals

**Goals**:

- rule ファイルごとに frontmatter で配送方式（`delivery: followup | prompt`）を宣言できる。
- `delivery: prompt` のルールを main work prompt の末尾付近（resume context の後・completion directive の前）に前置注入し、作業中の行動を制約する。
- 配送を port 契約（`AgentRunContext`）経由の provider 中立にし、注入位置だけを各 adapter の責務にする。
- 未指定・`followup` の既存挙動を完全後方互換で維持する（既存 rule ファイル無改変・既存 delivery 系テスト無改変で green）。
- 未知の `delivery` 値を silent fallback させず、step 実行前に設定エラーで fail させる。

**Non-Goals**（request のスコープ外を踏襲）:

- agent step 完了契機の変更（report 受領 settle、issue #1003）。
- `bun test` の repo レベル封鎖（bunfig.toml）。
- 1 ルールを両方式へ同時配送する機構（YAGNI）。
- CLI が rule 内容から配送位置を推測する機構（作者宣言のみ）。
- `RULES_MD_CONTENT` / project.md 注入経路の変更。
- follow-up 配送の wrap 文言・N 段機構の変更。

## Decisions

### D1: frontmatter `delivery` の導入（旧 ADR D1 の refine）

rule ファイル先頭の YAML frontmatter（`---` で挟まれたブロック）で単一スカラ `delivery: followup | prompt` を宣言できる。

- frontmatter が無いファイルは全体を本文として扱う（現行と同一）。
- `delivery` 未指定 → `followup` とみなす。
- frontmatter は **agent へ渡す rule 本文から除去する**（followup / prompt どちらの経路でも除去）。
- CLI が解釈するのは frontmatter の `delivery` キーのみ。**rule の本文は依然として解釈・検証しない**。

**Rationale**: 旧 ADR `2026-05-24-per-step-rule-followup` D1「frontmatter なし。CLI は中身を解釈・検証しない」に例外を設ける。ただし delivery は rule の**内容**ではなく**配送 metadata**であり、「CLI は内容を解釈しない」という原則そのものは維持される。宣言は決定的で、agent / CLI の判断場面を増やさない。

**Alternatives considered**:

- *CLI が rule 内容から配送位置を推測*: agent / CLI の判断場面を増やすだけで、宣言の方が決定的。却下。
- *frontmatter を使わず命名規約で宣言*（例: `NN-name.prompt.md`）: ソート・命名規約に配送意味を密結合させ、既存 `NN-` prefix 契約（順序）と衝突する。frontmatter は既存 reviewers 定義（`src/core/reviewers/definition.ts`）で確立済みのパターンで、追随が自然。却下。

### D2: 配送分類は `resolveStepRules` の上に載せる新 pure 関数で行う

`resolveStepRules` の signature（`(step, cwd, fs) => Promise<string[]>` = 生ファイル内容）は**変更しない**。新たに core の pure module（frontmatter 分割 + delivery 分類 + 本文抽出）を追加し、`buildStepContext` が `resolveStepRules` の出力をこの関数に通す。

- 出力: `{ followup: string[]; prompt: string[] }`（いずれも frontmatter 除去済み本文）。
- `followup` バケット → 既存の `buildRulesFollowUpPrompts` に渡す（現行経路そのまま）。
- `prompt` バケット → D5 の framing を適用し `policy.promptRules` に載せる。

**Rationale**: `resolveStepRules` を触らないことで、生内容 `string[]` を assert する既存テスト（`tests/core/step/rules-resolve.test.ts`）と、`buildRulesFollowUpPrompts(string[])` を使う既存テスト（`rules-followup-prompts.test.ts` / `post-work-prompt-invariant.test.ts`）が**無改変で green**を保つ。frontmatter を持たない fixture では「生内容 === 本文」となり分類前後で不変。配送分類という新しい関心事を単一の pure 関数に閉じ込め、既存 I/O 境界（fs inject）を汚さない。

**Alternatives considered**:

- *`resolveStepRules` を `{delivery, body}[]` を返すよう改修*: 生内容 `string[]` を assert する既存テストが壊れ、受け入れ基準「既存 rules テストは無改変で green」に反する。却下。
- *reviewers の `splitFrontmatter` を共有 util に抽出して再利用*: 重複削減にはなるが `src/core/reviewers/definition.ts` を本 change のスコープ外で触り、その test の blast radius を広げる。必要とする frontmatter は単一スカラ 1 個で抽出の利得が薄い。新 module 内に最小の frontmatter 分割を閉じる（reviewers と同じ「先頭 `---` / 閉じ `---`」規約を踏襲）。frontmatter 利用箇所が増えたら共有 util 化を検討。

### D3: port 契約に `promptRules` を追加（旧 ADR D2 の refine）

`AgentRunPolicy`（`src/core/port/agent-runner.ts`）に **`promptRules?: string`** を追加する。`delivery: prompt` のルール群を D5 の framing で 1 ブロックに整形した provider 中立の文字列。ルールが 0 件のとき `undefined`。

- `postWorkPrompts`（followup 配送）とは**別フィールド**で、prompt 配送は `postWorkPrompts` に混ざらない（follow-up への重複配送なし）。
- adapter は `promptRules` が存在すれば main work prompt に注入する（D4）。

**Rationale**: request「配送は port 契約経由で provider 中立に行い、各 adapter が自身の completion directive の直前に配置する」。整形（framing）は provider 中立なので core に置き、**位置決めだけ**を adapter 責務にする。型を `string`（`string[]` でなく）にしたのは、prompt 配送が main turn 内の**単一位置**への 1 ブロック挿入であり、follow-up の `postWorkPrompts: string[]`（各要素が独立 turn）とは配送単位が異なるため。adapter 側の挿入ロジックが「あれば 1 個挿す」だけで済み、3 adapter 分の重複を最小化できる。

**Alternatives considered**:

- *`promptRules?: string[]`（配列）*: 各要素を adapter が join する必要があり、framing preamble を core / adapter どちらが持つか曖昧になる。単一 turn の単一位置に対して配列は過剰。却下。
- *adapter-local の文字列連結に閉じる*: completion directive の位置が adapter ごとに異なるため配置は adapter 責務で正しいが、framing・分類まで adapter に置くと 3 adapter で重複し provider 中立性が崩れる。却下。

### D4: 注入位置は各 adapter が「自身の completion directive の直前」に置く

`promptRules` を、base task・artifacts・touched-files・resume context の**後**、report_result completion directive の**前**に挿入する。

- **claude-code**（`agent-runner.ts:533-554`）: `baseFullPrompt`（= baseMessage + artifact + touchedFiles + resume + additionalInstructions）と `firstTurnCompletionDirective` の間に挿入。
- **codex**（`agent-runner.ts:355-367`）: `baseFullPrompt` と `buildMainTurnCompletionInstruction()` の間に挿入。
- **managed**（`agent-runner.ts:621-631`）: resume-context の後、`buildManagedGitPushInstruction()`（末尾の実行指示）の前に挿入。

**Rationale**: 作業開始時に見えて、かつ巨大な artifact context の後ろに置くことで recency も高い。completion directive（「end 前に report_result を呼べ」）はターン制御の指示であり、その直前に規約を置くことで「作業 → 規約遵守 → 報告」の自然な読み順になる。directive の実体が adapter ごとに違うため、位置決めは adapter 責務（request の設計判断どおり）。

**Alternatives considered**:

- *文字列先頭（最前）に置く*: 巨大な artifact context の前だと Lost-in-the-Middle で埋もれる。request が明示的に却下。
- *completion directive の後*: 最末尾は recency が最も高いが、completion directive（ターン終了制御）と規約が逆順になり、規約が「報告の後」に読まれる誤解を生む。directive の直前に統一。

### D5: prompt 配送の framing（旧 ADR D3 の refine — followup wrap を流用しない）

prompt 配送には follow-up の 3 要素 wrap（修正範囲 / stop 条件 / 意図解釈）を**流用しない**。3 要素は「違反が無ければ何も変更せず end_turn する」事後検査用であり、作業中の常時制約には意味が反転する。

prompt 配送用に以下の最小 framing を新設する（文言を本 design で確定し、ADR に記録する）:

```
<project-rules>
以下はこの step の作業全体で遵守すべき project 規約です。
作業を開始する前に読み、作業中ずっとこの制約に従ってください。

<rule>
{frontmatter 除去済み本文}
</rule>
（prompt 配送ルールが複数ある場合は <rule> ブロックを昇順で連結）
</project-rules>
```

- 「修正範囲 / stop 条件」のような事後検証用の指示は**含めない**。prompt 配送は独立した検査 pass ではなく、main 作業への常時制約だからである。
- 複数の `delivery: prompt` ルールは同一 turn の同一位置に入るため、`<rule>` ブロックを昇順（`resolveStepRules` の順序）で連結し、preamble は 1 回だけ付す。

**Rationale**: 2 方式は役割が別物（事後検査 pass vs 常時制約）。framing を分けることで、それぞれの意図が prompt 上で明確になる。

**Alternatives considered**:

- *followup の 3 要素 wrap を流用*: 「違反が無ければ何も変更するな」は main 作業を止める指示になり、行動制約として機能しない。却下。
- *framing 無しで本文を直挿し*: 「これは遵守すべき規約である」という枠が無いと、agent が単なる参考情報として読み飛ばす恐れ。最小の枠は残す。

### D6: 未知 delivery は step 実行前に fail（silent fallback 禁止）

`delivery` が `followup` / `prompt` 以外の値のとき、`buildStepContext` が構築段階で例外を投げる。`buildStepContext` は adapter の `run()` より前に呼ばれるため、agent は起動せず step 実行前に fail する（StepExecutor が error lifecycle として halt する）。

- 例外は分類 pure 関数が投げ、`buildStepContext` はそのまま伝播させる。
- メッセージは不正値・許容値・本文冒頭行（locator）を含める。

**Rationale**: silent fallback（未知値を followup 扱い等）は、typo した行動制約ルールが「配送されているつもりで届かない」事故を再発させる。まさに本 change が潰す failure mode なので、明示 fail が唯一整合する。

**Note（filename の非露出という制約）**: `resolveStepRules` が filename を捨てるため（D2 で signature を凍結）、エラーは filename を名指しできない。本文冒頭行を locator として添えて緩和する。filename 露出には `resolveStepRules` 契約の拡張が必要で、既存テスト無改変の制約とトレードオフになるため本 change では取らない。

### D7: ADR refine（旧 ADR D1 / D2 / D3 の改訂）は adr-gen に委ねる

本 change は ADR `2026-05-24-per-step-rule-followup` の D1（frontmatter なし・CLI 非解釈）/ D2（follow-up 単一経路）/ D3（wrap 3 要素）を refine する（supersede ではない。followup 配送の既存挙動は不変）。改訂内容（D1: delivery frontmatter の例外、D2: prompt 配送軸の追加、D3: prompt 配送 framing の新設）と framing 確定文言は本 design に記録済みであり、ADR ファイルの生成は adr-gen step が担う。

**Rationale**: この project では ADR の path / ファイル名は adr-gen 以外の step で記載しない規律がある。design は判断と文言を記録し、生成は adr-gen に委ねる。

### D8: 移行第 1 号と `rules new` の追随

- `specrunner/rules/implementer/02-test-command.md` に `delivery: prompt` frontmatter を宣言する（本文は現行維持、他 rule ファイルは無改変）。行動制約型（`bun test` 禁止）の実例であり、prompt 配送の最初の受益者。
- `rules new` の scaffold テンプレート（`src/core/command/rules-new.ts` の `RULE_TEMPLATE`）と usage テキスト（`src/cli/command-registry.ts` の `RULES_USAGE`）に delivery 宣言の説明を追加する。テンプレート既定は `delivery: followup`（明示するが現行動作と同一）。

## Risks / Trade-offs

- **[Risk] frontmatter 誤記が全 rule を無言で壊す** → D6 の明示 fail で吸収。未知値・不正 frontmatter は step 実行前に halt する。
- **[Risk] filename を名指しできないエラー**（D6 Note）→ 本文冒頭行を locator に添える。step ディレクトリ内の少数ファイルなので特定は容易。
- **[Risk] adapter が `promptRules` を honor し忘れると prompt 配送が無言で消える** → agent step を走らせる 3 adapter（claude-code / codex / managed）すべてに注入を実装し、claude-code は位置固定テストで pin する。port フィールドは optional なので未対応 adapter は degrade（旧挙動）に倒れるが、対象 adapter は全て対応する。
- **[Trade-off] prompt 配送は毎 turn 同一 token を注入する**（follow-up と違い main turn に常駐）→ 行動制約は main turn に届かねば無意味なので、この token コストは機能の本質的コスト。同時配送を採らない（YAGNI）ことで二重コストは回避する。

## Open Questions

- なし（設計判断は architect 評価済み・request で確定済み）。

## Migration Plan

1. port `promptRules` は optional 追加のため、既存 `AgentRunContext` 構築サイトは無改変で通る（後方互換）。
2. `delivery` 未指定の既存 rule ファイル（`02-test-command.md` 以外）は挙動不変。
3. `02-test-command.md` の frontmatter 追加は、prompt 配送が有効化された時点で follow-up からは外れ main prompt に載る。rollback は frontmatter 行の削除のみ（followup 既定に戻る）。
