# Design: request の現状コード断定を design / request-review が実コードと突き合わせる

## Context

request.md には「現状のコードはこうなっている」という断定（しばしば file:line を伴う）が書かれるが、pipeline はこれを検証せず信頼する。request↔spec の整合は spec-review が検証する一方、request↔実コードの事実関係はどの step も突き合わせない。曖昧な記述なら design が自力で調査するが、間違った精密さは調査を先回りして封じるため、誤った断定が design の前提となり、そのまま実装される危険がある。

本 design は request の現状コード断定を **untrusted input** として扱い、消費側（design / request-review）に実コードとの突き合わせ工程を入れる。

現状コード（本セッションで実コードと突き合わせ確認済み）:

- request scaffold は `src/core/command/request.ts` の `buildScaffoldTemplate()` 内 literal。`request template`（`executeTemplate`）と `request new`（`request-new.ts` → `executeNew`）の **両方がこの 1 関数を共有**する。節は 背景 / 要件 / スコープ外 / 受け入れ基準 / architect 評価済みの設計判断。
- request-review agent は read-only の codebase 探索権限（Read / Grep / Glob）を既に持つ（`src/prompts/request-review-system.ts:33` / `:198`）。
- design agent は実コード編集不可だが Read / Grep で参照可（`src/prompts/design-system.ts:42` / `:106-108`）。
- validate はどのセクションの存在チェックも行わない。実ルールは `src/parser/rules/` の Meta 系 7 ルール（title / type / slug / base-branch / adr の必須・妥当性検証）のみ。未知セクションは parser が silently ignore する（`src/parser/request-md.ts:14`）。`src/parser/extract-section.ts:80-84` の見出し定数は design / code-review への文脈注入用でありバリデーションとは無関係。新節を追加しても validate の変更は不要。
- LLM による request 生成は `src/prompts/request-generate-system.ts` が司る。現状その Required Format に「現状コードの前提」節は無い。

## Goals / Non-Goals

**Goals**:

- request scaffold に任意節「## 現状コードの前提」と書き手向けコメントを追加する（`request template` / `request new` の出力、および request-generate の生成指示の両方に反映）。
- request-review に「file:line または具体的なシンボル名・ファイルパスを伴う現状コード断定（節の内外を問わず request 全体が対象）を実コードと突き合わせ、不一致を severity high の finding として報告する」観点を追加する。
- design に「現状コード断定を設計の前提にする前に Read / Grep で実コードと突き合わせ、不一致を発見したら誤った前提のまま設計せず report_result を ok=false + reason で報告する」工程を追加する。
- 突き合わせ対象（file:line / 具体シンボル名 / ファイルパスを伴う現状の断定）と対象外（意図・方針・将来の話）を design / request-review の両 prompt に明記する。

**Non-Goals**:

- 新節の機械 parse（構造化データ化）。
- implementer / spec-review / code-review への同様の工程追加。
- 既存 request / archive 済み request の遡及修正。
- 断定の自動抽出ツール。

## Decisions

### D1: 節は scaffold に常設するが validate では任意とする（required-section rule を追加しない）

- Rationale: 要件 4。未知セクションは parser が silently ignore する（`request-md.ts:14`、本セッションで確認）ため、scaffold に常設しても節を持たない既存 request は validate green のまま通る。常設は「断定の置き場所の推奨」を書き手に提示するために行う。
- Alternatives considered: `src/parser/rules/` に required-section rule を追加して節を必須化する案 — 既存 request すべてを break し要件 4 と矛盾、かつスコープ外。却下。

### D2: scaffold は `buildScaffoldTemplate()` の 1 箇所のみ編集する

- Rationale: `executeTemplate`（`request template`）と `executeNew`（`request new`、`request-new.ts:6` / `:42`）がともに `buildScaffoldTemplate()` を呼ぶ（本セッションで確認）。単一編集で両出力に反映でき DRY。
- Alternatives considered: 各コマンドに別 literal を持たせる — 重複と drift のリスク。却下。

### D3: 節の配置は「背景」と「要件」の間とする

- Rationale: 現状コードの断定は背景的文脈であり要件の前提に当たる。本 request 自身もこの順序（背景 → 現状コードの前提 → 要件）で書かれており、書き手の自然な流れに沿う。
- Alternatives considered: 末尾（受け入れ基準の後）に置く — 背景を書く時点で断定の置き場所が遠く、文中への漏出を助長する。弱いため却下。

### D4: request-generate では「現状コードの前提」を任意（optional）セクションとして案内する

- Rationale: `request-generate-system.ts` は "Your output MUST include all of the following sections in order" として必須セクションを列挙する。ここに「現状コードの前提」を必須として加えると、断定の無い request でも空節を強制し、かつ要件 4（節は任意）と矛盾する。既存の「目的」セクションと同じ optional 扱いで案内する。
- Alternatives considered: Required Format に必須として追加 — 要件 4 と矛盾。却下。

### D5: 検証は「書き手の規律」ではなく「消費側 pipeline 工程」に置く（architect 評価済み）

- Rationale: テンプレートへのコメント追加（書き手への助言）だけでは効かない。書き手は自信を持って間違えるため、検証を書き手の規律から pipeline の工程へ移すことが本質。節単体は飾りになるため、要件 2・3 の消費側変更（request-review / design）を本体とする。
- Alternatives considered: コメントによる助言のみ — 助言は規律に依存し再発を防げない。却下。

### D6: 突き合わせ対象を request 全体とし、節に限定しない（architect 評価済み）

- Rationale: 現状断定は背景や要件の文中にも自然に漏れ出すため、検証対象を節に限定すると漏れる。両 prompt で「節の内外を問わず request 全体が対象」「対象は file:line / 具体的なシンボル名・ファイルパスを伴う現状の断定。意図・方針・将来の話は対象外」と明記する。節は断定の置き場所の推奨として機能させる。
- Alternatives considered: 検証対象を節内のみに限定 — 文中に漏れた断定を取りこぼす。却下。

### D7: 不一致時の経路は request-review = severity high finding、design = ok=false + reason

- Rationale: request-review は既存の severity 定義（high = request-level defect）に「現状コード断定と実コードの不一致」を加え、既存の read-only 探索権限の範囲内で findings に載せる。design は誤前提のまま設計を進めるより、既存の report_result（ok=false, reason）経路で escalate する方が安全（escalation as design safety net）。各 step は既存の出力契約を再利用し、新しい経路を増やさない。
- Alternatives considered: design で不一致を黙って自己修正する — 誤前提の起源（request）が残り、再発と乖離を招く。却下。

## Risks / Trade-offs

- [Risk] request-review の read-only 探索は request 内の全断定を網羅できず、見落としやコスト増の懸念がある。 → Mitigation: 観点を「file:line / 具体的なシンボル名・ファイルパスを伴う断定」に絞り、曖昧な記述は対象外と明記する。網羅保証ではなく「明示的に精密な断定」を主対象とする。
- [Risk] design の ok=false は pipeline を escalate させ手戻りになる。 → Mitigation: これは意図した設計（誤前提のまま実装するより健全）。不一致を発見した場合のみ発火し、一致時は通常進行する。
- [Risk] prompt / template の変更は文字列であり、振る舞いの自動検証が弱い。 → Mitigation: prompt 文字列・template 出力に対する content assertion テストを追加する（既存 `tests/prompts/design-system.test.ts` / `tests/unit/core/command/request.test.ts` のパターンに倣う）。
- [Risk] request-generate の "MUST include all sections" に任意節を不用意に足すと矛盾する。 → Mitigation: D4 に従い optional セクションとして記述し、必須リストには加えない。

## Open Questions

- なし。
