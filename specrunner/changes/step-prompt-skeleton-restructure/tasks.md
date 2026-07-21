# Tasks: 全 step prompt を 5 部構成骨格に再構成し、evidence 規律と原因分類を共通化する

<!--
実装順序の指針:
  T-01（新 fragment）→ T-02（rules.ts）→ T-03〜T-06（各 prompt 群の再構成）→ T-07（template 純化）
  → T-08（initial message 追随）→ T-09（drift-guard テスト）→ T-10（既存テスト整合）→ T-11（最終検証）。
禁止範囲・routing・gate 挙動は不変。判定導出/executor/output gate の既存テストは無改変で green を保つこと。
-->

## T-01: 横断規律の共有 leaf fragment を新設する

- [ ] `src/prompts/pipeline-map.ts` を新設し、`PIPELINE_MAP` 定数（プロジェクト内 import を持たない leaf）を
      export する。内容は現行の全 step の一覧と各 step の一行責務:
      request-review / design / spec-review / spec-fixer / test-case-gen / test-materialize / implementer /
      verification / build-fixer / code-review / code-fixer / custom-reviewer / regression-gate /
      conformance / adr-gen / pr-create。
- [ ] `src/prompts/fragments.ts` に `EVIDENCE_DISCIPLINE` を追加する。少なくとも次を明記する:
      (a) 主張の根拠区分 verified（実測。コマンド / file:line を引用可）/ derived（上流成果物からの導出。
      出典を引用可）/ unverified（未確認）、(b) unverified の主張は明示列挙し、無い場合は「None」と明記
      （沈黙の省略禁止）、(c) 検査対象が空集合・全 skip の検査は「合格」ではなく「判定不能」として報告、
      (d) 数値パラメータ（timeout / limit / threshold 等）の提案は verified か unverified のいずれかで、
      類推は unverified として申告。
- [ ] `src/prompts/fragments.ts` に `CAUSE_CLASSIFICATION` を追加する。失敗・escalation・decision-needed の
      報告時に付す原因分類 5 種を列挙: `request-gap` / `derivation-gap` / `implementation-defect` /
      `harness-defect` / `operational`。これは evidence report の記述規律であり typed schema を変更しない旨を明記。
- [ ] `src/prompts/fragments.ts` に `COVERAGE_GATE_INTEGRITY` を追加する。coverage gate 回避禁止の単一ソース
      文言（既存の build-fixer / code-fixer の文言と意味等価）で、少なくとも「テストの削除・移設」
      「dead code / dead export の追加」「coverage 設定（include / exclude / threshold）の編集」の禁止を含む。
- [ ] 新 fragment は severity 定義の署名文言（例: 「本番障害、データ損失、セキュリティ侵害に直結」）を
      **再掲しない**（severity は judge-rules.ts が単一ソース）。

**Acceptance Criteria**:
- `PIPELINE_MAP` は 16 step すべてを列挙し、各 step に一行責務が付いている。
- `EVIDENCE_DISCIPLINE` は unverified 列挙義務（None 明記）と「空集合は判定不能」の 2 文言を含む。
- `CAUSE_CLASSIFICATION` は 5 分類の識別子を列挙する。
- `COVERAGE_GATE_INTEGRITY` は「テストの削除」「dead code」「coverage 設定」の 3 キーワードを含む。
- 4 定数は `src/prompts/` 内から循環なく import 可能（pipeline-map.ts はプロジェクト内 import を持たない）。
- `typecheck` が green。

## T-02: rules.ts の step 列挙を PIPELINE_MAP 由来にし、空節を除去し、責任範囲表を更新する

- [ ] `RULES_MD_CONTENT` の「Pipeline Structure」節（現行「9 step」誤記 + 11 項目列挙）を PIPELINE_MAP の
      埋め込みに置換する（`pipeline-map.ts` から import）。件数表記の手書きをやめる。
- [ ] 本文が空の「共通禁止:」節（現行 `rules.ts:66`）を削除する。
- [ ] 「責任範囲」表を現行 step 集合に更新する。少なくとも欠落している request-review / test-materialize /
      conformance / regression-gate / custom-reviewer の行を追加し、各 step の touch 可能 / 禁止領域を記載する。

**Acceptance Criteria**:
- `RULES_MD_CONTENT` は PIPELINE_MAP 定数を部分文字列として含む（step 列挙が単一ソース由来）。
- `RULES_MD_CONTENT` に「9 step」「11」等の手書き件数誤記が残らない。
- 本文の無い「共通禁止:」見出しが存在しない。
- 責任範囲表に request-review / test-materialize / conformance / regression-gate / custom-reviewer が含まれる。
- `typecheck` が green。

## T-03: producer 系 prompt を 5 部構成へ再構成する（design / test-case-gen / test-materialize / implementer / adr-gen）

- [ ] 各 base 文字列を `## Question` / `## Contract` / `## Method` / `## Evidence` / `## Completion` の
      5 節に統一する。各 step の Question は request.md の Question 表に従う。
- [ ] Contract 節に write-set（編集可能パスの列挙 1 回）を置き、既存の path-fence・禁止事項散文をここへ圧縮する
      （禁止範囲は不変）。git 操作禁止（COMMIT_DISCIPLINE 相当）も Contract に含める。
- [ ] Method 節に step 固有観点を 5 個以内で記述する。test-case-gen の「繰り返し実行・冪等性の軸」の観点自体は
      Method に残す（「N/A 明示・沈黙省略禁止」の一般則は EVIDENCE_DISCIPLINE 側へ移譲）。
- [ ] Evidence 節に `EVIDENCE_DISCIPLINE` を埋め込み、step 固有の evidence 要求を追記する。
- [ ] Completion 節で既存の `COMPLETION_DIRECTIVE` を継承し、`CAUSE_CLASSIFICATION` を含める。
- [ ] design prompt: stage 表（Pipeline Position）を削除し、pipeline 全体像は PIPELINE_MAP の埋め込みに置換する。
      litmus 節の `architecture/` 名指しを「プロジェクトの構造定義（型・状態機械・不変条件）を確認してよい」に
      置換する。spec-exempt の Completion Checklist 分岐（`type: chore` /
      `type: spec-change / new-feature` / `type: bug-fix / refactoring`、`Requirement を捏造しないこと`、
      SPEC_EXEMPT_MARKER 参照）は意味・文言を保持する。
- [ ] implementer prompt: 独立 stage 表を削除し、spec の量化子（exactly once / all / never 等）を grep 等で
      反証を試みてから完了宣言する観点を Method に含める。
- [ ] test-materialize prompt: 独立 6 stage 表を削除する。
- [ ] adr-gen prompt: ADR path 規律（adr-gen 以外で path を書かない等）は現行の意味を保持する。

**Acceptance Criteria**:
- design / test-case-gen / test-materialize / implementer / adr-gen の各 SYSTEM_PROMPT 出力が 5 節見出しを
  この順で含む。
- 5 prompt 出力に `Pipeline Position` / `stage 1:` 等の独立 stage 表マーカーが存在しない。
- 5 prompt 出力が EVIDENCE_DISCIPLINE と CAUSE_CLASSIFICATION を含む。
- 5 prompt すべての Contract に write-set 宣言が存在する。
- DESIGN_SYSTEM_PROMPT に `architecture/` が存在しない。
- `spec-exempt-prompt.test.ts` が参照する design prompt の文言（`type: chore` 等・`Requirement を捏造しないこと`・
  SPEC_EXEMPT_MARKER）が保持され、当該テストが green。
- 既存の COMPLETION_DIRECTIVE 包含（producer）が保持され `fragment-coverage.test.ts` の該当項目が green。
- `typecheck` が green。

## T-04: fixer 系 prompt を 5 部構成へ再構成し、coverage gate 文言を単一ソース化する（spec-fixer / code-fixer / build-fixer）

- [ ] 各 base を 5 節構成へ統一する（Question は request.md 表: fixer は「指定された findings / failures の
      解消のみを行えたか」）。
- [ ] Contract 節に write-set を置き、既存の禁止事項散文を圧縮する（禁止範囲は不変）。
- [ ] build-fixer / code-fixer の重複した coverage gate 回避禁止文言を削除し、`COVERAGE_GATE_INTEGRITY` の
      埋め込みに置換する。build-fixer の lcov 変更行 gate 手順（verification-result.md 参照・変更行確認・
      実テスト追加が唯一の正当な修正）は意味を保持する。
- [ ] code-fixer の finding 選別記述（Fix 対応方針）は意味を変えずに Method 節へ移す（削除・改変しない）。
- [ ] Evidence 節に EVIDENCE_DISCIPLINE、Completion 節に COMPLETION_DIRECTIVE 継承 + CAUSE_CLASSIFICATION。

**Acceptance Criteria**:
- spec-fixer / code-fixer / build-fixer の各 SYSTEM_PROMPT 出力が 5 節見出しを含む。
- BUILD_FIXER_SYSTEM_PROMPT と CODE_FIXER_SYSTEM_PROMPT が `COVERAGE_GATE_INTEGRITY` 定数を含む（単一ソース）。
- `coverage-gate-prohibition.test.ts` が参照するキーワード（`テストの削除` / `dead code` / `coverage 設定` /
  build-fixer の `verification-result.md` / `変更行` / `実テストを追加する`）が保持され、当該テストが green。
- 3 prompt の Contract に write-set 宣言が存在する。
- 3 prompt 出力が EVIDENCE_DISCIPLINE と CAUSE_CLASSIFICATION を含む。
- `typecheck` が green。

## T-05: judge 系 prompt を 5 部構成へ再構成する（request-review / spec-review / code-review / conformance / regression-gate / custom-reviewer）

- [ ] 各 base を 5 節構成へ統一する（Question は request.md 表に従う）。
- [ ] Contract 節に入力成果物の位置づけ（正典 / 上流成果物 / 参照情報）と write-set（result file のみ、
      read-only review）を置く。request-review は Fact-Check Attestation の attestation ファイル読み書き機構を
      現行のまま維持し、記述を Contract / Evidence 節に整理する。
- [ ] Method 節に step 固有観点を 5 個以内で記述する。
- [ ] Evidence 節に EVIDENCE_DISCIPLINE を埋め込む。
- [ ] Completion 節で既存の judge contract（`COMPLETION_REPORT_LINE` + `COMPLETION_NO_EARLY_STOP_LINE`、
      typed findings 形式、`SEVERITY_DEFINITION` / `REQUEST_REVIEW_SEVERITY_DEFINITION` /
      `DECISION_NEEDED_DEFINITION` / `OBSERVATION_DEFINITION` / `VERDICT_BLOCKING_RULES` / `PIPELINE_RULES` の
      埋め込み）を保持し、`CAUSE_CLASSIFICATION` を追加する。
- [ ] spec-review / conformance の SPEC_EXEMPT_MARKER 検出による免除挙動（vacuously satisfied 等）を保持する。
- [ ] custom-reviewer は judge contract frame（CLI 所有）を保持しつつ、ユーザー定義スロット（purpose / criteria /
      judgment / freeText）を 5 節骨格に収める。

**Acceptance Criteria**:
- 6 judge prompt 出力が 5 節見出しを含む。
- 各 judge prompt が `SEVERITY_DEFINITION`（request-review は `REQUEST_REVIEW_SEVERITY_DEFINITION`）を含む
  （`verdict-channel-unification.test.ts` TC-009 を無改変で green に保つ）。
- 各 judge prompt が verdict 行の出力を要求しない（TC-001 の禁止パターンを含まない）。
- 6 judge prompt 出力が EVIDENCE_DISCIPLINE と CAUSE_CLASSIFICATION を含む。
- `spec-exempt-prompt.test.ts`（spec-review / conformance の vacuously satisfied 等）が green。
- `fragment-coverage.test.ts` の PIPELINE_RULES / DECISION_NEEDED / OBSERVATION / VERDICT 包含項目が green。
- `typecheck` が green。

## T-06: request-generate prompt を 5 部構成へ再構成する

- [ ] base を 5 節構成へ統一する（Question は「入力を規格に適合した request.md に変換できたか」）。
- [ ] Contract の write-set は「stdout（request.md 本文）・ファイル書き込みなし」とする。
- [ ] Evidence 節に EVIDENCE_DISCIPLINE、Completion 節に CAUSE_CLASSIFICATION を含める。
      request.md の必須セクション・type / adr 推論などの既存の生成規律は Method 節に保持する。

**Acceptance Criteria**:
- REQUEST_GENERATE_SYSTEM_PROMPT 出力が 5 節見出しを含む。
- 既存の request.md 生成規律（必須セクション列挙・type / adr 推論）が保持されている。
- 出力が EVIDENCE_DISCIPLINE と CAUSE_CLASSIFICATION を含む。
- `typecheck` が green。

## T-07: output template を「形式のみ」に純化する（channel ownership）

- [ ] 4 result template（`REQUEST_REVIEW_RESULT_TEMPLATE` / `SPEC_REVIEW_RESULT_TEMPLATE` /
      `REVIEW_FEEDBACK_TEMPLATE` / `CONFORMANCE_RESULT_TEMPLATE`）の HTML コメントから
      「CLI の判定: decision-needed → escalation … / critical|high → needs-fix / else → approved」の
      verdict 導出規則行を削除する。evidence 必須セクション（`## 検証した項目` / `## 検証できなかった項目` /
      `## Findings 詳細`）と「verdict は CLI が typed findings から導出する／verdict 行を書かない」の
      所有・形式宣言は保持する。
- [ ] `TEST_CASES_TEMPLATE` の HTML コメントから Category 判定表 / Priority 判定表 / result 判定表を削除し、
      形式要件（TC 見出し形式 `### TC-{NNN}`・必須カラム名 Category/Priority/Source・GWT 構造・
      Summary section anchor・Result YAML anchor）のみ残す。
- [ ] `SPEC_EXEMPT_NOTE` から「Downstream reviewers (spec-review, conformance): …」の行動指示ブロック
      （HTML コメント・本文の両方）を削除し、SPEC_EXEMPT_MARKER と人間向け説明のみに縮小する。空の
      `## Requirements` を導入しないこと。

**Acceptance Criteria**:
- 4 result template 出力に verdict 導出の判定基準（severity → verdict の対応規則）が存在しない。
- 4 result template 出力が `## 検証した項目` / `## 検証できなかった項目` を保持する
  （`verdict-channel-unification.test.ts` TC-003 を無改変で green に保つ）。
- `TEST_CASES_TEMPLATE` 出力に Category / Priority / result の判定基準表が存在せず、Summary / Result anchor と
  TC 見出し形式・必須カラム名は保持されている。
- `SPEC_EXEMPT_NOTE` 出力が SPEC_EXEMPT_MARKER を含み、下流 reviewer への行動指示文を含まず、空の
  `## Requirements` を持たず、SPEC_TEMPLATE と異なる。
- `typecheck` が green。

## T-08: initial message builder の 5 部構成追随（最小限）

- [ ] 各 initial message builder（design / spec-review / test-case-gen / test-materialize / request-review /
      code-review / conformance / custom-reviewer / regression-gate 等）を確認し、5 部構成 system prompt と
      矛盾する文言（旧 stage 表・判定基準の混入等）があれば追随修正する。**構造変更は行わない**。
      判定基準を initial message に置かない（run 固有の束縛＝パス / slug / branch / iteration / hash のみ）。

**Acceptance Criteria**:
- initial message に severity / verdict / Category / Priority の判定基準が含まれない。
- `verdict-channel-unification.test.ts` の initial message 系 assertion（TC-001）が無改変で green。
- initial message builder の関数シグネチャ・呼び出し構造は不変。
- `typecheck` が green。

## T-09: drift-guard テストを追加する

- [ ] 全 15 system prompt 出力を配列で列挙し、各出力が 5 節見出し（Question/Contract/Method/Evidence/
      Completion）を含むことを固定するテストを追加する。
- [ ] 全 prompt 出力に独立 stage 表マーカー（`Pipeline Position` / `stage 1:` / `stage 2:` …）が存在せず、
      stage 一覧を持つ出力（design/implementer/test-materialize/rules.ts）が PIPELINE_MAP を含むことを固定する。
- [ ] 全 agent step 出力が EVIDENCE_DISCIPLINE を含み、CAUSE_CLASSIFICATION を含むことを固定する。
- [ ] BUILD_FIXER / CODE_FIXER が COVERAGE_GATE_INTEGRITY（単一ソース）を含むことを固定する。
- [ ] 全 prompt 出力に `architecture/` が存在しないことを固定する。
- [ ] RULES_MD_CONTENT が PIPELINE_MAP を含み、空「共通禁止:」節を持たないことを固定する。
- [ ] 全 producer / fixer prompt の Contract に write-set 宣言が存在することを固定する。
- [ ] output template 出力に severity / verdict / Category / Priority の判定基準・Scores 表（`Score` /
      `Weight`）・他 agent への行動指示が存在しないこと（形式要件のみ許可）を固定する。

**Acceptance Criteria**:
- 上記 8 種の新規テストが追加され、すべて green。
- テストは prompt 群を配列反復で検査し、新 step 追加時にも網羅が自動維持される構造である。
- `test` が green。

## T-10: 既存テストの整合（非 protected のみ更新、protected は無改変で green）

- [ ] `coverage-gate-prohibition.test.ts` / `spec-exempt-prompt.test.ts` / `fragment-coverage.test.ts` が
      参照するキーワード・定数を新骨格が保持していることを確認する。割れる場合は、判定導出 / executor /
      output gate に該当しないテスト（prompt / template 内容テスト）に限り最小限更新する。
- [ ] `step-output-templates.test.ts` のうち、template が verdict 導出注記（decision-needed）を含むことを
      要求する assertion を、T-07 の純化に合わせて反転（不在を固定）する。ただし evidence 必須セクション・
      SPEC_EXEMPT 系 assertion は保持する。
- [ ] `verdict-channel-unification.test.ts` / `judge-verdict.test.ts` / `executor-*.test.ts` /
      output gate 系テストは**一切変更しない**。

**Acceptance Criteria**:
- 判定導出（`verdict-channel-unification.test.ts` / `judge-verdict.test.ts`）・executor（`executor-*.test.ts`）・
  output gate（output-contract / output-verify 系）の既存テストが**無改変で green**。
- 更新したテストは prompt / template 内容テストに限られ、routing / gate 挙動を検証するテストを含まない。
- `test` が green。

## T-11: 最終検証

- [ ] `src/prompts/` の出力文字列に `architecture/` への参照が 0 件であることを grep で確認する。
- [ ] `typecheck` と `test` を実行し green を確認する。

**Acceptance Criteria**:
- `grep -r "architecture/" src/prompts/` 相当で該当が 0 件（コメント含む出力文字列）。
- `typecheck && test` が green。
- 受け入れ基準（request.md）の全項目が対応するテストで固定されている。
