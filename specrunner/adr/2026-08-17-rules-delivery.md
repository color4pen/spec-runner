# ADR: rules の配送方式に `delivery: prompt` を追加する

- **date**: 2026-08-17
- **slug**: rules-delivery
- **status**: accepted
- **refines**: [2026-05-24-per-step-rule-followup](./2026-05-24-per-step-rule-followup.md) (D1 / D2 / D3)

## Context

ADR `2026-05-24-per-step-rule-followup` は `specrunner/rules/<step>/` の project rules を
follow-up prompt として注入する機構を確立した（D2: N 段 follow-up）。その D1 は
「ファイルの中身は完全自由文。frontmatter なし。CLI は中身を解釈・検証しない」と定めており、
follow-up が唯一の配送経路だった。

この設計には構造的な欠陥がある: follow-up は本質的に**事後**機構であり、main work turn が
timeout / abort で死んだ attempt には発火しない。また、「禁止コマンド・触ってはいけない
ファイル・ツールの使い方」のような**行動制約型**ルールは、main work turn の最中に agent へ
一文字も届かない。

実測（issue #1004）: `rules/implementer/02-test-command.md` が `bun test` を hang 警告付きで
禁止していたにもかかわらず、implementer は作業中に `bun test` を実行して session を hang させ、
4 attempt の transcript にルール文言は 0 件だった。

制約は、行動の**前**に届かなければ行動を制約できない。この failure mode に対応するため、
rule ファイルが frontmatter で配送方式を宣言できる仕組みを追加し、main work prompt への
前置注入（`delivery: prompt`）を新設する。

## Decisions

### D1 (refine): frontmatter `delivery` の導入

旧 ADR D1「ファイルの中身は完全自由文。frontmatter なし。CLI は中身を解釈・検証しない」を
以下のように改訂する:

rule ファイル先頭の YAML frontmatter（`---` で挟まれたブロック）で単一スカラ
`delivery: followup | prompt` を宣言できる。

- frontmatter が無いファイルは全体を本文として扱う（現行と同一）。
- `delivery` 未指定 → `followup` とみなす（完全後方互換）。
- frontmatter は**agent へ渡す rule 本文から除去する**（followup / prompt どちらの経路でも除去）。
- CLI が解釈するのは frontmatter の `delivery` キーのみ。**rule の本文は依然として解釈・検証しない**。
- `delivery` が `followup` / `prompt` 以外の値のとき、silent fallback せず step 実行前に
  設定エラーで fail する（詳細は D6）。

**実装**: `src/core/step/rules-delivery.ts` — `splitFrontmatter` + `splitRulesByDelivery`

**原則の維持**: 「CLI は rule の**内容**を解釈しない」はそのまま維持する。delivery は rule の
内容ではなく配送 metadata であり、解釈対象は frontmatter のみ。

### D2 (refine): prompt 配送軸の追加（旧 ADR D2 の拡張）

旧 ADR D2「ファイル数で bounded な N 段 follow-up」に**prompt 配送**という軸を追加する。
followup 配送の既存挙動（wrap 文言・N 段・port 契約 `postWorkPrompts`）は不変。

- `delivery` 未指定 / `delivery: followup` → 既存の follow-up 経路のみ（後方互換）。
- `delivery: prompt` → main work prompt への前置注入のみ（follow-up への重複配送なし）。
- 1 ルールを両方式へ同時配送する機構は採用しない（YAGNI: 事前制約と事後検証を 1 ルールで
  兼ねる需要が観測されてから広げる）。

**配送分類の実装**: `buildStepContext`（`src/core/step/step-context-builder.ts`）が
`resolveStepRules` の出力を `splitRulesByDelivery` に通す。followup バケットは既存の
`buildRulesFollowUpPrompts` → `policy.postWorkPrompts` へ（現行経路不変）、prompt バケットは
D5 の framing を適用して `policy.promptRules` へ（D3 の新フィールド）。

### D3 (新設): port 契約に `promptRules` を追加

`AgentRunPolicy`（`src/core/port/agent-runner.ts`）に `promptRules?: string` を追加する。

- `delivery: prompt` のルール群を D5 の framing で 1 ブロックに整形した provider 中立の文字列。
- ルールが 0 件のとき `undefined`。
- `postWorkPrompts`（followup 配送）とは**別フィールド**で、prompt 配送は `postWorkPrompts` に
  混ざらない（重複配送なし）。
- adapter は `promptRules` が存在すれば main work prompt に注入する（D4）。
- 型を `string`（`string[]` でなく）にした理由: prompt 配送は main turn 内の単一位置への
  1 ブロック挿入であり、各要素が独立 turn となる `postWorkPrompts: string[]` とは配送単位が異なる。

### D4: 注入位置は「completion directive の直前」（adapter 責務）

`promptRules` を、base task・artifacts・touched-files・resume context の**後**、
report_result completion directive の**前**に挿入する。

各 adapter の具体的な挿入位置:

| Adapter | 挿入位置 |
|---------|---------|
| claude-code | `baseFullPrompt` と `firstTurnCompletionDirective` の間 |
| codex | `baseFullPrompt` と `buildMainTurnCompletionInstruction()` の間 |
| managed | resume-context の後、`buildManagedGitPushInstruction()` の前 |

位置決め（completion directive の直前）は adapter 責務。framing・分類は core（`rules-delivery.ts`）
が担い、3 adapter 分の重複を排除する。`promptRules` が `undefined` のとき adapter は prompt を
変更しない。

**Rationale**: 作業開始時に見えて recency も高い（巨大な artifact context の後ろ）。completion
directive（ターン終了制御）の直前に置くことで「作業 → 規約遵守 → 報告」の自然な読み順になる。

### D5 (新設): prompt 配送の framing（followup wrap を流用しない）

旧 ADR D3 の「3 要素 wrap（修正範囲 / stop 条件 / 意図解釈）」は**事後検査 pass** 用であり、
main 作業への常時制約には意味が反転する（「違反が無ければ何も変更するな」は作業を止める指示になる）。

prompt 配送用に以下の最小 framing を新設する:

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

- 修正範囲 / stop 条件 / 意図解釈の事後検証用文言は**含めない**。
- 複数の `delivery: prompt` ルールは同一 turn の同一位置に入るため、`<rule>` ブロックを
  昇順（`resolveStepRules` の順序）で連結し、preamble は 1 回だけ付す。
- 入力が空配列のとき `undefined` を返す。

**実装**: `buildRulesPromptSection(bodies: string[]): string | undefined`（`src/core/step/rules-delivery.ts`）

### D6: 未知 delivery は step 実行前に fail（silent fallback 禁止）

`delivery` が `followup` / `prompt` 以外の値のとき、`splitRulesByDelivery` が例外を投げる。
`buildStepContext` は catch せず伝播させ、StepExecutor が error lifecycle として halt する。
agent は起動しない。

例外メッセージには不正値・許容値（followup / prompt）・本文冒頭行（locator）を含める。

**Rationale**: silent fallback（未知値を followup 扱い等）は、typo した行動制約ルールが
「配送されているつもりで届かない」事故を再発させる。まさに本 change が潰す failure mode。

### D7: `resolveStepRules` の signature を凍結する

`resolveStepRules`（`src/core/step/rules-resolve.ts`）の signature
（`(step, cwd, fs) => Promise<string[]>` = 生ファイル内容）は**変更しない**。

- 既存テスト（`tests/core/step/rules-resolve.test.ts`）・既存の `string[]` を受け取る関数
  （`buildRulesFollowUpPrompts`）が無改変で green を保つ。
- 配送分類という新しい関心事を `splitRulesByDelivery` 単独の pure 関数に閉じ込める。
- filename の非露出: `resolveStepRules` が filename を捨てるため、D6 のエラーは filename を
  名指しできない。本文冒頭行を locator として緩和する（filename 露出は `resolveStepRules` 契約
  拡張を要し、既存テスト無改変制約とトレードオフになるため本 change では取らない）。

## Alternatives Considered

### Alternative A: CLI が rule 内容から配送位置を推測する

rule 本文のキーワードや構造から delivery を自動判断する案。

- **Why not**: agent / CLI の判断場面を増やすだけで、作者宣言の方が決定的。自動推測の
  誤判定で「配送されているつもりで届かない」事故が再発する。

### Alternative B: 命名規約で宣言する（例: `NN-name.prompt.md`）

ファイル名の suffix で delivery を宣言する案。

- **Why not**: `NN-` prefix（昇順ソート）と delivery 意味が命名規約に密結合し、衝突する。
  frontmatter は既存 `src/core/reviewers/definition.ts` で確立済みのパターンで追随が自然。

### Alternative C: 全ルールを main prompt に前置注入する

followup 配送を廃止して全ルールを prompt 前置注入に統一する案。

- **Why not**: followup 型の「独立した事後検査 pass」という機能が消える。2 方式は役割が
  別物（事後検査 pass vs 常時制約）であり、設計として必要な分離。

### Alternative D: 1 ルールを両方式へ同時配送する

同一ルールを prompt と followup の両方に配送する案。

- **Why not**: token 重複コストに見合う例が観測されていない（YAGNI）。必要になってから広げる。

### Alternative E: `resolveStepRules` を `{delivery, body}[]` に改修する

既存 `string[]` 契約を破る案。

- **Why not**: 生内容 `string[]` を assert する既存テストが壊れ、受け入れ基準「既存 rules
  テストは無改変で green」に反する。

### Alternative F: `promptRules` を `string[]`（配列）にする

`AgentRunPolicy.promptRules?: string[]` とし、adapter が join する案。

- **Pros**: `postWorkPrompts: string[]` と型が揃う。
- **Why not**: 各要素を adapter が join する必要があり、framing preamble を core と adapter の
  どちらが持つか曖昧になる。main turn の単一位置への 1 ブロック挿入に配列は過剰。`string` 単一値
  で adapter 側の挿入ロジックが「あれば 1 個挿す」だけに簡略化できる。

### Alternative G: framing・分類を adapter-local に閉じる

各 adapter が自身で `splitRulesByDelivery` と framing を行う案。

- **Pros**: adapter が完全に自律し、port 契約に `promptRules` を追加しなくて済む。
- **Why not**: framing と分類ロジックが 3 adapter で重複する。provider 中立性が崩れ、
  framing 文言を変更するたびに 3 箇所を同期する必要が生じる。

### Alternative H: `splitFrontmatter` を共有 util に抽出して再利用する

`src/core/reviewers/definition.ts` の `splitFrontmatter` を共有 util 化し、本 change でも
使う案。

- **Pros**: 同一 frontmatter 規約の実装が 1 本化される。
- **Why not**: `reviewers/definition.ts` を本 change のスコープ外で触ることになり blast radius
  が広がる。必要な frontmatter は `delivery` の単一スカラ 1 個であり共有化の利得が薄い。
  frontmatter 利用箇所が増えたら共有 util 化を検討する。

### Alternative I: `promptRules` を文字列先頭（最前）に置く

base task の前に prompt 配送ルールを挿入する案。

- **Why not**: 巨大な artifact context の前に置くと Lost-in-the-Middle で埋もれる。
  request が明示的に却下している。

### Alternative J: `promptRules` を completion directive の後（末尾）に置く

最末尾は recency が最も高い位置だが、completion directive の後に置く案。

- **Pros**: recency が最も高く、agent が最後に目にする内容になる。
- **Why not**: completion directive（「end 前に report_result を呼べ」）と規約が逆順になり、
  規約が「報告の後」に読まれる誤解を生む。directive の直前に統一することで「作業 → 規約遵守
  → 報告」の自然な読み順を確保する。

### Alternative K: framing 無しで rule 本文を直挿しする

`<project-rules>` ブロックを使わず、rule 本文をそのまま prompt に埋め込む案。

- **Why not**: 「これは遵守すべき規約である」という枠が無いと、agent が単なる参考情報として
  読み飛ばす恐れがある。最小の framing 枠は残す。

## Consequences

- `delivery: prompt` のルールが main work turn 中に届くため、行動制約型ルールが機能する。
- main turn が timeout / abort で死んだ attempt でも、prompt は既に届いているため制約が維持される。
- followup 配送の既存挙動（wrap 文言・N 段・`postWorkPrompts`）は完全に不変。
- `delivery` 未指定の既存 rule ファイルは一切変更なしで現行と同一挙動を保つ（後方互換）。
- 未知 delivery 値は step 実行前に halt するため、typo による無言の配送失敗が防止される。
- prompt 配送は毎 turn 同一 token を注入する（行動制約は main turn に届かなければ無意味なので、
  これは機能の本質的コスト）。
- `RULES_MD_CONTENT` / project.md 注入経路は本 ADR の範囲外として変更しない（旧 ADR D6 踏襲）。

## 関連 ADR

- [2026-05-24-per-step-rule-followup](./2026-05-24-per-step-rule-followup.md) — 本 ADR が refine する。D1（frontmatter なし）/ D2（N 段 follow-up 単一経路）/ D3（wrap 3 要素）を改訂。followup 配送の既存挙動は不変。
- [2026-05-22-intra-step-follow-up-prompt](./2026-05-22-intra-step-follow-up-prompt.md) — 2 段 follow-up の元祖。`2026-05-24` が N 段に一般化し、本 ADR が prompt 配送軸を追加。
- [2026-05-20-rules-md-injection](./2026-05-20-rules-md-injection.md) — spec-runner 同梱規律の identity priming 方式。本 ADR が扱う project rules とは別の注入経路。
