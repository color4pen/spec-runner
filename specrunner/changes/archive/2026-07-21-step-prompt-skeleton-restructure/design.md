# Design: 全 step prompt を 5 部構成の共通骨格に再構成し、evidence 規律と原因分類を共通化する

## Context

step prompt（`src/prompts/*-system.ts`）は事故対応の個別パッチを積層して成長した結果、
同一知識の独立複製と drift、個別パッチの一般原則化不足、散文による境界維持の重複、
repo 固有資源への参照、維持コストの逓増という構造問題を抱えている。

現状（本設計時点で実コードを確認済み）:

- stage 表が prompt 間で独立併存する: `design-system.ts:26-33`（5 stage）/
  `implementer-system.ts:16-22`（同じ 5 stage を独立宣言）/ `test-materialize-system.ts:32-41`（6 stage）。
  grep で `Pipeline Position` / `stage 1` を含むのは design / implementer / test-materialize / rules.ts の 4 ファイル。
- `rules.ts:21` は「9 step」と記載しつつ 11 項目を列挙し、request-review / test-materialize /
  conformance / regression-gate / custom-reviewer が欠落。`rules.ts:66` の「共通禁止:」は本文が空。
- `design-system.ts:133-135` が `architecture/` を名指し参照している（`src/prompts/` 配下で `architecture/`
  を含むのはこの 1 箇所のみ）。
- coverage gate 回避禁止の同一文言が `build-fixer-system.ts:24` と `code-fixer-system.ts:30` に複製。
- 合成機構 `buildSystemPrompt(base, fragments)` が `builder.ts:19` に存在し、本変更はこれを流用する。
- 判定チャネルは typed findings に一本化済み。severity / verdict / observation / decision-needed の
  定義は `judge-rules.ts` が単一ソースであり、`fragments.ts` の `PIPELINE_RULES` が category / verdict を持つ。

前提となる制約（判定チャネル系の既存テストから確認）:

- `src/core/step/__tests__/verdict-channel-unification.test.ts` は判定チャネルの単一ソース性を固定する
  protected test であり、次を要求する:
  - 各 judge prompt は `SEVERITY_DEFINITION` / `REQUEST_REVIEW_SEVERITY_DEFINITION` を埋め込む（TC-009）
  - severity 署名文言は judge-rules.ts 以外に存在しない（TC-010）
  - 4 result template は `## 検証した項目` / `## 検証できなかった項目` を保持し、7 列 findings 表・
    verdict 行 placeholder を持たない（TC-003 / TC-004）
  - code-review の content-format gate は evidence セクションを検査する（TC-005 / TC-006 / TC-007）
- fact-check 済みの前提として、R6 が「REVIEW_FEEDBACK template 内の Fix カラム意味論・Scores 表」を
  違反として挙げているが、**実コードの REVIEW_FEEDBACK_TEMPLATE は既に evidence report 形式であり
  Fix カラム / Scores 表 / Weight を含まない**（verdict-channel-unification で解消済み）。本設計は現状に
  即し、REVIEW_FEEDBACK に対する作業を「Scores / Weight が不在であることの回帰ガード追加」に限定する。

本変更は全 step prompt を単一の 5 部構成骨格に再構成し、横断規律を共有 fragment に集約する。
目的は「個別事故への対症ルールの集積」から「新種の欠陥にも作用する一般規律の骨格」への転換である。

## Goals / Non-Goals

**Goals**:

- 全 agent step system prompt を `Question / Contract / Method / Evidence / Completion` の
  5 節構成に統一する。
- 横断規律を共有 leaf fragment に集約する: `PIPELINE_MAP`（step 一覧の単一ソース）/
  `EVIDENCE_DISCIPLINE`（根拠規律）/ `CAUSE_CLASSIFICATION`（原因分類）/
  `COVERAGE_GATE_INTEGRITY`（coverage gate 回避禁止の単一ソース）。
- 個別パッチ（test-case-gen の N/A 明示則、design の path-fence 散文、fixer の coverage 文言複製）を
  一般規律 + write-set 圧縮へ再配置する。禁止範囲は不変。
- `architecture/` の repo 固有参照を可搬な表現へ置換する。
- `rules.ts` の step 列挙を PIPELINE_MAP 由来にし、空節を除去し、責任範囲表を現行 step へ更新する。
- output template を「形式のみ」に純化する（判定基準・Scores 表・他 agent 行動指示を排除）。
- 上記すべてを drift-guard テストで固定する。

**Non-Goals**（request のスコープ外を踏襲）:

- typed toolResult schema の拡張（evidence counts / cause フィールドの機械化）。本変更は prompt /
  template の記述規律に留め、typed schema を変更しない。
- 判定チャネル・verdict 導出・output gate の挙動変更（verdict-channel-unification の成果を変えない）。
- harness の write-allowlist / request hash guard / revision 束縛。
- initial message builder の構造変更（5 部構成と矛盾する文言の追随修正のみ許可）。
- `specrunner/rules/`（プロジェクト知識注入）の内容整備。
- fixer の finding 選別ロジック（code-fixer の Fix 対応方針など）の意味変更（Open Questions 参照）。

## Decisions

### D1: 全 `*-system.ts` を単一の 5 部構成骨格へ統一する

各 system prompt の base 文字列を `## Question` → `## Contract` → `## Method` → `## Evidence` →
`## Completion` の 5 節に統一する。各節の役割:

1. **Question** — この step が答える唯一の問い（1 段落）。stage 表・役割の重複語りを廃し、
   pipeline 全体像は PIPELINE_MAP に委ねる。各 step の Question は request の表に従う。
2. **Contract** — 入力成果物（正典 / 上流成果物 / 参照情報の位置づけ）、出力（ファイルと完了報告）、
   write-set（編集可能パスの列挙 1 回）。現行の path-fence・禁止事項散文をここに圧縮する。
3. **Method** — 問いに答える手順。step 固有の観点は 5 個以内に絞る。
4. **Evidence** — `EVIDENCE_DISCIPLINE` の埋め込み + step 固有の evidence 要求。
5. **Completion** — 完了報告の形式（既存の COMPLETION_DIRECTIVE / judge contract を継承）+
   `CAUSE_CLASSIFICATION`。

**Rationale**: 事故由来の個別ルールを「一般規律（Evidence / Cause）+ step 固有の少数観点（Method）」に
再配置することで、事前列挙できない新種の欠陥にも「確認していないことを green と区別する」一般規律が
種類を問わず作用する。節構成の統一は prompt 間の整合を機械テストで固定可能にする。

**Alternatives considered**:
- *事故パターン別のルール追記を継続する* → 却下。prompt 間整合の維持コストが規模で破綻しており、
  既に stale な step 列挙・空節・形式 drift が発生している。個別パッチは既知パターンにしか作用しない。
- *骨格を新 step のみに適用し既存 prompt を温存する* → 却下。二重構造の併存は drift の温床であり、
  共有 fragment の単一ソース性が成立しない。

### D2: 横断規律を新しい leaf fragment に集約する

`src/prompts/` に依存を持たない leaf module として以下を新設する:

- `PIPELINE_MAP` — 現行の全 step（request-review / design / spec-review / spec-fixer / test-case-gen /
  test-materialize / implementer / verification / build-fixer / code-review / code-fixer /
  custom-reviewer / regression-gate / conformance / adr-gen / pr-create）の一覧と各 step の一行責務。
- `EVIDENCE_DISCIPLINE` — verified / derived / unverified の根拠区分、unverified の明示列挙義務
  （無い場合 None）、空集合・全 skip は「判定不能」、数値パラメータの類推は unverified 申告。
- `CAUSE_CLASSIFICATION` — request-gap / derivation-gap / implementation-defect / harness-defect /
  operational の 5 分類（evidence report の記述規律。typed schema は変更しない）。
- `COVERAGE_GATE_INTEGRITY` — coverage gate 回避禁止の単一ソース文言。

配置: `PIPELINE_MAP` は独立 leaf `src/prompts/pipeline-map.ts` に置き、`rules.ts` と stage 表を持つ
prompt が import する。残る 3 規律は既存の共有 fragment ホーム `src/prompts/fragments.ts` に追加する。
依存方向は一方向（prompt → fragment、rules.ts → pipeline-map）を維持し循環を作らない。

**Rationale**: 単一ソース化が drift の根治策。leaf 化で循環依存を避け、テストが定数を直接 import して
全 prompt 出力に対する包含検査（drift-guard）を書ける。`fragments.ts` は既存の共有規律ホームであり、
新規規律もここに集約するのが一貫する。

**Alternatives considered**:
- *4 規律を 1 つの新 module にまとめる* → 却下寄り。PIPELINE_MAP を rules.ts から import する際に
  discipline 群も巻き込むのを避け、関心の分離のため PIPELINE_MAP のみ独立 leaf にする。
- *規律を各 prompt にインライン重複させる（fragment 化しない）* → 却下。単一ソース性が崩れ、
  本変更が解こうとしている drift をそのまま再生産する。

### D3: 合成機構は既存 `buildSystemPrompt` を流用し、共有定数の既存包含を保存する

5 節見出しは base 文字列に順序どおり記述する。共有定数は該当節に埋め込む:
`EVIDENCE_DISCIPLINE` は `## Evidence` 直下、`CAUSE_CLASSIFICATION` は `## Completion` 内、
`PIPELINE_MAP` は stage 一覧が必要な prompt の該当節、`COVERAGE_GATE_INTEGRITY` は fixer の Contract。
`## Completion` は常に最後の節とし、既存の `COMPLETION_DIRECTIVE`（producer）/
`COMPLETION_REPORT_LINE` + `COMPLETION_NO_EARLY_STOP_LINE`（judge）は現行どおり継承する。
`COMMIT_DISCIPLINE`（git 操作禁止）は write-set の一部として Contract 節に移す。

**制約（保存すべき既存包含）**: 次の定数の prompt 出力への包含は本変更後も維持する。これにより
`verdict-channel-unification.test.ts`（protected）と `fragment-coverage.test.ts` が無改変で green に
留まる:
- judge prompt の `SEVERITY_DEFINITION` / `REQUEST_REVIEW_SEVERITY_DEFINITION` /
  `DECISION_NEEDED_DEFINITION` / `OBSERVATION_DEFINITION` / `VERDICT_BLOCKING_RULES` / `PIPELINE_RULES`。
- producer 8 prompt の `COMPLETION_DIRECTIVE`、judge 4 prompt の completion 2 行。
- provider-neutral 制約（`report_result` / `end_turn` / 旧 completion 文言を含まない）。
- 新 fragment（EVIDENCE_DISCIPLINE / CAUSE_CLASSIFICATION）は severity 署名文言を **再掲しない**
  （TC-010「severity 文言が judge-rules.ts 以外に存在しない」を破らないため）。

**Rationale**: 判定チャネルの単一ソース性は既に protected test で固定されている。骨格再構成は
これらの定数を「別の見出し配下へ移動する」だけで、包含関係（substring）は保存する。移動は
`toContain(定数)` 型テストに影響しない。

**Alternatives considered**:
- *judge contract を新規に書き直す* → 却下。verdict-channel-unification の単一ソースを壊し、
  protected test を無改変で通せなくなる。

### D4: PIPELINE_MAP を stage 一覧の単一ソースにする

stage 表を持っていた 3 prompt（design / implementer / test-materialize）の手書き表を削除し、
必要な箇所に `PIPELINE_MAP` を埋め込む。`rules.ts` の「Pipeline Structure」節（9 step 誤記を含む）を
`PIPELINE_MAP` 由来に置換する。

**Rationale**: request R1.3 / R5。単一ソースにすれば stale な step 列挙・件数誤記が構造的に発生し得ない。

**Alternatives considered**:
- *rules.md だけを単一ソースにし prompt には stage を書かない* → 部分採用。stage 一覧を必要とする
  prompt のみ PIPELINE_MAP を埋め込み、他は rules.md（PIPELINE_MAP 埋め込み済み）に委ねる。
  「独立 stage 表 0 件」を満たす限り、全 prompt への埋め込みは強制しない。

### D5: output template を「形式のみ」に純化する（channel ownership 確立）

R6 のチャネル所有権に従い template から semantic content を排除する:

- 4 result template（request-review / spec-review / review-feedback / conformance）の HTML コメント内
  「CLI の判定: decision-needed → escalation …」の verdict 導出規則行を削除する。evidence report の
  必須セクション（`## 検証した項目` / `## 検証できなかった項目` / `## Findings 詳細`）と
  「verdict は CLI が typed findings から導出する／この file に verdict 行を書かない」という
  **所有・形式の宣言**は保持する（これは判定基準ではない）。
- `TEST_CASES_TEMPLATE` の HTML コメント内 Category 判定表 / Priority 判定表 / result 判定表を削除し、
  形式要件（TC 見出し形式・必須カラム名 Category/Priority/Source・GWT 構造・Summary/Result anchor）のみ残す。
  判定基準は test-case-gen system prompt（Method 節）を単一ソースとする。
- `SPEC_EXEMPT_NOTE` から「Downstream reviewers (spec-review, conformance): …」の行動指示ブロック
  （HTML コメント・本文の両方）を削除し、SPEC_EXEMPT_MARKER と人間向け説明のみに縮小する。
  免除時の reviewer 挙動は各 reviewer の system prompt が SPEC_EXEMPT_MARKER 検出で担う（現行維持）。

**Rationale**: system prompt が判定基準（semantic content）を単一所有し、template は出力の形のみを
所有する分離を確立する。重複は drift の源であり、TEST_CASES の判定表は test-case-gen prompt と重複している。

**保存すべき挙動**: 上記の削除は evidence 必須セクションと機械 parse anchor を保存するため、
code-review content-format gate（TC-005〜TC-007）と output gate は無改変で green のまま。
`SPEC_EXEMPT_NOTE` は縮小後も SPEC_EXEMPT_MARKER を含み、空の `## Requirements` を持たず、
SPEC_TEMPLATE と異なる（step-output-templates.test.ts の該当 assertion を維持）。

**Alternatives considered**:
- *「CLI の判定」導出行を template に残す* → 却下。verdict 判定基準の重複であり、R6 の受け入れ基準
  「template に verdict 判定基準が存在しない」をテストで固定できない。

### D6: `architecture/` の repo 固有参照を可搬表現へ置換する

`design-system.ts` の litmus 節の `architecture/` 名指しを「プロジェクトの構造定義（型・状態機械・
不変条件）を確認してよい」に置換する。CLI 組み込み prompt が名指しできるのは製品所有資源
（`specrunner/` 配下・change folder 成果物・result / template ファイル）のみとする。

**Rationale**: specrunner は他プロジェクトに install されて動く製品。`architecture/` は本 repo 固有で
可搬でない。R4 / グローバル規律「CLI 組み込み prompt に repo 固有資源を参照させない」。

**Alternatives considered**: なし（可搬性の要請は非交渉）。

### D7: 挙動保存の契約とスコープ境界

本変更は system prompt / template の **記述** のみを再構成し、次を一切変更しない:
判定導出（`judge-verdict.ts`）、executor、output gate（`output-verify.ts` / `output-contract`）、
typed schema、routing / verdict。`src/core/step/__tests__/` の判定導出・executor・output gate 系
テストは**無改変で green** を維持する（骨格再構成が routing / gate 挙動を変えない証明）。

**Rationale**: request の受け入れ基準・スコープ外。骨格の価値は「記述規律の一般化」にあり、
実行時挙動は不変であるべき。

### D8: drift-guard テスト戦略

受け入れ基準を固定する新規テストを追加する（既存の protected test は無改変）。全 prompt 出力を
配列で列挙し反復検査する:

- 5 節見出しの包含（15 prompt すべて）。
- 独立 stage 表マーカー（`Pipeline Position` / `stage N:`）の不在 + stage 一覧を持つ出力の
  PIPELINE_MAP 包含。
- EVIDENCE_DISCIPLINE / CAUSE_CLASSIFICATION の全 agent prompt 包含。
- COVERAGE_GATE_INTEGRITY の build-fixer / code-fixer 包含 + 単一ソース性。
- `architecture/` の全 prompt 出力での不在（grep 相当）。
- rules.ts の PIPELINE_MAP 一致・空「共通禁止:」節の不在。
- producer / fixer prompt の write-set 宣言の存在。
- template 出力に verdict / Category / Priority 判定基準・Scores 表（Score / Weight）・他 agent 行動指示が
  存在しないこと（形式要件のみ許可）。

既存の `coverage-gate-prohibition.test.ts` / `spec-exempt-prompt.test.ts` /
`fragment-coverage.test.ts` は、参照するキーワード・定数を新骨格が保持することで極力無改変に保つ。
やむを得ず更新する場合は「判定導出・executor・output gate テスト」に該当しないもの
（template 内容テスト等）に限る。

**Rationale**: 受け入れ基準はすべてテスト固定を要求している。反復検査（配列駆動）は新 step 追加時にも
自動で網羅を維持し、drift を将来にわたり抑止する。

## Risks / Trade-offs

- [prompt 文言の大幅改稿で既存の prompt 内容テストが割れる] → D3 の「保存すべき既存包含」により
  共有定数の substring を保存し、protected test と fragment-coverage を無改変で通す。更新が必要な
  テストは template 内容テスト等（非 protected）に限定し、design 上で明示する。
- [EVIDENCE_DISCIPLINE を全 prompt に埋め込むことによる prompt 肥大] → 受容。これは本変更の中核価値
  であり、単一ソースなので保守コストは 1 箇所に集約される。
- [rules.md 責任範囲表と各 prompt の write-set の二重管理による drift] → 受容。rules.md は全 agent が
  読む人間可読の共有台帳、write-set は prompt 内の契約宣言という役割差がある。両者の整合は drift-guard
  テスト（step 集合の一致）で部分的に担保する。
- [「CLI の判定」行削除で step-output-templates.test.ts の一部 assertion が割れる] → 該当 assertion
  （template が decision-needed 導出注記を含む、の検査）は R6 が意図的に不要化するもの。非 protected の
  template 内容テストなので、絶対条件（verdict-channel-unification の TC-003/TC-004）を割らない範囲で
  当該 assertion を反転更新する。protected test は無改変。
- [test-materialize の 6 stage 表を PIPELINE_MAP（16 step）に置換すると粒度が変わる] → 受容。
  PIPELINE_MAP は正規の全体像であり、6 stage 表はそもそも他 prompt と不整合な独自表だった。

## Open Questions

- code-fixer system prompt の「Fix カラム別の対応（Fix: yes / Fix: no）」は、review-feedback が
  typed evidence report 化した現在では参照先（Fix カラム）が存在せず orphan の可能性がある。本変更は
  fixer の finding 選別挙動を変えないスコープのため、当該記述は**意味を変えずに Method へ移送**し、
  削除・改変はしない。Fix カラム前提の是非は別 request で扱う。
- request-generate は request→PR pipeline の step ではない utility だが、R2 の Question 表に含まれる。
  本設計では 5 部構成に合わせるが、その write-set は「stdout（request.md 本文）・ファイル書き込みなし」
  とする。pipeline step 前提の文言（rules.md Read 指示など）が実行文脈と噛み合うかは実装時に確認する。
