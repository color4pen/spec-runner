# TC Source 形式の producer/consumer drift を単一ソース化で修正する

## Meta

- **type**: bug-fix
- **slug**: tc-source-contract-drift-fix
- **base-branch**: main
- **adr**: false

## 背景

test-cases.md の各テストケースが持つ **Source** フィールドは、test-case-gen（producer）が書き、test-materialize / implementer（consumer）が「Scenario 由来 TC か否か」の判別に使う step 間契約である。Scenario 由来 TC は test-cases.md に GWT を持たず、consumer は Source が指す spec の Scenario を読んで GWT を得る設計になっている。

単一 spec ファイル移行（`specs/<capability>/spec.md` → `specrunner/changes/<slug>/spec.md`、2026-06 初旬）で producer 側の Source 形式は `spec.md > Requirement: <name> > Scenario: <name>` に更新されたが、consumer 側 2 prompt は旧形式 `specs/<capability>/spec.md > ...` を判別条件として指示し続けている。判別条件に一致しない Scenario 由来 TC は「非 Scenario 由来 TC」として扱われ、consumer は test-cases.md 内に存在しない GWT を探す経路に入る。

同じ契約文字列が 3 つの prompt に独立に複製されていることが drift の根本原因であり、文字列を手で揃え直すだけでは再発する。

## 現状コードの前提

- `src/prompts/test-case-gen-system.ts:55` — Source 形式を `spec.md > Requirement: <name> > Scenario: <name>` と定義している（現行の producer 形式）
- `src/prompts/test-materialize-system.ts:84-86` — Scenario 由来 TC を「Source フィールドが `specs/<capability>/spec.md > ...` 形式」で判別し、そのパスを Read するよう指示している（旧形式）
- `src/prompts/implementer-system.ts:48-49` — 未 materialize 経路の TDD 指示で同じ旧形式判別を指示している
- archived run の実出力: `specrunner/changes/archive/*/test-cases.md` で旧形式 `Source**: specs/` を含むのは 2026-06-03 以前の 14 件のみ。以降の Scenario 由来 TC は全て `spec.md > Requirement: ...` 形式で出力されている

## 要件

1. TC Source 形式の正準定義を単一ソース化する。共有定数（leaf module、`src/prompts/judge-rules.ts` と同型のパターン）として定義し、test-case-gen / test-materialize / implementer の 3 prompt が同一ソースから参照する。
2. test-materialize と implementer の Scenario 由来 TC 判別条件を現行形式（`spec.md > Requirement: <name> > Scenario: <name>`、参照先は change folder の `spec.md`）に修正する。GWT の取得手順（Source が指す spec の Scenario を Read する）は現行設計のまま維持する。
3. 3 prompt に埋め込まれる Source 形式文言が共有定数由来であることをテストで固定し、独立複製による drift の再発を機械的に防ぐ。

## スコープ外

- step prompt 全体の骨格再設計（別 request で実施予定）
- TC Source 契約以外の prompt fragment 統合・整理
- Source フィールドを機械 parse する機能の追加（判別は引き続き agent が行う。本 request は契約文言の整合のみ）
- test-cases.md の過去 archive の修正

## 受け入れ基準

- [ ] test-materialize / implementer の system prompt 出力に旧形式 `specs/<capability>/spec.md` の判別記述が存在しない（grep で 0 件）
- [ ] 3 prompt（test-case-gen / test-materialize / implementer）の Source 形式記述が単一の共有定数から導出されている
- [ ] 共有定数と 3 prompt の整合（system prompt 文字列に正準形式が含まれ、旧形式が含まれないこと）をアサートするテストが存在し green
- [ ] `typecheck && test` が green（既存テストは無改変で通る）

## architect 評価済みの設計判断

- **採用**: 共有定数を `src/prompts/` 配下の leaf module に置き、3 prompt が import する。`judge-rules.ts` が確立済みの同型パターン（project-internal import なしの leaf constants）であり、依存方向の新設はない。
- **却下: 3 prompt の文字列を手で揃えるだけ** — 独立複製が今回の drift の根本原因そのものであり、次の形式変更で再発する。
- **却下: rules.md（知識注入）で形式を伝える** — Source 形式は製品自身の step 間契約であり、プロジェクト固有知識ではない。CLI 組み込みの prompt モジュールが持つべき定義。
