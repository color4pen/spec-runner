# ADR: request.md 補助 section の initial message 注入

- **date**: 2026-05-26
- **slug**: request-constraints-initial-injection
- **status**: accepted

## Context

PR #407 (observation-auto-fix) で、design step (Opus) が request.md の「スコープ外」section を読み飛ばし、明示禁止した `approved-with-fixes` verdict を導入した。design agent に session resume で確認した結果:

> 「request.md の scope 外 section を読んでいなかった。自分の Read 対象は既存ソースコードに集中しており、request.md 自体は `<user-request>` タグ内の本文しか参照していない」

現状の message flow:
1. `parseRequestMd` が request.md 全文を `content` field に格納
2. design step の `buildInitialMessage` が `content` を `<user-request>` タグ内に埋め込み
3. agent は `<user-request>` 内を「ユーザーの要求本文」として扱い、補助 section（スコープ外 / 受け入れ基準 / architect 評価済み設計判断）を skip

model 強化では解決しない（LLM uncertainty principle）。CLI 側からの構造的対策が必要。

既存の injection 経路との関係:

| 経路 | 対象 | タイミング | 記録 |
|---|---|---|---|
| `project.md` inline | 全 step | initial message 内 | — |
| `rules.md` identity priming | design | initial system prompt | [2026-05-20-rules-md-injection](./2026-05-20-rules-md-injection.md) |
| `followUpPrompts` follow turn | design (rules 違反自己修正) | post-work turn | [2026-05-22-intra-step-follow-up-prompt](./2026-05-22-intra-step-follow-up-prompt.md) |
| per-step rules N 段 | 全 agent step | post-work turn(s) | [2026-05-24-per-step-rule-followup](./2026-05-24-per-step-rule-followup.md) |

本 ADR は request.md の補助 section を「agent が作業を始める前から context に入れる」新しい injection 経路として確立する。

## Decisions

### D1: followUpPrompts ではなく initial message 注入を採用

補助 section は `buildMessage` 経由の **initial message** に注入する。既存の `followUpPrompts` 機構は使わない。

**Why D1:**
- `followUpPrompts` は main work turn **完了後**の verification pass に位置する。design step では設計が書かれた後に走るため、constraint 違反に気づいても heavy rework が必要になる
- initial message 注入なら agent が最初から constraint を参照して設計できる
- design step には既に delta spec self-fix 用の followUp があり、さらに constraint check を追加すると 3 turn (main + self-fix + constraint check) になりコスト増大する
- followUp は Opus の追加 turn (token cost) が発生する

**不採用案:**
- `followUpPrompts` 機構（❌ post-work timing が不適切、追加 turn のコスト）
- `additionalInstructions` 経由の adapter 層注入（❌ adapter にビジネスロジックが混入）
- `AgentRunContext` への新 field 追加（❌ port interface 変更は全 adapter に影響）

### D2: `<user-request>` タグ外に分離して注入

補助 section は `<user-request>` タグ**外**に、CLI が抽出・ラベリングした独立セクションとして挿入する。配置順: `</user-request>` → 補助 section block → `## Repository Context` / `## Branch Context`。

**Why:**
- 現状すでに `<user-request>` 内に全文が含まれているが、agent はタグ内を「ユーザーデータ」として扱い補助 section を skip している
- タグ外に分離することで「CLI が提供した構造化 context」として agent の attention が向きやすくなる
- sections の二重出現（タグ内 raw + タグ外 extracted）は意図的な redundancy

### D3: step-level 注入（executor / adapter / port 無変更）

各 step の `buildMessage` 関数チェーン（`buildInitialMessage` / `buildCodeReviewInitialMessage`）内で section 抽出 → 注入する。

**Why:**
- `buildMessage` はすでに `requestContent`（= request.md 全文）にアクセス可能
- executor, adapter, AgentRunContext, StepDeps に変更不要 → regression リスク最小
- 各 step が注入 section のラベリング・フレーミングを個別にカスタマイズ可能

### D4: 汎用 section 抽出ユーティリティ `src/parser/extract-section.ts`

純粋関数 `extractMarkdownSections(content: string, headings: string[]): Map<string, string>` を新設。`##`-level heading を境界として section 本文を抽出する。`###` 以深は section 境界として扱わない（= セクション本文に含める）。

ラッパ関数 `buildRequestConstraintsBlock(requestContent: string): string | undefined` が 3 対象 section を抽出・フォーマットし、未発見の場合は `undefined` を返す（= initial message に追記なし）。

**Why:**
- design / code-review で共通の抽出ロジックが必要
- parser layer に配置することで request.md のテキスト処理と位置が一致
- 将来他の step が同機能を必要とした場合に再利用可能

### D5: 対象 heading は 3 固定（コード定数）

抽出対象:
- `## スコープ外`
- `## 受け入れ基準`
- `## architect 評価済みの設計判断`

これらは `specrunner request create` が生成する標準 heading であり、一貫性が保証される。カスタム heading は対象外。該当 heading が存在しない場合は gracefully skip（注入なし）。

## Alternatives Considered

### Alternative 1: 既存 `followUpPrompts` 機構を利用する

design step の post-work follow turn として補助 section を注入する案。

- **Pros**: 既存の fixer step と同じ仕組みを使い回せる。新コードが最小
- **Cons**: `followUpPrompts` は main work turn **完了後**の verification pass に位置する。設計がすでに書かれた後に constraint を提示するため、違反があれば heavy rework が必要になる。design step には既に delta spec self-fix 用の followUp があり、constraint check を追加すると 3 turn (main + self-fix + constraint check) になりコスト増大する
- **Why not**: 制約は「作業前に知っていなければ意味がない」ため pre-work の initial message 注入が適切。post-work では遅い

### Alternative 2: `additionalInstructions` 経由で adapter 層に注入する

`AgentRunContext.additionalInstructions` フィールドを経由して adapter 側で補助 section を message に付加する案。

- **Pros**: step 固有のロジックを共通経路に統一できる
- **Cons**: request.md のどの section を注入するか（= ビジネスロジック）を adapter が知る必要が生じる。adapter は runtime の薄い境界であり、ビジネスロジックが混入すると leaky abstraction になる
- **Why not**: adapter にビジネスロジックを持ち込まない原則に反する。step-level の `buildMessage` 内で閉じるべき処理

### Alternative 3: `AgentRunContext` に新 field を追加する

`AgentRunContext` に `requestConstraints?: string` などの専用 field を追加し、executor が転記する案。

- **Pros**: 型で意図が明示される。executor から各 step への受け渡しが統一される
- **Cons**: `AgentRunContext` はコアポートインターフェースであり、変更は全 adapter の実装義務になる。design / code-review にのみ必要な関心ごとのために port 全体を変更するのは影響範囲が不釣り合い
- **Why not**: `buildMessage` はすでに `requestContent` にアクセス可能であり、port 変更なしで step-level に閉じて実装できる。interface を広げる理由がない

## Consequences

- design / code-review step の initial message に request.md 補助 section が確実に含まれるようになる（agent の Read 動作に依存しない）
- `<user-request>` タグ内と外で同じ content が二重に現れる（意図的な redundancy）。token 増は ~200-500 tokens であり Opus 1M context window 対比で無視可能
- injection 経路の分類が確定する:
  - **initial inline**: `project.md`（全 step）, request.md 補助 section（design / code-review）
  - **post-work follow-up**: delta spec self-fix, per-step rules
- `extractMarkdownSections` / `buildRequestConstraintsBlock` が request.md のテキスト処理パターンとして canonical になる
- heading 名のバリエーション（例: `## 対象外` vs `## スコープ外`）は対応しない。`specrunner request create` が生成する標準 heading のみが injection 対象

## 関連 ADR

- [2026-05-22-intra-step-follow-up-prompt](./2026-05-22-intra-step-follow-up-prompt.md) — followUpPrompts 機構の確立。本 ADR はその機構を意図的に使わず initial message 注入を選択。
- [2026-05-24-per-step-rule-followup](./2026-05-24-per-step-rule-followup.md) — post-work の N 段 follow-up。本 ADR の initial injection とは injection タイミングで補完関係にある。
- [2026-05-20-rules-md-injection](./2026-05-20-rules-md-injection.md) — rules.md の identity priming。LLM uncertainty への別の対策として先行している。
