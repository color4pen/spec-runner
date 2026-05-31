# job-state-store spec の JobStatus 状態機械をコード／構造 authority に同期する

## Meta

- **type**: spec-change
- **slug**: sync-job-state-fsm-spec
- **base-branch**: main
- **adr**: false

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

<!-- spec 変更を伴う場合: authority path (specrunner/specs/...) を編集対象として記述しないこと。delta spec path (specrunner/changes/<slug>/specs/<capability>/spec.md) で表現する -->

## 背景

2026-05-31 のアーキテクチャ監査で、JobState の状態機械（JobStatus 遷移）が architecture / contract のどこにも構造として無く `src/state/lifecycle.ts` にしか存在しないことが判明し、**構造側 authority** として `architecture/domain-model.md` に JobStatus 状態機械（7値 enum・VALID_TRANSITIONS 許可遷移・terminal/active 区分）を正典化した（out-of-loop 文書編集で対応済み）。

一方で**振る舞い側 spec** がコードと乖離（stale）しており、二重 authority の drift になっている:

- 既存の job-state-store capability spec は status enum を **5 値**（`running | success | failed | terminated | archived`）と宣言しているが、コード（`src/state/schema.ts`）は **7 値**（`running | awaiting-resume | awaiting-merge | failed | terminated | archived | canceled`）。`awaiting-resume` / `awaiting-merge` / `canceled` が欠落し、`success` は既にコードに存在しない（load 時に `awaiting-merge` へ remap される legacy 値）。
- canonical 遷移・「legacy success」Scenario の記述がコードの remap 挙動と逆。

本 change は振る舞い spec を**コード（正典）と構造 authority（domain-model.md）に一致**させ、3 authority 間の status 列挙を 7 値で揃える。

## 要件

1. job-state-store capability の delta spec（`specrunner/changes/sync-job-state-fsm-spec/specs/job-state-store/spec.md`）で、status enum を 7 値（`running | awaiting-resume | awaiting-merge | failed | terminated | archived | canceled`）に訂正する。**併せて、status を値として参照する全シナリオの stale な `success` 参照も訂正対象に含める** —— 特に `SPEC_REVIEW_RETRIES_EXHAUSTED` シナリオ（現 spec L77「state.status は `success`」）を、remap 後の正しい `awaiting-merge` に直す。
2. canonical な正常完走遷移を `awaiting-merge → archived` に訂正する。
3. legacy `success` の Scenario を「`success` は load 時に `awaiting-merge` へ remap される（`src/state/schema.ts`）」へ反転訂正する（現 Scenario はコードと逆の主張）。
4. `awaiting-resume`（exit-guard が倒す checkpoint）・`canceled` を Requirement に追記し、active = {`running`, `awaiting-resume`} / terminal = {`archived`, `canceled`} の区分と VALID_TRANSITIONS の許可遷移を spec に反映する。
5. 本 delta spec は既存の baseline 節 **`Requirement: JobStatus includes archived as a terminal status`**（現 spec L345-365、5値 enum・`success → archived` canonical・「legacy success loads without migration」を含む3 Scenario）を **supersede（置換）** する。特に「legacy success loads without migration」Scenario はコードの remap 挙動（`success` → `awaiting-merge`）と矛盾するため、置換後の正しい挙動に直し、baseline に矛盾要件を残さない。

## スコープ外

- `src/state/lifecycle.ts` のコード変更（**コードが正典であり既に正しい**。spec をコードに合わせる、逆ではない）。
- 「status 書きは `transitionJob` 経由のみ」の単一 mutator 不変の歯実装（= E1 にぶら下げる別作業）。
- `architecture/domain-model.md` の編集（out-of-loop 文書。本監査で別 channel 対応済み。本 change はそれを参照して整合させるのみ）。

## 受け入れ基準

- [ ] delta spec の status enum が `src/state/schema.ts` と一致（7 値）
- [ ] canonical 遷移が `awaiting-merge → archived`、legacy success の Scenario が remap 挙動と一致
- [ ] delta spec の状態集合・区分が `architecture/domain-model.md` の JobStatus 状態機械節と矛盾しない
- [ ] 完了後の job-state-store spec に status の**現行値**としての `success` が残っていない（legacy remap の説明文脈を除く。grep で確認）
- [ ] 既存 Requirement `JobStatus includes archived as a terminal status`（L345-365）が delta spec で置換され、baseline に矛盾要件が残らない
- [ ] プロジェクト標準 verification（`bun run build && bun run typecheck && bun run lint && bun run test`）が green

## architect 評価済みの設計判断

- **コードを正典とし spec をコードに合わせる**: lifecycle.ts / schema.ts が VALID_TRANSITIONS と JobStatus の正典。spec は actual state の写しなので、乖離はコードでなく spec を直す。
- **3 authority の status 列挙を 7 値で一致**: 構造（domain-model.md）・振る舞い（job-state-store spec）・コード（schema.ts）の drift を解消し、唯一の記述が stale で誤誘導する状態を解消する。
