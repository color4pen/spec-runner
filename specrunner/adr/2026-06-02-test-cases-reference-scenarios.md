# ADR: test-cases.md の Scenario 由来 TC を GWT 省略・Source 参照のみに変更する

- **Date**: 2026-06-02
- **Status**: Accepted
- **Slug**: test-cases-reference-scenarios

## Context

`test-cases-from-spec-scenarios`（#504 / ADR: 2026-06-02-test-case-gen-scenario-primary-source）で test-case-gen は delta spec の Scenario を acceptance test の source とするようになった。しかし生成された `test-cases.md` は Scenario の GIVEN/WHEN/THEN を **再記述**する形式を維持していた。

この再記述には 2 つの問題がある:

1. **二重持ち**: delta spec の Scenario と `test-cases.md` に同一 GWT が存在する。
2. **paraphrase drift**: LLM が Scenario を書き写す際に原文と微妙に乖離する（co-author でも発生する）。

behavior（GWT）の正典は delta spec の Scenario 一箇所に絞るべきであり、`test-cases.md` の固有価値はテスト戦略（Category / Priority / TC-ID / coverage 追跡）である。

## Decision

1. Scenario 由来の TC は `test-cases.md` に GWT を記述しない。Source フィールド（`specs/<capability>/spec.md > Requirement: <name> > Scenario: <name>`）のみを持つ。
2. Scenario に対応しない補助 unit test（実装詳細）は従来通り GWT を記述する（混在形式）。
3. `TEST_CASES_TEMPLATE` の HTML コメントに混在形式のルールを明記する。
4. `implementer-system.ts` の手順を「Source フィールドのパスを Read tool で開き、delta spec の Scenario から GWT を読む」フローに変更する。

変更対象ファイルは 3 つ: `step-output-templates.ts`（TEST_CASES_TEMPLATE）、`test-case-gen-system.ts`（TEST_CASE_GEN_BASE）、`implementer-system.ts`。step 定義・pipeline は変更しない。

## Design Decisions

### D1: Scenario 由来 TC は Source 参照のみ、GWT 省略

**選択**: Scenario 由来の TC には Source フィールドのみを記載し、GIVEN/WHEN/THEN ブロックを記述しない。

**理由**: 同一 GWT の二重持ちは LLM paraphrase drift を生む。behavior の正典を delta spec の Scenario 一箇所にすることで single-source-of-truth を実現する。

**却下案**:
- GWT を機械コピーして同期チェック → コピー精度の保証が困難。sync ロジックの維持コストが高い。
- `test-cases.md` 自体を廃止 → テスト戦略（Category / Priority / coverage 追跡）の表現場所がなくなる。

### D2: 混在形式（Scenario 由来=GWT 省略 / 非 Scenario 由来=GWT 保持）

**選択**: `test-cases.md` は 2 種の TC を混在させる。Scenario 由来（Source 参照のみ）と非 Scenario 由来（GWT 記述）。

**理由**: 非 Scenario 由来 TC は spec に正典が存在しないため、`test-cases.md` 自体が GWT の唯一の定義場所になる。省略すると behavior が失われる。

**却下案**:
- 全 TC を統一的に GWT 省略 → 非 Scenario TC の behavior 定義場所がなくなり破綻する。

### D3: implementer prompt を「delta spec Scenario から GWT を読む」フローに変更

**選択**: implementer が Scenario 由来 TC を実装する際、Source フィールドのパス（`specs/<capability>/spec.md`）を Read tool で開き、対応する Scenario の GWT を読んでテストコードに変換する手順を prompt に明記する。

**理由**: `test-cases.md` に GWT が存在しない TC が出現するため、implementer が GWT の取得先を知る必要がある。明示的な手順がなければ agent が迷う。

**却下案**:
- implementer に Source 参照を自動解決させる（暗黙) → prompt の複雑化と不安定化を招く。明示的手順の方が agent の再現性が高い。

## Alternatives Considered

### Alternative 1: test-cases.md への GWT 書き込みを維持し、後から drift 検出する

Scenario と test-cases.md の GWT を比較する検証ステップを追加し、drift を検出・修正する案。

- **Pros**: 既存の test-cases.md フォーマットとの後方互換が高い。実装を読む際に GWT がすぐ参照できる。
- **Cons**: 二重持ちの根本原因を解消しない。drift 検出ロジックの実装・維持コストが高い。LLM の再生成で drift が戻る循環が続く。
- **Why not**: 応急処置の追加であり根本解決にならない。source を一つにする方が設計として単純で安定する。

### Alternative 2: test-cases.md 自体を廃止する

`test-cases.md` を生成しなくなり、テスト戦略の情報（Category / Priority / TC-ID）も持たないようにする案。GWT は delta spec の Scenario だけになる。

- **Pros**: 二重持ちを根本から解消できる。生成するアーティファクトが減り、パイプラインが単純化する。
- **Cons**: テスト戦略（Category / Priority）と TC-ID による coverage 追跡の表現場所がなくなる。verification の test-coverage 関所（TC-ID grep）が機能しなくなる。非 Scenario 由来の補助 unit test の behavior 定義場所も失われる。
- **Why not**: `test-cases.md` の固有価値は「どの Scenario を・どの Category・Priority でテストするか」のテスト戦略と coverage 追跡にある。廃止するとその価値ごと失われ、verification の仕組みも破綻する。

## Consequences

- `test-cases.md` の Scenario 由来 TC は Source 参照のみとなり、GWT の二重持ちが解消される。
- behavior（GWT）の正典は delta spec の Scenario 一箇所に集約される（single-source-of-truth）。
- implementer は `test-cases.md` に GWT がない TC の実装時、delta spec の Scenario を参照するフローに変わる。
- 混在形式（Scenario 由来=GWT 省略 / 非 Scenario 由来=GWT 保持）が `TEST_CASES_TEMPLATE` で公式ルールとして明記される。
- verification の test-coverage 関所（TC-ID grep）は TC-ID が残るため引き続き機能する。

## References

- Request: `specrunner/changes/test-cases-reference-scenarios/request.md`
- Design: `specrunner/changes/test-cases-reference-scenarios/design.md`
- Related ADR: `specrunner/adr/2026-06-02-test-case-gen-scenario-primary-source.md`（Scenario を primary source とした前段変更）
