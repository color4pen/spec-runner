# design は Layer-1（構造が決めない振る舞い）だけを spec に書く

## Meta

- **type**: spec-change
- **slug**: design-emits-layer1-only
- **base-branch**: main
- **adr**: false

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

<!-- spec 変更を伴う場合: authority path (specrunner/specs/...) を編集対象として記述しないこと。delta spec path (specrunner/changes/<slug>/specs/<capability>/spec.md) で表現する -->

## 背景

ADR `architecture/adr/2026-06-02-spec-model.md` で、spec は **Layer-1（構造が決めない、intent 由来の振る舞いの選択）の残差**と定義された。Layer-0（型 / FSM / invariant が強制する根の振る舞い）は構造と歯が担い、spec に書かない。

だが現状 design step は delta spec に Layer-0 / Layer-1 を区別せず書くため、構造が既に強制している振る舞いを spec に重複記述しうる（spec の肥大・二重持ち）。本 change は design の prompt に **litmus を効かせ、Layer-1 だけを spec に書かせる**。

## 要件

1. design step が生成する delta spec は **Layer-1（構造が強制しない振る舞いの選択）だけ**を Requirement / Scenario として書く。Layer-0（型 / FSM / invariant が強制する根の振る舞い）は書かない。
2. design の system prompt に litmus を組み込む：「**構造（型 / 状態機械 / 不変条件）が強制するか** → YES なら spec に書かない（Layer-0、歯が担う）/ NO なら書く（Layer-1）」。
3. design は判断の拠り所として既存の構造（`architecture/` の歯・型・FSM）を参照してよいが、Layer-0 を spec へ複製しない。

## スコープ外

- Layer-0 を増やす構造投資（型 / FSM / invariant への振る舞い押し込み）= 別 request。
- Layer-0 混入の機械検出（validator）= marker / 表裏一体側の別 request（本 change は prompt レベルに留める）。
- spec-merge 廃止 / baseline 撤廃。

## 受け入れ基準

- [ ] design の system prompt に Layer-0 / Layer-1 の litmus（構造が強制する振る舞いは spec に書かない）が含まれている。
- [ ] （spec-review 確認）design が生成する delta spec が、構造が強制する Layer-0 振る舞いを Requirement / Scenario として重複記述しない（自動 test でなく review で判定する判断レベルの基準）。
- [ ] `bun run typecheck && bun run test` が green。

## architect 評価済みの設計判断

spec モデル（`architecture/adr/2026-06-02-spec-model.md`）の D2 の実装。spec を Layer-1 に絞ることで、構造が rich になるほど spec が縮む関係を design 段で成立させる。本 change は prompt レベルの guidance に留め、Layer-0 混入の機械検査は別 request に分離する（領域を verification / rules と分けて並列性を保つ）。
