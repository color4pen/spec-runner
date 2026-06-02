# Design: test-cases.md GWT 二重持ち解消

## Context

`test-cases-from-spec-scenarios`（#504）で test-case-gen は delta spec の Scenario から test-cases.md を生成するようになった。現状 test-cases.md は Scenario の GIVEN/WHEN/THEN を再記述しており、(1) delta spec と test-cases.md の二重持ち、(2) LLM 再記述時の paraphrase drift が問題になっている。

変更対象は 3 箇所:
- `TEST_CASES_TEMPLATE`（テンプレート定義）
- `TEST_CASE_GEN_BASE`（test-case-gen system prompt）
- implementer system prompt（test-cases.md の読み方指示）

## Goals / Non-Goals

**Goals**:
- Scenario 由来 TC から GWT 本体を除去し、Source 参照のみにする
- 非 Scenario 由来 TC（実装詳細の補助 unit test）は従来通り GWT を保持する混在形式を明示する
- implementer が GWT を delta spec Scenario から読むフローに変更する

**Non-Goals**:
- verification の test-coverage ロジック変更（TC-ID grep は現行のまま機能する）
- test-cases.md の Summary / Result セクション構造の変更

## Decisions

### D1: Scenario 由来 TC は Source 参照のみ、GWT 省略

Scenario 由来の TC は `Source: specs/<capability>/spec.md > Requirement: <name> > Scenario: <name>` のみを持ち、GIVEN/WHEN/THEN を記述しない。behavior の正典は delta spec の Scenario 一箇所。

- Rationale: 同一 GWT の二重持ちは LLM paraphrase drift を生む。Source 参照で single-source-of-truth を実現する。
- Alternatives: (a) GWT を機械コピーして同期チェック → コピー精度の保証が困難、(b) test-cases.md 自体を廃止 → テスト戦略（Category/Priority）の表現場所がなくなる

### D2: 混在形式（Scenario 由来 = GWT 省略 / 非 Scenario 由来 = GWT 保持）

test-cases.md は 2 種類の TC が混在する:
- **Scenario 由来**: Source + Category + Priority のみ（GWT なし）
- **非 Scenario 由来**: Source に `design.md` / `tasks.md` セクションを記載し、従来通り GWT を記述

- Rationale: 非 Scenario 由来 TC は spec に正典がないため、test-cases.md 自体が GWT の唯一の定義場所。省略すると behavior が失われる。
- Alternatives: 全 TC 統一的に GWT 省略 → 非 Scenario TC の behavior 定義場所がなくなり破綻

### D3: implementer prompt を「delta spec Scenario から GWT を読む」フローに変更

現行の implementer prompt は `test-cases.md の GIVEN/WHEN/THEN をテストコードに変換する` と指示している。Scenario 由来 TC では GWT が test-cases.md に存在しなくなるため、`delta spec の Scenario から GWT を読む` 指示に変更する。

- Rationale: test-cases.md に GWT がない TC が出現するため、implementer が GWT の取得先を知る必要がある。
- Alternatives: implementer に自動で test-cases.md の Source を解決させる → prompt が複雑化し不安定

## Risks / Trade-offs

[Risk] implementer が Source 参照を辿れず GWT を取得できない → Mitigation: implementer prompt に明示的な手順（Source の `specs/...` パスを Read tool で開く）を記載

[Risk] 混在形式で agent が区別を間違える → Mitigation: TEST_CASES_TEMPLATE のコメントに明確なルールを記載し、test-case-gen prompt にも混在ルールを指示

## Open Questions

なし
