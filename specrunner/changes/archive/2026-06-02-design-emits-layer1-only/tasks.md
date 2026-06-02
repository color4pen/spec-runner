# Tasks: design は Layer-1（構造が決めない振る舞い）だけを spec に書く

## T-01: DESIGN_BASE に「Delta Spec Content Guidance (Layer-1 litmus)」セクションを追加

- [x] `src/prompts/design-system.ts` の `DESIGN_BASE` 内、delta spec サブセクション（`### delta spec` の末尾）の後、`## Delta Spec Format Rules (MUST)` の前に、新セクションを挿入する
- [x] セクション名: `## Delta Spec Content Guidance (Layer-1 litmus)`
- [ ] 以下の内容を含める:
  - [x] litmus の判断フロー: 「この振る舞いは構造（型 / 状態機械 / 不変条件）が強制するか？ → YES なら Layer-0（spec に書かない、歯が担う）/ NO なら Layer-1（spec に書く）」
  - [x] Layer-0 の例: 「pipeline の state が `completed` に遷移したら `idle` に戻れない」→ FSM が強制 → spec に書かない
  - [x] Layer-1 の例: 「verification 失敗時に build-fixer へ遷移する（skip せず即失敗にしない）」→ 構造は強制しない、intent の選択 → spec に書く
  - [x] `architecture/` 配下の構造定義（歯・型・FSM）を Read tool で参照して litmus を適用してよい旨の guidance
  - [x] Layer-0 を delta spec の Requirement / Scenario として書くことの禁止

**Acceptance Criteria**:
- `DESIGN_BASE` に `Layer-1 litmus` を含むセクションが存在する
- litmus の判断フロー（構造が強制するか → YES/NO）が記載されている
- Layer-0 と Layer-1 の具体例が各 1 つ以上含まれている
- `architecture/` 参照の guidance が含まれている

## T-02: 既存テストが green であることを確認

- [x] `bun run typecheck` が pass する
- [x] `bun run test` が pass する

**Acceptance Criteria**:
- typecheck と test が既存テストを含めて全て green
