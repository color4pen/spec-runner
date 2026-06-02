# test-cases.md を「scenario の写し」から「scenario 参照 + テスト戦略」へ（GWT 二重持ち解消）

## Meta

- **type**: spec-change
- **slug**: test-cases-reference-scenarios
- **base-branch**: main
- **adr**: true

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

<!-- spec 変更を伴う場合: authority path (specrunner/specs/...) を編集対象として記述しないこと。delta spec path (specrunner/changes/<slug>/specs/<capability>/spec.md) で表現する -->

## 背景

`test-cases-from-spec-scenarios`（#504）で test-case-gen は delta spec の Scenario から `test-cases.md` を生成するようになった。だが現状 `test-cases.md` は Scenario の **GIVEN/WHEN/THEN を再記述**しており、2つの問題がある:

1. **二重持ち**：同じ GWT が delta spec の Scenario と `test-cases.md` の両方に存在する。
2. **再記述 drift**：LLM が Scenario を `test-cases.md` に書き写す際、原文と微妙に食い違う可能性がある（co-author でも paraphrase drift が起きる）。

本 change は `test-cases.md` から GWT 本体を外し、**Scenario を Source（識別子）で参照**するだけにする。behavior（GWT）の正典は **spec の Scenario 一つ**。`test-cases.md` は **固有のテスト戦略のみ**を持つ。

## 要件

1. test-case-gen は `test-cases.md` の各 TC で **GWT 本体を再記述しない**。各 TC は対応する Scenario を Source（既存フォーマット `specs/<capability>/spec.md > Requirement: <name> > Scenario: <name>`）で参照する。
2. `test-cases.md` が持つのは **test-strategy のみ**：Category（unit/integration/manual）/ Priority / TC-ID / Source（Scenario 参照）。
3. Scenario 由来でない補助 unit test（実装詳細）は、対応する Scenario が無いため従来通り GWT を記述してよい（spec に正典が無い分はここが持つ）。つまり `test-cases.md` は**混在形式**となる（scenario 由来 TC = Source 参照のみ・GWT 省略 / 非 scenario 由来 TC = GWT 保持）。`test-case-gen` の TEST_CASES_TEMPLATE のコメントにこの混在形式を明記する。
4. implementer は behavior（GWT）を **spec の Scenario** から読む。`test-cases.md` からは「どの Scenario を / どの Category・Priority で実装するか」を読む（`test-cases.md` に GWT が無くても破綻しない）。
5. verification の test-coverage 関所（must TC-ID が test に存在）は引き続き機能する（TC-ID は残す）。

## スコープ外

- spec の Layer-0 / Layer-1 区分、spec-merge / baseline / capability ディレクトリの機械変更。
- GitHub の merge / delivery 機構。

## 受け入れ基準

- [ ] `test-cases.md` の Scenario 由来 TC が GWT 本体を再記述していない（Source 参照のみ）。
- [ ] Scenario 非由来の補助 unit test は従来通り記述できる。
- [ ] TEST_CASES_TEMPLATE のコメントに混在形式（scenario 由来=GWT 省略 / 非 scenario 由来=GWT 保持）が明記されている。
- [ ] implementer が spec の Scenario の GWT を読んでテストを書ける（`test-cases.md` に GWT が無くても動く）。
- [ ] verification の test-coverage 関所が must TC-ID で機能する。
- [ ] `bun run typecheck && bun run test` が green。

## architect 評価済みの設計判断

behavior（GWT）の正典は spec の Scenario 一つにする。`test-cases.md` への複製は LLM 再記述 drift を生むため、参照に置き換える。`test-cases.md` の固有価値は「テスト戦略（どう・どこでテストするか＝Category / Priority / coverage 追跡）」であって behavior の写しではない。#504 が作った scenario→test の橋の上で、複製を畳んで single-source にする refinement。
