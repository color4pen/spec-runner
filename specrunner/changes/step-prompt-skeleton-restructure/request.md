# 全 step prompt を 5 部構成の共通骨格に再構成し、evidence 規律と原因分類を共通化する

## Meta

- **type**: spec-change
- **slug**: step-prompt-skeleton-restructure
- **base-branch**: main
- **adr**: true

## 背景

step prompt（`src/prompts/*-system.ts`）は事故対応の個別パッチを積層して成長してきた結果、次の構造問題を抱えている。

1. **同一知識の独立複製と drift**: pipeline の step 構成の説明が prompt 間で複数バージョン併存している（design は 5 stage、test-materialize は 6 stage、rules.ts は 11 step を列挙しつつ request-review / test-materialize / conformance / regression-gate / custom-reviewer が欠落）。
2. **個別パッチの一般原則化不足**: 「該当なしでも N/A を明示、沈黙の省略禁止」（test-case-gen の冪等性軸）や Fact-Check Attestation など、正しい規律が特定 step の特定観点に閉じたパッチとして存在する。新種の欠陥はこれらの個別パッチをすり抜ける。確認していないことが green と区別できない出力（空集合チェックの pass 扱い、根拠のない数値の断定）が構造的に許容されている。
3. **散文による境界維持**: write 境界（「change folder 外を編集するな」「request.md を編集するな」）が各 prompt に長文の懇願として散在し、同じ禁止が複数の言い回しで重複している。
4. **repo 固有資源への参照**: design prompt が `architecture/` ディレクトリを名指しで参照している。specrunner は他プロジェクトに install されて動く製品であり、CLI 組み込み prompt が参照してよいのは製品自身が定義する資源（`specrunner/` 配下・change folder 成果物）のみである。
5. **維持コストの逓増**: 新しい事故のたびに個別 step へパッチを足す運用は、prompt 間の整合を人手で維持できない規模に達している。

本変更は全 step prompt を単一の 5 部構成骨格に再構成し、横断規律を共有 fragment に集約する。目的は「個別事故への対症ルールの集積」から「新種の欠陥にも作用する一般規律の骨格」への転換である。

## 現状コードの前提

- `src/prompts/design-system.ts:25-32` / `src/prompts/implementer-system.ts:14-21` / `src/prompts/test-materialize-system.ts:31-39` — それぞれ異なる stage 構成表を独立記載している
- `src/prompts/rules.ts:19-35` — 「9 step」と記載して 11 項目を列挙し、request-review / test-materialize / conformance / regression-gate / custom-reviewer が欠落している。同 66-67 行の「共通禁止:」は本文が空である
- `src/prompts/design-system.ts:133-136` — `architecture/` 配下の参照を指示している（repo 固有資源）
- `src/prompts/test-case-gen-system.ts:92-115` — 冪等性軸の「N/A 明示・沈黙省略禁止」規律が単一観点のパッチとして存在する
- `src/prompts/design-system.ts:155-179` — write 境界（path-fence）が複数セクションにわたる散文で記述されている
- `src/prompts/build-fixer-system.ts:24` / `src/prompts/code-fixer-system.ts:30` — coverage gate 回避禁止の同一文言が 2 箇所に複製されている
- `src/prompts/builder.ts` — buildSystemPrompt(base, fragments) の合成機構が存在する（本変更はこの機構をそのまま使う）
- 判定チャネルは typed findings に一本化済みであり、result md は evidence report である（verdict-channel-unification が前提。severity / resolution 定義は judge-rules.ts 単一ソース）

## 要件

### R1: 共有 fragment の新設（`src/prompts/` 配下の leaf module）

1. **EVIDENCE_DISCIPLINE** — 全 step 共通の根拠規律:
   - 出力中の主張は根拠区分を持つ: **verified**（実測。確認に使ったコマンド / file:line を引用できる）/ **derived**（上流成果物からの導出。出典を引用できる）/ **unverified**（未確認）
   - unverified の主張は明示列挙する。無い場合は「None」と明記する。沈黙の省略は禁止
   - 検査対象が空集合・全 skip だった検査は「合格」ではなく「判定不能」として報告する
   - 数値パラメータ（timeout / limit / threshold 等）の提案は verified（実測）か unverified（根拠なし）のいずれかであり、類推（「他の値と同等でよいはず」）は unverified として申告する
2. **CAUSE_CLASSIFICATION** — 失敗・escalation・decision-needed の報告時に原因分類を付す: `request-gap`（request の不足・曖昧）/ `derivation-gap`（上流成果物からの導出漏れ）/ `implementation-defect`（実装の欠陥）/ `harness-defect`（pipeline / CLI 側の問題）/ `operational`（運用・環境の問題）。分類は evidence report の記述規律であり、typed schema の変更は行わない
3. **PIPELINE_MAP** — 現行の全 step（request-review / design / spec-review / spec-fixer / test-case-gen / test-materialize / implementer / verification / build-fixer / code-review / code-fixer / custom-reviewer / regression-gate / conformance / adr-gen / pr-create）の一覧と各 step の一行責務。全 prompt の stage 表はこの単一ソースからの埋め込みに置換する
4. **COVERAGE_GATE_INTEGRITY** — coverage gate 回避禁止の文言を単一ソース化し、build-fixer / code-fixer の複製を置換する

### R2: 全 step system prompt を 5 部構成骨格に再構成

各 `*-system.ts` の base 文字列を次の節構成に統一する（節見出しも統一）:

1. **Question** — この step が答える唯一の問い（1 段落。stage 表・役割の重複語りを廃止し、PIPELINE_MAP を参照）
2. **Contract** — 入力成果物（それぞれの位置づけ: 正典 / 上流成果物 / 参照情報）、出力（ファイルと完了報告）、write-set（編集可能なパスの列挙 1 回。現行の path-fence・禁止事項散文はここに圧縮する。禁止の意味は変えない）
3. **Method** — 問いに答える手順。step 固有の観点は 5 個以内に絞る
4. **Evidence** — EVIDENCE_DISCIPLINE の埋め込み + step 固有の evidence 要求
5. **Completion** — 完了報告の形式（既存の COMPLETION_DIRECTIVE / judge contract を継承）+ CAUSE_CLASSIFICATION

各 step の Question は以下とする:

| step | Question |
|---|---|
| request-review | この request は単体で完結し、根拠の付いた正典か（現状断定は実コードと一致するか、受け入れ基準は観測可能か、量化子・数値・入口経路に根拠があるか） |
| design | request の意図が検証可能な実装計画に忠実に展開されているか（数値は実測根拠を持つか、検証経路は利用者が実際に打つコマンドか、既存機構の置換では置換前が検証していた項目の目録と行き先が示されているか） |
| spec-review | 成果物一式（design / tasks / spec）は request と矛盾なく、実装可能な仕様になっているか |
| test-case-gen | spec の全 Scenario と設計の検証点が、検証可能な TC に漏れなく落ちているか |
| test-materialize | 全 must TC が、対象プロジェクトのテスト設定で収集・実行されるテストコードになっているか |
| implementer | tasks.md の全タスクが実装されているか（spec の量化子 — exactly once / all / never 等 — は grep 等で反証を試みてから完了を宣言する） |
| code-review | 実装は正しいか（境界条件・エラー経路、既存機構の置換で消えた検証項目、削除・掃除系の check-then-act 競合） |
| conformance | 4 成果物（request / design / tasks / spec）の全項目が、項目ごとの根拠付きで満たされているか |
| regression-gate | findings ledger の全修正が最終コードに残っているか |
| adr-gen | この変更は ADR に残す価値のある設計判断を含むか。含むなら記録する |
| spec-fixer / code-fixer / build-fixer | 指定された findings / failures の解消のみを行えたか |
| custom-reviewer | 定義された観点で実装を評価できたか（frame は共通 judge contract） |
| request-generate | 入力を規格に適合した request.md に変換できたか |

### R3: 個別パッチの一般規律への吸収

- test-case-gen の冪等性軸: 観点自体は Method に残し、「N/A 明示」の一般則は EVIDENCE_DISCIPLINE に移す
- Fact-Check Attestation: 機構（attestation ファイルの読み書き）は現行のまま維持し、記述を Contract / Evidence 節に整理する
- design の path-fence 散文・implementer 等の禁止事項列挙: Contract の write-set に圧縮する（禁止範囲は不変）

### R4: repo 固有参照の除去

`architecture/` の名指し参照を可搬な表現（「プロジェクトの構造定義（型・状態機械・不変条件）を確認してよい」）に置換する。CLI 組み込み prompt が名指しできるのは製品所有資源（`specrunner/` 配下・change folder 成果物・result / template ファイル）のみとする。

### R5: rules.ts の更新

- step 列挙を PIPELINE_MAP と同一ソース化する（重複記載の廃止）
- 空の「共通禁止:」節を削除する
- 責任範囲表を現行 step 集合に更新する

### R6: チャネル所有権の確立

agent への情報伝達チャネルは 3 本（system prompt / initial message / output template）あり、それぞれの所有内容を固定する:

- **system prompt** — 観点・判定基準・規律（semantic content）。severity / verdict / Category / Priority の判定基準はここ（および共有 fragment）のみに置く
- **initial message** — その run 固有の束縛（パス・slug・branch・iteration・hash）のみ。判定基準を置かない
- **output template**（`src/templates/step-output-templates.ts`）— 出力の形のみ（セクション構成・カラム・機械 parse される anchor）。判定基準・severity 等の定義・他 step の agent への行動指示を置かない

現状の違反を解消する:
- REQUEST_REVIEW_RESULT / SPEC_REVIEW_RESULT template 内の severity・verdict 判定基準 → system prompt 側の単一ソースへ
- REVIEW_FEEDBACK template 内の Fix カラム意味論・Scores 表（weights） → 意味論は system prompt へ、Scores 表は削除（死装置）
- TEST_CASES template 内の Category / Priority / result 判定基準表 → test-case-gen system prompt と重複しており、単一ソース化する
- SPEC_EXEMPT_NOTE 内の下流 reviewer への行動指示文 → 免除時の reviewer 挙動は各 reviewer の system prompt が SPEC_EXEMPT_MARKER 検出で担っており、note 側は marker と人間向け説明のみに縮小する

## スコープ外

- typed toolResult schema の拡張（evidence counts / cause フィールドの機械化は将来の別 request）
- 判定チャネル・verdict 導出・output gate の変更（verdict-channel-unification で実施済みの内容を変更しない）
- harness の write-allowlist / request hash guard / revision 束縛（別途台帳管理）
- initial message builder の構造変更（文言が 5 部構成と矛盾する箇所の追随修正のみ許可）
- specrunner/rules/（プロジェクト知識注入）の内容整備

## 受け入れ基準

- [ ] 全 step system prompt（`src/prompts/*-system.ts` の全 agent step）が 5 節（Question / Contract / Method / Evidence / Completion）の見出しを含むことをテストで固定する
- [ ] stage 構成・step 列挙の記載が PIPELINE_MAP 単一ソース由来であり、prompt 内の独立した stage 表が 0 件であることをテストで固定する
- [ ] EVIDENCE_DISCIPLINE の文言（unverified 列挙義務・空集合は判定不能）が全 agent step の system prompt 出力に含まれることをテストで固定する
- [ ] coverage gate 回避禁止の文言が単一ソース由来であることをテストで固定する
- [ ] `src/prompts/` の出力文字列に `architecture/` への参照が存在しない（grep で 0 件）
- [ ] rules.ts の step 列挙が PIPELINE_MAP と一致し、「共通禁止:」空節が存在しない
- [ ] write-set（編集可能パス）の宣言が全 producer / fixer step の Contract 節に存在する
- [ ] output template の出力文字列に severity / verdict / Category / Priority の判定基準・Scores 表（Score / Weight）・他 agent への行動指示が存在しないことをテストで固定する（形式要件のみ許可）
- [ ] 判定導出・executor・output gate の既存テストは無改変で green（骨格再構成が routing / gate 挙動を変えないことの証明）
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **採用: 5 部構成の単一骨格 + 共有 fragment**。事故由来の個別ルールを「一般規律（Evidence / Cause）+ step 固有の少数観点（Method）」に再配置する。新種の欠陥は個別ルールでは事前列挙できないが、「確認していないことを green と区別する」一般規律は種類を問わず作用する。
- **採用: 禁止散文の write-set 圧縮**。境界の実強制は prompt の責務ではなく harness の責務（将来の write-allowlist）。prompt 側は契約の宣言 1 回に留め、重複した懇願を廃する。禁止範囲自体は不変。
- **却下: 事故パターン別のルール追記を継続する** — prompt 間整合の維持コストが規模で破綻しており、既に stale な step 列挙・空節・形式 drift が発生している。個別パッチは既知パターンにしか作用しない。
- **却下: 骨格の導入を新 step のみに適用し既存 prompt は温存する** — 二重構造の併存は drift の温床であり、共有 fragment の単一ソース性が成立しない。
- **却下: evidence counts / cause の typed schema 化を同時実施する** — completion 契約の変更は executor / adapter に波及する。prompt / template の規律として先行導入し、機械化は運用実績を見て別 request で行う。
