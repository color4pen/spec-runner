# vitest 内 e2e test category を廃止し、test category を unit / integration / manual に整理する

## Meta

- **type**: spec-change
- **slug**: vitest-e2e-category-removal
- **base-branch**: main
- **adr**: false
- **date**: 2026-05-18
- **author**: color4pen
- **issue**: #293

## 背景

LLM 駆動の spec-runner では **vitest 内で e2e test を書こうとすると必ず歪む** ことが直前 session (= #286 dsv-presence-check-followup の検討) で実証された。

### 観測例 (= #286 TC-REPRO-01 騒動)

`dsv-specs-presence-check/test-cases.md` で priority `should` として起票された **TC-REPRO-01** を実装しようと書き始めたところ、以下の構造的破綻が発覚:

- 「validator は本物経路で動かしたい」が test の目的
- でも相手役の delta-spec-fixer agent は test 環境で実 Claude API を呼べない → mock 必須
- mock fixer に「specs/ を補填しろ」と手で書き込み命令する形に
- 結果: 「test fixture が specs/ を put / not put して validator を呼ぶ」だけの構造 = **mock 経由の unit test と等価**

調査の結果、TC-REPRO-01 が verify したい内容は以下で完全 cover 済:

| 既存 test | location | cover 内容 |
|---|---|---|
| TC-V-11 | `tests/unit/core/spec/delta-spec-validator.test.ts:285` | validator layer |
| TC-V-12 | `tests/unit/core/spec/delta-spec-validator.test.ts:302` | validator layer (new-feature) |
| TC-DSV-04 | `tests/unit/step/delta-spec-validation.test.ts:192` | step layer |
| TC-INT-01 | `tests/pipeline-integration.test.ts:1727` | pipeline routing layer |

= **e2e と呼ばれる test の追加価値はゼロ**、unit + integration の組み合わせで等価。

### 構造的根拠

spec-runner の core 価値は LLM 呼び出し (= design / spec-review / implementer 等)。vitest test 内ではこれを mock せざるを得ない。mock した瞬間に test は integration に降格し、e2e の体を成さない。

CLI アプリの e2e は本来「bin を実 spawn して入出力 (引数 / env / stdin → stdout / stderr / exit code / filesystem) で verify する」のが筋。spec-runner では **dogfood (= 実 `specrunner run`)** が事実上の e2e として既に機能している (= PR が立つ / 立たない / merge できる / できないで結果が verify される)。

### 現状の prompt に残る e2e category

`src/prompts/test-case-gen-system.ts` の以下 3 箇所に `e2e` が明示されている:

- L29: `**Category**: unit | integration | e2e | manual`
- L43: `| e2e | Screen operations, full user flows | Yes (env-dependent) |`
- L77: `- **Automated** (unit/integration/e2e): {count}`

これにより **test-case-gen agent は今後も e2e と称する vitest test を生成し続ける**。今回の TC-REPRO-01 と同型の歪みが繰り返し発生するリスク。

### spec authority の現状

`specrunner/specs/` 配下に test-case-gen 単独の capability spec は **存在しない** (= 確認済)。test-case-gen の振る舞い (= category 体系を含む) を表現する Authority spec が無い状態。

## 設計判断

1. **採用案: prompt 3 箇所から `e2e` を削除 + 新規 capability `test-case-generator` を delta spec の ADDED で起こす**
   - prompt: 該当 3 箇所を直接編集
   - spec: delta spec として `specrunner/changes/<slug>/specs/test-case-generator/spec.md` を作成し `## ADDED Requirements` で Requirement を記述 (= finish 時に spec-merge が baseline `specrunner/specs/test-case-generator/spec.md` を新規作成する)。baseline 自体は本 PR で直接作成しない (= `AUTHORITY_SPEC_GUARD_RULE` 準拠)
   - 理由: test-case-gen の振る舞い (= category 体系・出力 format・スキップ条件) は独立 capability として表現可能。pipeline-orchestrator や step-execution-architecture にぶら下げると責務が散る

2. **不採用案: pipeline-orchestrator や近接 capability の MODIFIED にぶら下げる**
   - test-case-gen 固有の規範 (= category 列挙) が pipeline 共通仕様に混ざり、後の保守で「pipeline-orchestrator なのに test-case-gen の細部まで書いてある」状態になる
   - 独立した capability として明示する方が責務境界が clean

3. **不採用案: prompt 修正のみ、spec authority への反映を後回し**
   - dogfood で踏んだ問題を spec で固定化しないと、再度 prompt が elastically 戻る可能性
   - dsv (= PR #285) と spec-review (= PR #289) で「spec 不在で素通り」の構造的弱点を踏んでいるため、spec authority に書き留めるのが安全

4. **「LLM 経路 / 実 API は vitest で書かない」規律の明文化**:
   - prompt に「LLM が絡む経路 / 実 API / 実 GitHub repo に依存する scenario は vitest test として書かない、dogfood で verify する」段を追加
   - 同規律を spec の Requirement として残し、prompt と spec で 2 重に守る

## 要件

### 1. prompt の編集

`src/prompts/test-case-gen-system.ts`:

- L29: `**Category**: unit | integration | e2e | manual` → `**Category**: unit | integration | manual`
- L43: `| e2e | Screen operations, full user flows | Yes (env-dependent) |` 行を削除
- L77: `- **Automated** (unit/integration/e2e): {count}` → `- **Automated** (unit/integration): {count}`
- 「LLM 経路 / 実 API / 実 GitHub repo に依存する scenario は vitest test として書かない、dogfood で verify する」規律を新しい段として追加 (= Constraints セクション付近が自然)

### 2. spec authority への反映

delta spec として `specrunner/changes/<slug>/specs/test-case-generator/spec.md` を **新規** に作成し、`## ADDED Requirements` セクションで以下の Requirement を記述する (= finish 時に spec-merge が baseline `specrunner/specs/test-case-generator/spec.md` を新規作成する経路。baseline 自体は本 PR で直接作成しない):

- Purpose: test-case-gen step が design.md / tasks.md / request.md から test scenario を生成する責務
- Requirement (= 本 request で固定する規律のみ。既存挙動の全網羅は別 scope):
  - 「test category は `unit` / `integration` / `manual` の 3 種、`e2e` は category として生成しない」
  - 「LLM 呼び出し / 実 API / 実 GitHub repo に依存する scenario は vitest test として表現しない (= dogfood で verify する)」
- Scenario:
  - test-case-gen が `e2e` を category として出力 → 違反 (= 既存挙動と矛盾)
  - LLM mock を前提とする scenario を test-cases.md に列挙 → 違反

### 3. test

`tests/prompts/test-case-gen-system.test.ts` (= 新規 or 既存 prompt test に追記):

- TC-CATG-01: prompt 内に `e2e` 文字列が含まれない
- TC-CATG-02: prompt 内に「`unit | integration | manual`」の 3 種 category が明示されている
- TC-CATG-03: prompt 内に「LLM 経路 / 実 API は vitest で書かない」規律が明示されている

regression check:

- 既存 `tests/` 配下の `Category: e2e` 記述がある test-cases.md (= archive 含む) は触らない (= 過去資産は変更しない)

### 4. 既存 test の regression なし

- 既存 unit / integration test の挙動は変えない
- test-case-gen step の output 形式 (= test-cases.md 構造) は category 列挙以外は維持

## スコープ外

- 既存 vitest 内 e2e 相当 test (= 過去 PR で書かれたもの) の削除・再分類 (= 別 issue、#287 多層防衛 e2e と整合)
- test-case-gen step 自体の振る舞い変更 (= category 列挙以外)
- pipeline 構成や step 追加・削除
- dogfood 実行の自動化 / scripting
- step 責務境界の包括設計 (= #263、別 request)

## 受け入れ基準

- [ ] `src/prompts/test-case-gen-system.ts` から `e2e` 言及が完全削除されている (= L29 / L43 / L77 該当箇所 + 関連表記)
- [ ] 「LLM 経路 / 実 API は vitest 内で書かない、dogfood で verify する」規律が prompt に明文化されている
- [ ] delta spec `specrunner/changes/<slug>/specs/test-case-generator/spec.md` が `## ADDED Requirements` を持つ形で新規作成されている (= baseline `specrunner/specs/test-case-generator/spec.md` は spec-merge 経由で finish 時に新規作成される、本 PR では作らない)
- [ ] 既存 test (= unit / integration) の挙動に regression なし
- [ ] `bun run typecheck && bun run test` が green
- [ ] 過去の archived test-cases.md (= `specrunner/changes/archive/`) は触っていない

## Workflow Options

- enabled: []
