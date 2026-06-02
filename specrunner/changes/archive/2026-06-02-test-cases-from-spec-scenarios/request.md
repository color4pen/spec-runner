# test-case-gen を delta spec の Scenario 起点にし、scenario→test の橋を作る

## Meta

- **type**: spec-change
- **slug**: test-cases-from-spec-scenarios
- **base-branch**: main
- **adr**: true

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

<!-- spec 変更を伴う場合: authority path (specrunner/specs/...) を編集対象として記述しないこと。delta spec path (specrunner/changes/<slug>/specs/<capability>/spec.md) で表現する -->

## 背景

現状 test-case-gen は `design.md` / `tasks.md` から `test-cases.md` を生成しており、**delta spec の Scenario（given/when/then）を読んでいない**。そのため spec の Scenario（受け入れ条件）が test に直結せず、「spec = claim、test = proof」が乖離している。

spec が検証で元を取る唯一の道は **Scenario が acceptance test の source になる**こと。本 change は test-case-gen の入力源を `design.md`/`tasks.md` から **delta spec の Scenario** に切り替え、scenario→test の橋を作る。これにより「spec を書く = test を積む」が成立する。

## 要件

1. test-case-gen は delta spec（`specrunner/changes/<slug>/specs/<capability>/spec.md`）の各 Requirement の Scenario を **acceptance test の source** として `test-cases.md` を生成する。各 Scenario が 1 つ以上の test case に対応する。
   - **用語**: 本 change における「acceptance test」= `test-cases.md` の **Source** フィールドが delta spec の Scenario を指す test case。Category（unit / integration / manual）と Priority は既存の判定規則に従い、本 change では変更しない（acceptance test は Source による定義であって、特定の Category / Priority に縛らない）。
2. `test-cases.md` の acceptance レベルの正典は Scenario とする。`design.md` / `tasks.md` は補助文脈に留める（実装詳細の unit test を実装段で足すのは妨げない）。

## スコープ外

- spec の Layer-0 / Layer-1 区分の導入、spec-merge 廃止、capability ディレクトリ構造の変更（別 change）。
- GitHub の merge / delivery 機構。
- Scenario 欠如の検出（`scenario-required-per-requirement` が delta-spec-validation で既に error-gate 済みのため、test-case-gen では再検査しない）。

## 受け入れ基準

- [ ] `test-cases.md` の各 acceptance test が delta spec の Scenario に対応している（Scenario → test case の写像が辿れる）。
- [ ] Scenario 由来でない acceptance test が混入していない（spec が網羅範囲の正典）。
- [ ] `bun run typecheck && bun run test` が green。

## architect 評価済みの設計判断

spec が検証で元を取るには「Scenario が test になる」ことが必要で、それが claim（spec）と proof（test）を一致させる唯一の機構。test-case-gen を Scenario 起点にすることで、spec の存在理由を「下流が読まない監査文書」から「acceptance test の source」へ転換する。本 change はその橋のみを対象とし、spec モデル全体の再定義（Layer-0/1、source-of-truth 廃止）は後続で扱う。
