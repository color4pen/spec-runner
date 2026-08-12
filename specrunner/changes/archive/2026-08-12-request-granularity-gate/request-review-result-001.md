# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

**Code Assertion Fact-Check（現状コードの前提 全5断定）**

1. `src/core/command/request.ts:126` — `executeValidate` 関数定義を Read で確認。line 126 に `export async function executeValidate(...)` があり、関数本体は parse + design-layer gate のみ。規模カウントなし。✓

2. `src/parser/extract-section.ts:82` — Read で確認。line 82 は `REQUEST_CONSTRAINT_HEADINGS` 配列内の `"受け入れ基準"` エントリ。`extractMarkdownSections` 関数（line 24〜74）が節抽出の基盤として存在する。✓

3. `src/prompts/request-review-system.ts:54` — Read で確認。line 54 に `5. **Scope & Complexity Evaluation**: YAGNI 違反・スコープクリープ・隠れたコスト・未記載の設計判断を確認する。複数の設計アプローチが存在する場合は並列列挙せず、根拠付きで 1 案を推奨する。` — 縫い目判定観点は存在しない。✓

4. `src/core/step/request-review.ts` — Read で確認。`buildMessage` は slug・requestType・branch・iteration・findingsPath・requestContentHash・sourceRevision のみを渡す。前周 findings / operator 裁定の周回注入なし。✓

5. `docs/request-authoring.md:60` — Read で確認。line 60 は `## 粒度 — 1 request は 1 つの収束ループ` の heading。lines 70–73 に質的分割基準 3 つ（独立して設計・テストできる / 収束の意味論が異なる / 受け入れ基準の相互参照）あり。実測に基づく量的目安なし。✓

**追加検証**

- `src/prompts/issue-fidelity-system.ts:35` — 宣言による「意図的な省略」尊重の既存パターン（scope-out declarations are respected）を確認。request が引用する類比が実在する。✓
- `src/core/command/request.ts` の `buildScaffoldTemplate` — 受け入れ基準節のコツコメント現状を確認（"機械検証できる文にする" のみ）。実測・宣言への言及なし。変更対象であることを確認。✓

**Request Validation**

- 目標（入口に前倒し・検知と決定の分離）は明確
- 受け入れ基準 7 項目はすべて機械検証可能な形式（テストで固定 / typecheck && test）
- スコープ外 5 項目は隣接する誘惑が名指しで切られており、implementer への boundary が明確
- 設計判断節に採用理由と却下代替案がある（hard gate 却下・LLM 推定却下・config 化却下・周回注入却下）
- `adr: true` 宣言あり、pipeline が自動処理するため個別対応不要

**External Dependency Check**

外部 SDK / API / サードパーティ依存なし。既存 parser と prompts の内部変更のみ。

**Scope & Complexity Evaluation**

受け入れ基準 7 項目。validate（機械）と request-review prompt（意味）の二段構成は独立して設計・テストでき、分割候補とも読めるが、request 自身が「architect 評価済みの設計判断」節に設計分岐を明示している（hard gate 却下・周回注入機構却下の理由付き）。受け入れ基準 7 本は 10 本未満であり、実測較正値の黄信号水準に達していない。

## 検証できなかった項目

- archive 499 件の実測データ（表の数値）— コードベースから検証不可能な経験的データ。ただし量的目安はコードに定数として埋め込まれ（しきい値 15）、n=13 と thin な根拠であることを request 自身が認識した上で warning（非 hard gate）採用を正当化している。

## Findings 詳細

None
