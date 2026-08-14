# ADR-20260814: conformance の正典に格差を付ける — request/spec は規範、design/tasks は計画

## ステータス

accepted

## コンテキスト

conformance step は pipeline の最終 acceptance gate として 4 upstream artifact（request.md / design.md / spec.md / tasks.md）への適合を判断する（`2026-06-03-conformance-review-acceptance-gate` D4）。しかし当初の実装では 4 成果物を同格の「正典」として扱い、以下を同列の不合格条件としていた:

- tasks.md の checkbox が全件 `[x]` でない
- design.md の全 decision (D1, D2, ...) が実装に反映されていない
- spec.md の Requirements / Scenarios が未充足
- request.md の受け入れ基準が未達成

この同格扱いは「実装前に書かれた計画」を「最終実装」より強くする構造的な問題を持つ。実装フェーズで得た知識によってより良い構造を選んだ場合、request/spec の意図は満たしていても design/tasks との相違が non-conformity として判定され、正しい実装を計画に引き戻す圧力になる。

また、conformance の report tool（`CONFORMANCE_REPORT_TOOL`）は findings + evidence のみを受け取る設計であり、typed observation 枠を持たない。

## 決定

### D1: 正典を二層化し、格差付けは prompt 層のみで行う

4 成果物を以下の二層に区別する:

| 層 | 成果物 | 位置づけ | 逸脱の扱い |
|----|--------|---------|-----------|
| 規範（normative） | request.md / spec.md | 守るべき意図・受け入れ基準・振る舞い | finding — 未達は必ず報告 |
| 計画・根拠（plan / rationale） | design.md / tasks.md | 実装到達のための文脈 | それ自体では finding にしない |

変更は `src/prompts/conformance-system.ts` の prompt 文面（`Contract` / `Method` / routing 表）と隣接する agent 向け説明（report tool description、initial message）に限定する。verdict 導出（`deriveConformanceVerdict`）/ fixTarget 集約（`aggregateFixTarget`）/ 遷移（judge-verdict 層）/ report schema は無変更。

**採用理由**: 正典の重み付けはレビューの判定基準の問題であり、verdict 導出・routing の機械層を変える必要がない。機械層まで変えると影響範囲が意図（判定基準の是正）を超える。

**却下案**:
- judge-verdict 層に「design/tasks 由来 finding は非ブロッキング」ルールを追加する → 機械意味論の変更になり Non-Goal。prompt が finding にしなければ機械層は現状のまま正しく動く
- report schema に typed observation 枠を新設する → 今回の引き算（計画一致の強制を外す）に逆行。記録の置き場は既存 evidence 報告本文で足りる

### D2: design/tasks 相違の判定基準を「規範違反の有無」に置換する

design decision の不反映・tasks との相違・checkbox 未完了を検出した場合:

- その相違が request/spec の意図・受け入れ基準・振る舞いを**破っている** → finding とする。finding の根拠には design/tasks ではなく **request.md / spec.md の該当箇所**を引く
- **破っていない** → 相違を **non-blocking note** として evidence 報告本文に記録し、design/tasks の追随更新を促す（finding にはしない）

相違を黙殺しない設計を維持することで、design/tasks が実装から乖離したまま archive されることを防ぐ。

**採用理由**: finding（強制）ではなく evidence 報告内の note に落とすことで、文書追随は促しつつ実装を計画に引き戻す圧力を消す。schema は変えない。

**却下案**:
- 専用セクション（`## 計画との相違` 等）を CONFORMANCE_RESULT_TEMPLATE に追加する → drift-guard TC-011 との衝突リスクがあり YAGNI。既存 `## 検証した項目` / `## Findings 詳細` で足りる。運用で note の埋没が判明したら別 change で検討する

### D3: 完了性確認（受け入れ基準 + Requirement/Scenario）は維持する

緩めるのは「計画との一致」の強制のみ。「意図の充足」の確認は緩めない:

- **request.md** — 受け入れ基準の達成を全件確認（規範）。未達は finding
- **spec.md** — spec-exempt 判定は現行維持。非 exempt 時は全 Requirement（SHALL/MUST）と全 Scenario の充足を全件確認（規範）。未充足は finding

checkbox・decision 反映の確認が担っていた「やり残しの検出」は、request 受け入れ基準の全件確認と spec Requirement/Scenario の全件確認で覆える。

### D4: routing 説明の文面を二層に整合させる（fixTarget enum は無変更）

fixTarget の enum（`implementer` | `code-fixer` | `spec-fixer`）と集約優先順位・遷移は無変更。agent 向け routing 説明の文面のみ更新する:

- prompt の routing 表: design/tasks との相違は request/spec 違反を伴う場合のみ finding であり、その finding の修正先を示す表として書き直す
- `CONFORMANCE_REPORT_TOOL.description`: finding の根拠が normative artifact にある場合のみ fixTarget を判断する旨に整合させる

**採用理由**: routing の機械意味論（どの fixer が finding を修正するか）は不変。変わるのは「相違があれば自動で finding」という前提の説明だけ。

### D5: initial message（buildMessage）の checkbox gate 表現を緩める

`src/core/step/conformance.ts` の `buildMessage` から「verify all checkboxes are marked complete [x]」の gate 表現を除去し、checkbox 状態を計画コンテキストとして note する旨に置換する。規範 vs 計画の役割づけは system prompt が担うため、message には判定基準を書かない。

system prompt（二層）と initial message（checkbox を gate 扱い）の矛盾した指示を統一することが目的。

## 検討した代替案

### A1: design/tasks の相違を全て黙殺する（non-blocking note も記録しない）

- **Pros**: 実装の自由度を最大化できる。報告文書が簡潔になる
- **Cons**: design/tasks が実装から乖離したまま archive される。将来の参照者が計画と実装の齟齬に気づけない
- **Why not**: 黙殺はシステム文書の信頼性を損なう。finding にしないことと、記録しないことは別問題。non-blocking note として残すことで実装変更の根拠を追跡可能にする

### A2: tasks checkbox 完了確認を conformance の gate として残す

- **Pros**: 「やり残し」の検出が明示的
- **Cons**: 計画一致の強制であり、本 change が外す対象そのもの。やり残しは request 受け入れ基準の全件確認と spec Scenario 充足で同等以上の粒度で検出できる
- **Why not**: conformance の purpose は「request.md / spec.md の意図が実装に達成されたか」であり、「tasks.md が更新されたか」ではない

### A3: design/tasks を conformance の照合対象から完全に除外する

- **Pros**: 判定基準が最も単純になる
- **Cons**: design/tasks との相違（実装中に計画から離れたこと）が記録に残らず、archive 後のコンテキストが失われる。また、照合することで計画の実現を補強できる情報を捨てることになる
- **Why not**: 照合は維持しつつ、照合結果の扱い（finding vs note）のみを変える方が情報量を保持できる

## 影響

### Positive

- 実装フェーズで得た知識によるより良い設計選択が、conformance で非適合として阻害されなくなる
- finding の根拠が常に request/spec の意図に紐づくため、「何を直すべきか」が明確になる
- 計画（design/tasks）と実装の乖離は non-blocking note として記録されるため、archive 後も参照可能

### Negative

- design/tasks が更新されないまま archive されるケースが増える可能性がある（note 記録に留まるため）
- conformance の判定が「規範を破るか否か」の判断を agent に委ねる場面が増える（以前は checkbox 状態という機械的な基準もあった）

### Known Debt

- non-blocking note の置き場（`## 検証した項目` / `## Findings 詳細`）で note が埋没する可能性がある。運用で問題が判明した場合は CONFORMANCE_RESULT_TEMPLATE への専用セクション追加を別 change で検討する
- `CONFORMANCE_REPORT_TOOL` の JSDoc コメントに旧表現の残存がある（`"spec/design errors: the spec or design artifact is wrong/incomplete"`）。挙動への影響はないが、次の conformance 関連 change で更新を検討する

## 参照

- Request: `specrunner/changes/conformance-canon-tiers/request.md`
- Design: `specrunner/changes/conformance-canon-tiers/design.md`
- Related: `specrunner/adr/2026-06-03-conformance-review-acceptance-gate.md`（conformance step の追加と D4 の原設計）
- Revised: `2026-06-03-conformance-review-acceptance-gate.md` D4（4 成果物の同格扱い → 二層化）
