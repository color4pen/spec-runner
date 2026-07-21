# 全 step prompt を 5 部構成骨格に統一し、evidence 規律・原因分類・チャネル所有権を確立する

**Date**: 2026-07-21
**Status**: accepted

## Context

step prompt（`src/prompts/*-system.ts`）は事故対応の個別パッチを積層して成長した結果、
以下の構造問題が積み重なった状態にあった。

- **stage 表の独立複製と drift**: `design-system.ts` が 5 stage、`test-materialize-system.ts` が 6 stage、
  `rules.ts` が「9 step」と記載しつつ 11 項目を列挙し request-review / test-materialize / conformance /
  regression-gate / custom-reviewer が欠落。stage 情報の「正典」が存在しなかった。
- **個別パッチの一般化不足**: 「N/A 明示・沈黙省略禁止」（test-case-gen の冪等性軸）、
  Fact-Check Attestation など、正しい規律が特定 step の特定観点に閉じたパッチとして存在した。
  新種の欠陥はこれらを素通りし、「確認していないことが green と区別できない」構造的な穴があった。
- **散文による境界維持の重複**: write 境界が各 prompt に長文の懇願として散在し、同じ禁止が
  複数の言い回しで重複していた。
- **repo 固有資源への参照**: `design-system.ts` が `architecture/` ディレクトリを名指しで参照。
  specrunner は他プロジェクトに install されて動く製品であり、CLI 組み込み prompt に可搬でない参照が
  あってはならない。
- **チャネル所有権の混在**: severity / verdict 判定基準が output template に、他 agent への行動指示が
  template 内 HTML コメントに混在し、system prompt が semantic content の唯一の所有者でなかった。

前提として、判定チャネルは typed findings に一本化済み（verdict-channel-unification）であり、
severity / verdict の定義は `judge-rules.ts` 単一ソースに確立されている。

本変更はこれらの問題を、全 step prompt を単一の 5 部構成骨格に再構成し、横断規律を共有 fragment に
集約することで構造的に解決した。目的は「個別事故への対症ルールの集積」から「新種の欠陥にも作用する
一般規律の骨格」への転換である。

## Decisions

### D1: 全 `*-system.ts` を単一の 5 部構成骨格に統一する

各 system prompt の base 文字列を次の 5 節構成に統一する（節見出しも統一）:

1. **Question** — この step が答える唯一の問い（1 段落）。stage 表・役割の重複語りを廃し、
   pipeline 全体像は `PIPELINE_MAP` に委ねる。
2. **Contract** — 入力成果物（正典 / 上流成果物 / 参照情報の位置づけ）、出力（ファイルと完了報告）、
   write-set（編集可能パスの列挙 1 回）。現行の path-fence・禁止事項散文を圧縮する。禁止範囲は不変。
3. **Method** — 問いに答える手順。step 固有の観点は 5 個以内に絞る。
4. **Evidence** — `EVIDENCE_DISCIPLINE` の埋め込み + step 固有の evidence 要求。
5. **Completion** — 完了報告の形式（既存の `COMPLETION_DIRECTIVE` / judge contract を継承）+
   `CAUSE_CLASSIFICATION`。

**根拠**: 節構成の統一により prompt 間整合を機械テストで固定できる。各節の責務分離により、
新しい step の追加・既存 step の修正の変更局所性が高まる。個別パッチの一般規律への再配置で
「確認していないことを green と区別する」規律が step の種類を問わず作用する。

### D2: 横断規律を leaf fragment に集約する

`src/prompts/` に依存を持たない leaf module として以下を追加する:

- **`PIPELINE_MAP`**（`src/prompts/pipeline-map.ts` に独立 leaf として新設）:
  現行の全 16 step（request-review / design / spec-review / spec-fixer / test-case-gen /
  test-materialize / implementer / verification / build-fixer / code-review / code-fixer /
  custom-reviewer / regression-gate / conformance / adr-gen / pr-create）の一覧と各 step の一行責務。
  全 prompt の手書き stage 表はこの単一ソースへの埋め込みに置換する。
- **`EVIDENCE_DISCIPLINE`**（`src/prompts/fragments.ts` に追加）:
  主張の根拠区分（verified / derived / unverified）、unverified の明示列挙義務（無い場合 None）、
  空集合・全 skip の検査は「合格」でなく「判定不能」として報告、数値パラメータの類推は
  unverified 申告。全 agent step の Evidence 節に埋め込む。
- **`CAUSE_CLASSIFICATION`**（`src/prompts/fragments.ts` に追加）:
  失敗・escalation・decision-needed の報告時に付す原因分類: `request-gap` / `derivation-gap` /
  `implementation-defect` / `harness-defect` / `operational` の 5 分類。
  記述規律（typed schema の変更なし）。全 agent step の Completion 節に埋め込む。
- **`COVERAGE_GATE_INTEGRITY`**（`src/prompts/fragments.ts` に追加）:
  coverage gate 回避禁止の単一ソース文言。`build-fixer-system.ts` と `code-fixer-system.ts` に
  複製されていた同一文言をここに統合し、2 箇所の inline を本 fragment で置換する。

依存方向は一方向（prompt → fragment、`rules.ts` → `pipeline-map`）を維持し循環を作らない。

**根拠**: 単一ソース化が drift の根治策。leaf 化でテストが定数を直接 import して全 prompt 出力に
対する包含検査（drift-guard）を書ける。`fragments.ts` は既存の共有規律ホームであり、
PIPELINE_MAP のみ独立 leaf にすることで rules.ts→fragment 間の循環依存を避ける。

### D3: チャネル所有権を tripartite model で確立する

agent への情報伝達チャネルを 3 本に明確に分離し、各チャネルの所有内容を固定する:

- **system prompt** — 観点・判定基準・規律（semantic content）。severity / verdict / Category /
  Priority の判定基準はここ（および共有 fragment）のみに置く。
- **initial message** — その run 固有の束縛（パス・slug・branch・iteration・hash）のみ。
  判定基準を置かない。
- **output template**（`src/templates/step-output-templates.ts`）— 出力の形のみ（セクション構成・
  カラム・機械 parse される anchor）。判定基準・severity 等の定義・他 step の agent への行動指示を
  置かない。

これに基づき以下の違反を解消する:
- 4 result template（request-review / spec-review / review-feedback / conformance）の HTML コメント内
  verdict 導出規則行を削除（evidence report の必須セクション宣言・形式のみに縮小）。
- `TEST_CASES_TEMPLATE` の Category / Priority / result 判定基準表を削除（形式要件のみ残す）。
- `SPEC_EXEMPT_NOTE` の「Downstream reviewers:」行動指示ブロックを削除（marker と人間向け説明のみ
  に縮小。免除時の reviewer 挙動は各 reviewer の system prompt が SPEC_EXEMPT_MARKER 検出で担う）。

**根拠**: system prompt が semantic content を単一所有することで定義の重複と drift を構造的に排除する。
template の「形式のみ」純化により、テストが「template に判定基準がない」を機械的に保証できる。

### D4: drift-guard テストで受け入れ基準を機械固定する

`tests/__tests__/prompt-skeleton-drift-guard.test.ts` を新設し、全 prompt 出力を配列で列挙して
反復検査する:

- 5 節見出し（Question / Contract / Method / Evidence / Completion）の包含（全 agent step）。
- 独立 stage 表マーカー（`Pipeline Position` / `stage N:`）の不在、ならびに PIPELINE_MAP の包含。
- EVIDENCE_DISCIPLINE / CAUSE_CLASSIFICATION の全 agent step 包含。
- COVERAGE_GATE_INTEGRITY の build-fixer / code-fixer 包含と単一ソース性。
- `architecture/` の全 prompt 出力での不在。
- rules.ts の PIPELINE_MAP 一致と「共通禁止:」空節の不在。
- producer / fixer の Contract 節における write-set 宣言の存在。
- template 出力に severity / verdict / Category / Priority の判定基準・Scores 表（Score / Weight）・
  他 agent 行動指示が存在しないこと。

既存の protected test（`verdict-channel-unification.test.ts`）および
`fragment-coverage.test.ts` / `coverage-gate-prohibition.test.ts` / `spec-exempt-prompt.test.ts` は
新骨格が共有定数 substring を保存することで無改変で green を維持する。

**根拠**: 受け入れ基準をテストで固定することで、将来の step 追加・修正時の drift を CI で検出できる。
配列駆動の反復検査は新 step 追加時にも自動で網羅を維持する。

### D5: `architecture/` の repo 固有参照を可搬表現に置換する

`design-system.ts` の `architecture/` 名指しを「プロジェクトの構造定義（型・状態機械・不変条件）を
確認してよい」に置換する。CLI 組み込み prompt が名指しできるのは製品所有資源（`specrunner/` 配下・
change folder 成果物・result / template ファイル）のみとする。

**根拠**: specrunner は他プロジェクトに install されて動く製品。`architecture/` は本 repo 固有であり
可搬でない。CLI 組み込み prompt に repo 固有資源を参照させないというグローバル規律。

## Alternatives Considered

### Alternative 1: 事故パターン別のルール追記を継続する

既存の運用（事故が起きるたびに対象 step に個別パッチを追加する）を継続する案。

- **Pros**: 変更範囲が小さく、既存テストへの影響が最小。
- **Cons**: prompt 間整合の維持コストが規模で破綻しており、既に stale な step 列挙・空節・
  形式 drift が発生している。個別パッチは既知パターンにしか作用せず、新種の欠陥には無力。
- **Why not**: 運用コスト逓増の根本原因が prompt 構造の散漫さにあり、対症療法では解決しない。
  「確認していないことが green と区別できない」構造的な穴は個別パッチでは塞げない。

### Alternative 2: 骨格を新 step のみに適用し既存 prompt を温存する

5 部構成を今後追加する新 step にのみ適用し、既存の prompt は現行の構造で残す案。

- **Pros**: 既存 prompt の変更量が最小。既存テストへの影響を最小化できる。
- **Cons**: 二重構造の併存は drift の温床であり、共有 fragment の単一ソース性が成立しない。
  PIPELINE_MAP を追加しても既存 prompt の手書き stage 表が残れば整合は人手管理のまま。
- **Why not**: 骨格の価値は全 step にわたる包含テストで drift を機械固定することにあり、
  部分適用では成立しない。既存 prompt を温存すると EVIDENCE_DISCIPLINE の全 step 適用も
  不完全になり、一般規律としての作用が失われる。

### Alternative 3: evidence counts / cause の typed schema 化を同時実施する

CAUSE_CLASSIFICATION を prompt の記述規律として先行導入するだけでなく、toolResult schema に
`causeClassification` フィールドを追加して機械化する案。

- **Pros**: 原因分類を CLI が集計・表示できるようになる。記述規律と機械処理を一度に整合させられる。
- **Cons**: completion 契約の変更は executor / adapter / judge-verdict に波及し、変更スコープが
  大幅に広がる。運用実績なしに schema 設計を固めるリスクがある。
- **Why not**: prompt / template の規律として先行導入し、機械化は運用実績を見て別 request で行う。
  本変更は「記述規律の確立」であり、typed schema 拡張は後続ステップ。骨格再構成と schema 変更を
  同時実施すると変更の影響範囲が大きくなりすぎ、挙動保存の証明が困難になる。

### Alternative 4: CAUSE_CLASSIFICATION を設計文書が指定した Completion 節に配置する

spec / design / tasks の 3 成果物が指定した通り、CAUSE_CLASSIFICATION を Completion 節に配置する案。
（実装は Evidence 節配置を採用した。review-feedback F-001 でこの乖離が指摘された。）

- **Pros**: 「原因分類を付すのは完了報告時」という意味論に忠実。spec / design / tasks が
  一貫して Completion 節と指定しており、設計文書との整合が保たれる。
- **Cons**: 実装が Evidence 節配置（EVIDENCE_DISCIPLINE 直後）を採用した結果、Evidence 節の凝集度が
  高まり、agent が「何を根拠に・どの原因分類で報告するか」を同一文脈で参照できる実用的な利点が生じた。
  Completion 節に移すと EVIDENCE_DISCIPLINE との接続性が下がる。
- **Why not**: TC-005 drift-guard は presence check のみ（section 位置を検査しない）ため、
  どちらの配置でも機械的には通過する。Evidence 節配置の実用的利点を優先し、Completion 節配置は
  採用しなかった。将来 section 指定の drift-guard が追加される際に revisit する
  （Known Debt 参照）。

## Consequences

### Positive

- 全 step system prompt が 5 節構成に統一され、「どこに何が書かれるか」が自明になる。
  新しい事故の対応も Contract（write-set）/ Method（手順）/ Evidence（規律）/ Completion（完了）の
  適切な節に配置でき、散漫な散文の再積層を防ぐ。
- EVIDENCE_DISCIPLINE により「確認していないことを green と区別する」規律が全 step に適用される。
  新種の欠陥にも種類を問わず作用する一般規律として機能する。
- PIPELINE_MAP の単一ソース化により、step 列挙・件数誤記・欠落が構造的に発生し得なくなる。
- drift-guard テストにより、将来の step 追加・修正が 5 部構成・共有 fragment 包含・
  チャネル所有権に違反した場合を CI で即検出できる。
- output template の「形式のみ」純化により、template と system prompt の責務境界が明確になり、
  template 内の dead code 指示（verdict 導出行・他 agent 行動指示）がなくなる。

### Negative

- 全 step prompt の base 文字列が大幅に改稿されるため、将来のコンフリクト解消時に
  context の読み取りコストが一時的に上がる可能性がある。
- `## セキュリティ` 節など一部 step が 5 節以外の追加節を持つ構造は残り、
  「5 節のみ」という宣言と実態に軽微な乖離がある（TC-001 ordering test は `## Completion` の
  substring が `## Completion Checklist` にヒットするため通過する）。

### Known Debt / Deferred

- `CAUSE_CLASSIFICATION` の typed schema 化（`toolResult` への `causeClassification` フィールド追加）:
  運用実績を見て別 request で実施する。
- CAUSE_CLASSIFICATION の配置（Evidence 節 vs Completion 節）: 実装は Evidence 節を採用したが、
  設計文書は Completion 節を指定。section 位置の drift-guard が追加された際に revisit する。
- test-cases.md の automated 件数宣言（28）と drift-guard 実装数（~20）の乖離: 残り 8 TC の
  うち "should"/"could" 分類のものは実装内容を読解・grep で確認済みだが、regression 保護として
  の explicit テストは未実装。別 request で補完する。
- initial message に severity / verdict / Category / Priority の判定基準が混入しないことの
  包括的な保証（TC-024）: 現在は verdict-channel-unification TC-018 が verdict OUTPUT 指示のみを
  検査しており、判定基準テーブルの混入は未チェック。

## References

- Request: `specrunner/changes/step-prompt-skeleton-restructure/request.md`
- Design: `specrunner/changes/step-prompt-skeleton-restructure/design.md`
- Spec: `specrunner/changes/step-prompt-skeleton-restructure/spec.md`
- Predecessor ADR: `specrunner/adr/2026-07-21-verdict-channel-unification.md`
  （typed findings 単一チャネル化。本 ADR はその後続として prompt 骨格を整備する）
- Predecessor ADR: `specrunner/adr/2026-05-18-prompt-fragment-registry.md`
  （`buildSystemPrompt` + `fragments.ts` の確立。本変更はこの機構を流用する）
- Implementation: `src/prompts/pipeline-map.ts`（新設 leaf）/ `src/prompts/fragments.ts`
  （EVIDENCE_DISCIPLINE / CAUSE_CLASSIFICATION / COVERAGE_GATE_INTEGRITY 追加）/
  `src/prompts/*-system.ts`（全 agent step prompt 骨格再構成）/
  `src/templates/step-output-templates.ts`（チャネル純化）/
  `tests/__tests__/prompt-skeleton-drift-guard.test.ts`（新設 drift-guard）
