# Design: conformance の正典に格差を付ける (request/spec = 規範, design/tasks = 計画)

## Context

conformance step は最終実装が依頼の意図を満たしたかを確認する最終レビュー。現行 prompt
(`src/prompts/conformance-system.ts`) は 4 成果物 (request.md / spec.md / design.md / tasks.md)
を同格の「正典」として扱い、`Method` の照合手順で:

- `tasks.md` — 全 checkbox `[x]` を確認 (L37)
- `design.md` — 全 decision (D1, D2, ...) の実装反映を確認 (L39)
- `spec.md` — spec-exempt 判定 + Requirement/Scenario 充足 (L41-46)
- `request.md` — 受け入れ基準の全件確認 (L47)

この同格扱いは「実装前に書かれた計画」を「最終実装」より強くし、実装中により良い構造を
選んだ場合に design/tasks との相違が non-conformity として指摘され、正しい実装を計画へ
引き戻す圧力になる。

成果物の性質に沿った格差を付ける: request.md / spec.md = 規範 (逸脱 = finding)、
design.md / tasks.md = 計画・根拠 (実装との相違はそれ自体では finding にしない)。

**機械層の境界 (無変更)**:
- verdict 導出 (`deriveConformanceVerdict`) / fixTarget 集約 (`aggregateFixTarget`) /
  遷移 (`src/core/step/judge-verdict.ts`) — judge-verdict 層
- canon-finding escalation (`src/core/step/canon-escalation.ts`, `CANON_FINDING_ESCALATION`) — judge-verdict 層
- report schema (`CONFORMANCE_REPORT_TOOL.zodSchema`、findings + evidence のみ、typed observation 枠なし)

これらはすべて本 change のスコープ外。変更は **prompt 層のみ** で完結する。

## Goals / Non-Goals

**Goals**:

- G1: conformance prompt の正典定義を二層化する (request/spec = 規範、design/tasks = 計画)。
- G2: design/tasks との相違の判定基準を「その相違が request/spec の意図・受け入れ基準・
  振る舞いを破るか」に置換する。破れば finding (根拠は request/spec を引く)、破らなければ
  non-blocking note として evidence 報告本文に記録する。
- G3: 受け入れ基準 (request 全件) と Requirement/Scenario (spec 全件) の充足確認を維持する。
- G4: fixTarget enum / verdict 集約 / 遷移の機械意味論を無変更で保つ。agent 向け routing 説明
  (prompt の routing 表 + tool description) の文面のみ二層に整合させる。

**Non-Goals**:

- conformance step の廃止・位置変更。
- verdict 導出ロジック (judge-verdict 層) の変更。
- spec-review / code-review の照合観点変更。
- design/tasks の成果物としての生成・形式変更。
- report schema への typed observation 枠の追加 (相違の記録は既存 evidence 報告本文で足りる)。

## Decisions

### D1: 二層化は prompt 層のみで行う

正典の重み付けはレビューの判定基準の問題であり、verdict 導出・routing の機械層を触る必要が
ない。変更は `src/prompts/conformance-system.ts` の `CONFORMANCE_BASE` (`Contract` / `Method`
/ routing 表) と、agent 向け説明を持つ隣接箇所 (report tool description、initial message) の
文面に限定する。

- **Rationale**: 機械層まで変えると影響範囲が意図 (判定基準の是正) を超える。architect 評価済み。
- **Alternatives considered**:
  - (a) report schema に typed observation 枠を新設し相違を型で記録 → 却下。今回の引き算
    (計画一致の強制を外す) に対し schema 追加は逆行。記録は既存 evidence 報告本文で足りる。
  - (b) judge-verdict に「design/tasks 由来 finding は非ブロッキング」ルールを追加 → 却下。
    機械層の意味変更になり Non-Goal。prompt が finding にしなければ機械層は現状のまま正しく動く。

### D2: 判定基準を「規範が破られているか」に置換し、相違は non-blocking note に落とす

`Method` の design/tasks 照合を、完了性チェックから **規範違反の有無チェック**へ置換する。
design decision の不反映・tasks との相違・checkbox 未完了を検出した場合:

- request/spec の意図・受け入れ基準・振る舞いが**破られている** → finding とする。finding の
  根拠には design/tasks ではなく **request.md / spec.md の該当箇所を引く**。
- **破られていない** → 相違を **non-blocking note として evidence 報告本文に記録**する
  (schema は変えない)。design/tasks の追随更新を促してよいが、finding にはしない。

non-blocking note の置き場は既存の `CONFORMANCE_RESULT_TEMPLATE`
(`## 検証した項目` / `## Findings 詳細`) で足りる。**result template は変更しない**
(drift-guard TC-011 が `## 検証した項目` 保持と verdict-derivation パターン不在を pin しており、
無変更で green を保つ)。

- **Rationale**: 相違を黙殺すると design/tasks が実装から乖離したまま archive される。finding
  (強制) ではなく evidence 報告内の note に落とすことで、文書追随は促しつつ計画への引き戻し圧力を消す。
- **Alternatives considered**: 専用セクション `## 計画との相違` を template に追加 → Open Question
  に送り、初期スコープでは追加しない (YAGNI、既存セクションで足りる)。

### D3: 完了性確認 (受け入れ基準 + Requirement/Scenario) は維持する

checkbox・decision 反映の確認が担っていた実質は「やり残しの検出」であり、それは request の
受け入れ基準充足と spec の Requirement/Scenario 充足で覆える。よって:

- `request.md` — 受け入れ基準の達成を**全件確認** (規範)。未達は finding。
- `spec.md` — spec-exempt 判定は現行維持。非 exempt 時は全 Requirement (SHALL/MUST) と全
  Scenario の充足を**全件確認** (規範)。未充足は finding。

緩めるのは「計画との一致」の強制のみ。「意図の充足」の確認は緩めない。

- **Rationale**: architect 評価済み (「完了性」と「計画一致」の分離)。
- **Alternatives considered**: tasks checkbox 完了確認を conformance の gate として残す → 却下。
  それは「計画一致」の強制であり本 change が外す対象。やり残しは受け入れ基準/Scenario で捕捉する。

### D4: routing 説明の文面のみ二層に整合させる (fixTarget enum は無変更)

fixTarget の enum (`implementer` | `code-fixer` | `spec-fixer`) と集約優先順位
(spec-fixer > implementer > code-fixer)・遷移は無変更。agent 向け routing 説明の文面のみ更新する:

- prompt の routing 表 (現 L72-77): 「spec.md / design.md の成果物が誤っている・欠落 →
  spec-fixer」等の行を、二層と矛盾しない文面に置換する。design/tasks との相違は request/spec
  違反を伴う場合のみ finding であり、その finding の修正先を示す表として書き直す。
- `CONFORMANCE_REPORT_TOOL.description` (`src/core/step/report-tool.ts`) の
  `fixTarget routing: 'spec-fixer' = spec/design artifact is wrong; ...` を同様に二層整合の文面へ更新。
  enum 値の文字列 (`implementer` / `code-fixer` / `spec-fixer`) と `fixTarget` トークンは維持する。

- **Rationale**: requirement 4。routing の機械意味論 (どの fixer が finding を修正するか) は不変。
  変わるのは「相違があれば自動で finding」という前提の説明だけ。
- **Alternatives considered**: description を無変更 → 却下。二層宣言と「design artifact が誤っている
  → 常に spec-fixer finding」の説明が矛盾する。requirement 4 が文面追随を求める。

### D5: initial message (buildMessage) の agent 向け手順を二層に整合させる

`src/core/step/conformance.ts` の `buildMessage` (現 L84-91) の手順は system prompt と同じ
agent 向け説明である。二層と矛盾する行を整合させる:

- 「verify all checkboxes are marked complete [x]」→ checkbox 状態は計画コンテキストとして note
  する旨に緩める (完了性 gate 表現を外す)。
- design decisions / Requirements / acceptance criteria を「note する」手順は維持 (規範 vs 計画の
  役割づけは system prompt が担う)。

- **Rationale**: 同一の agent 向け説明が隣接ファイルに二重にある。片方だけ二層化すると矛盾した
  指示が残る (root-cause: 全 agent 向け説明を一度に整合させる)。buildMessage を pin するテストは
  存在せず (TC-024 は design / spec-review の initial message のみ)、無変更で他テストに影響しない。
- **Alternatives considered**: buildMessage を触らない → 却下。system prompt (二層) と initial
  message (checkbox 完了を gate 扱い) が矛盾し、agent の判定基準を揺らす。

### D6: prompt contract anchors — 実装と test が合意する固定文字列

新規テストと prompt が同じ固定文字列を参照するよう、以下の anchor 文字列を CONFORMANCE_SYSTEM_PROMPT
に含める (test は raw string への部分一致で pin する。markdown 装飾 `**` は anchor に含めない):

| ID | 目的 (受け入れ基準) | anchor 部分文字列 (prompt に literal で含める) |
|----|--------------------|--------------------------------------------|
| A1a | 規範層の宣言 | `規範（normative）` |
| A1b | 計画層の宣言 | `計画・根拠（plan / rationale）` |
| A2 | 相違はそれ自体では finding にしない | `それ自体では finding にしない` |
| A3 | finding の根拠は request/spec を引く | `finding の根拠には request.md / spec.md` |
| A4 | non-blocking note の置き場 | `non-blocking note` |
| A5 | 完了性の全件確認 (維持) | `全件確認` (request 受け入れ基準・spec Requirement/Scenario の両方に付す) |

`request.md` / `spec.md` / `design.md` / `tasks.md` / `fixTarget` / `spec-fixer` / `implementer`
/ `code-fixer` の各トークンは引き続き prompt に存在させる (既存 TC-012 / TC-CONF-03 を green 維持)。

- **Rationale**: prompt 文面のテストは brittle になりやすい。design を単一ソースとして anchor を
  固定し、実装側とテスト側の drift を防ぐ。distinctive な複数語 anchor を選び偶発一致を避ける。
- **Alternatives considered**: 文言を実装者裁量にする → 却下。test と prompt の drift で false red/green
  を生む。anchor を design で固定するのが最小の contract。

### D7: 既存 prompt-contract pin の扱い — 全て無変更で green (更新対象は 0)

`CONFORMANCE_SYSTEM_PROMPT` / `CONFORMANCE_REPORT_TOOL` の content を assert する既存テストを
全数調査した結果、二層化後も**全て無変更で green**。更新対象の既存テストは無い。追加する
テストのみが新規 (T-04)。

| 既存テスト | pin 内容 | 二層化後の扱い | 根拠 |
|-----------|---------|---------------|------|
| conformance.test.ts TC-012 | prompt が tasks/design/spec/request.md を含む | 無変更 green | 4 成果物名は二層 prompt でも全て参照される |
| conformance.test.ts TC-CONF-01 | report tool schema/description が `fixTarget` を含む | 無変更 green | enum + description で `fixTarget` トークン維持 |
| conformance.test.ts TC-CONF-02 | judge/code-review schema に `fixTarget` 不在 | 無変更 green | 対象外 (未変更) |
| conformance.test.ts TC-CONF-03 | prompt が fixTarget + 3 routing target を含む | 無変更 green | routing 表 rewrite 後も 4 トークン維持 |
| conformance.test.ts TC-009/010/011/013/017 | code-review prompt / step 名 / path / identity / maxTurns | 無変更 green | conformance content と無関係 |
| judge-verdict-conformance.test.ts TC-JVCONF-01..09 | verdict 導出 + fixTarget 集約の機械意味論 | 無変更 green | judge-verdict.ts 未変更 (機械意味論 pin) |
| prompt-skeleton-drift-guard TC-001 | 5 節見出し順序 (Question/Contract/Method/Evidence/Completion) | 無変更 green | skeleton 保持 (rewrite は節内文面のみ) |
| prompt-skeleton-drift-guard TC-004 | EVIDENCE_DISCIPLINE 埋め込み | 無変更 green | `${EVIDENCE_DISCIPLINE}` を base に保持 |
| prompt-skeleton-drift-guard TC-005 | CAUSE_CLASSIFICATION 埋め込み | 無変更 green | COMPLETION_DIRECTIVE fragment (未変更) 由来 |
| prompt-skeleton-drift-guard TC-007 | `architecture/` 不在 | 無変更 green | 追加しない |
| prompt-skeleton-drift-guard TC-011 | CONFORMANCE_RESULT_TEMPLATE が `## 検証した項目` 保持 + verdict-derivation パターン不在 | 無変更 green | template 未変更 (D2) |
| prompt-skeleton-drift-guard TC-014 | prompt export が非空 string | 無変更 green | 保持 |
| prompt-skeleton-drift-guard TC-015 | CONFORMANCE_SYSTEM_PROMPT が SEVERITY_DEFINITION を含む | 無変更 green | `${SEVERITY_DEFINITION}` を base に保持 |
| prompt-skeleton-drift-guard TC-016 | judge prompt に verdict 出力指示不在 | 無変更 green | 禁止文字列を追加しない |
| fast-scope-checkpoint.test.ts / fast-descriptor.test.ts | ConformanceStep.reportTool === CONFORMANCE_REPORT_TOOL (identity) | 無変更 green | identity のみ、content 非依存 |

- **Rationale**: 受け入れ基準「既存テストの更新対象を design で全列挙し、列挙外は無変更で green」。
  上表が完全な列挙であり、更新対象は 0 件。二層化の文面変更は既存 pin が参照するトークン
  (成果物名・fixTarget・routing target・骨格見出し・共有定数) をすべて温存する設計。
- **Alternatives considered**: 既存 TC を書き換えて二層宣言を pin → 却下。既存 pin は無変更で green を
  保てるため、新規 TC を追加する方が「列挙外は無変更」を満たしやすく、既存 contract を壊さない。

## Risks / Trade-offs

- [Risk] prompt 文面 anchor の pin が brittle (文言微修正で落ちる) → **Mitigation**: D6 で anchor を
  design 単一ソースに固定し、distinctive な複数語部分文字列を選ぶ。実装は anchor を literal で埋め込む。
- [Risk] 二層化で「やり残し」検出が弱まる懸念 → **Mitigation**: D3。緩めるのは計画一致のみ。やり残しは
  request 受け入れ基準の全件確認 + spec Requirement/Scenario の全件確認で捕捉する (両方に `全件確認` を明記)。
- [Risk] report tool description の rewrite が TC-CONF-01 (`fixTarget` 存在) を破る → **Mitigation**:
  rewrite 後も `fixTarget` トークンと enum 値文字列を維持する (T-02 の受け入れ基準に明記)。
- [Risk] buildMessage 編集がスコープ逸脱に見える → **Mitigation**: D5。requirement 4 の「agent 向け
  説明の追随」の範囲。矛盾指示を残さない root-cause 修正であり、pin テストも無い。

## Open Questions

- non-blocking note 用の専用セクション (`## 計画との相違` 等) を CONFORMANCE_RESULT_TEMPLATE に
  追加すべきか。初期スコープでは追加せず既存セクション (`## 検証した項目` / `## Findings 詳細`) を
  用いる (YAGNI、template 変更は drift-guard TC-011 と衝突リスク)。運用で note の埋没が判明したら別 change で追加検討。
