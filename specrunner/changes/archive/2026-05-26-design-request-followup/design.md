# Design: design-request-followup

## Context

PR #407 で design step (Opus) が request.md の「スコープ外」section を読み飛ばし、明示禁止した `approved-with-fixes` verdict を導入した。原因は agent が `<user-request>` タグ内の本文のみに注目し、補助 section（スコープ外 / 受け入れ基準 / architect 評価済みの設計判断）を参照しなかったこと。

現状の message flow:
1. `parseRequestMd` が request.md 全文を `content` field に格納
2. design step の `buildInitialMessage` が `content` を `<user-request>` タグ内に埋め込み
3. agent は `<user-request>` 内の要件本文のみに注目し、補助 section を skip

model 強化では解決しない (LLM uncertainty)。CLI 側からの構造的対策が必要。

## Goals / Non-Goals

**Goals:**
- design / code-review step の agent context に request.md の補助 section が確実に含まれる
- agent の Read 動作に依存しない注入 (CLI が保証)
- 既存 step に regression なし

**Non-Goals:**
- rules ファイルでの対応（LLM uncertainty が残る）
- spec-review step への適用（本 request は design + code-review の 2 step のみ）
- request.md format の変更
- CLI 内部の scope-out-validator（機械的文言突合せ）

## Decisions

### D1: Initial message injection（followUp ではない）

補助 section を `buildMessage` 経由の initial message に注入する。followUpPrompts 機構は使わない。

**Why D1, not followUp:**
- followUp は main work turn **完了後**の verification pass。design step では設計がすでに書かれた後に走るため、heavy rework が必要になる
- initial message 注入なら agent が最初から constraint を参照できる
- followUp は Opus の追加 turn (token cost) が発生する
- design step にはすでに delta spec self-fix 用の followUp があり、さらに追加すると 3 turn (main + self-fix + constraint check) になりコスト増大

**Alternatives considered:**
- followUpPrompts 機構を利用（❌ post-work timing が不適切、追加 turn のコスト）
- `additionalInstructions` 経由で adapter 層注入（❌ adapter にビジネスロジックが混入）
- AgentRunContext に新 field 追加（❌ port interface 変更は影響範囲が広い）

### D2: `<user-request>` タグ外に分離して注入

補助 section は `<user-request>` タグ**外**に、CLI が抽出・ラベリングした独立セクションとして挿入する。

**Why:**
- 現状すでに `<user-request>` 内に全文が含まれているが、agent はタグ内を「ユーザーの要求本文」として扱い補助 section を skip している
- タグ外に分離することで「CLI が提供した構造化 context」として agent の attention が向きやすくなる
- sections の二重出現（タグ内 raw + タグ外 extracted）は意図的な redundancy

### D3: Step-level 注入（executor / adapter 無変更）

各 step の `buildMessage` 関数チェーン（`buildInitialMessage` / `buildCodeReviewInitialMessage`）内で section 抽出 → 注入する。

**Why:**
- `buildMessage` はすでに `requestContent`（= request.md 全文）にアクセス可能
- executor, adapter, AgentRunContext, StepDeps に変更不要 → regression リスク最小
- 各 step が注入 section のラベリング・フレーミングを個別にカスタマイズ可能

### D4: 汎用 section 抽出ユーティリティ

`src/parser/extract-section.ts` に純粋関数 `extractMarkdownSections(content, headings)` を新設。general-purpose な markdown heading extractor として再利用可能にする。

**Why:**
- design / code-review で共通の抽出ロジックが必要
- parser layer に配置することで request.md のテキスト処理と位置が一致
- 将来他の step が同機能を必要とした場合に再利用可能

### D5: 対象 heading は 3 固定（コード定数）

抽出対象は以下の 3 heading:
- `## スコープ外`
- `## 受け入れ基準`
- `## architect 評価済みの設計判断`

定数として定義し、request.md に該当 heading がない場合は gracefully skip（注入なし）。

## Risks / Trade-offs

- [Risk] Agent が `<user-request>` 外の section も無視する可能性 → Mitigation: `<user-request>` 内は agent が「ユーザーデータ」として扱うため attention が分散するが、タグ外は「CLI 指示」として扱われ無視される確率は低い。実運用で効果不足が確認された場合は followUp verification pass を追加する（本 request のスコープ外）
- [Risk] Initial message の token 増（~200-500 tokens） → Mitigation: Opus 1M context window 対比で無視可能
- [Risk] Heading 名のバリエーション（例: `## 対象外` vs `## スコープ外`） → Mitigation: request.md の heading 名は `specrunner request create` が生成するため一貫している。カスタム heading は対象外

## Open Questions

なし
