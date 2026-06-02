# Design: must TC の test に実質的な assertion を要求する faithfulness gate

## Context

test-coverage phase は must TC-ID が test ファイルに**出現するか**を検査する。しかし `it("TC-001", () => {})` のような空 stub でも pass する。ADR `spec-model` の「振る舞いの真実は test」という前提が空 stub で満たされてしまう。

変更対象は 1 ファイル:
- `src/core/verification/test-coverage.ts` — `runTestCoveragePhase` 内に assertion 存在検査を追加

既存ロジック: must TC-ID ごとに「いずれかの test ファイルにその TC-ID 文字列が含まれるか」を確認し、含まれなければ `missingTcIds` に追加。全件含まれれば `passed`。

## Goals / Non-Goals

**Goals**:
- TC-ID が出現するファイルに**少なくとも 1 つの実質的な assertion** (`expect(` / `assert(` / `assert.`) が存在することを検査する
- assertion 欠如の TC を `TestCoverageResult` に報告し、test-coverage を `failed` にする

**Non-Goals**:
- TC-ID と assertion の意味的対応（どの assertion がどの TC を検証しているか）の検査
- mutation testing 等の厳密な faithfulness 検証
- should / could TC への適用

## Decisions

### D1: assertion 検査の粒度は「TC-ID を含むファイルに assertion が存在するか」

TC-ID と assertion の 1:1 対応は検査しない。既存 test-coverage の「TC-ID を含むファイル全体を検索対象とする」粒度を踏襲し、そのファイル内に assertion パターンが 1 つ以上存在するかを確認する。

- Rationale: TC-ID ↔ assertion のスコープ対応（`describe` / `it` ブロック単位等）は AST 解析が必要で過剰。ファイル単位検査は regex で十分かつ既存粒度と一貫性がある。
- Alternatives: (a) `it` ブロック単位で assertion を検査 → AST parser 依存、scope 外の複雑性 (b) ファイル全体の assertion 数を閾値で判定 → 閾値の根拠が不明確

### D2: assertion パターンは `expect(` / `assert(` / `assert.` の 3 パターン

vitest/jest の `expect(`、node:assert の `assert(` / `assert.strictEqual` 等をカバーする。正規表現: `/expect\(|assert\(|assert\./`。

- Rationale: spec-runner のテスト stack は vitest だが、target project は任意のテストランナーを使う可能性がある。3 パターンで主要フレームワーク (vitest, jest, mocha+chai, node:assert) をカバーする。
- Alternatives: (a) `expect(` のみ → node:assert ユーザーが false negative (b) `toEqual` 等メソッド名を列挙 → パターン爆発、メンテ負荷

### D3: `TestCoverageResult` に `assertionlessTcIds` フィールドを追加

既存の `missingTcIds`（TC-ID 不在）と区別し、新フィールド `assertionlessTcIds`（TC-ID は存在するが assertion 無し）を追加する。両方が空なら `passed`、どちらかに要素があれば `failed`。

- Rationale: 「TC-ID が無い」と「TC-ID はあるが空 stub」は異なる問題。報告を分けることで build-fixer / implementer が適切に対処できる。
- Alternatives: `missingTcIds` に統合 → 既存の「TC-ID 不在」と「assertion 欠如」の区別が失われ、修正指示が曖昧になる

### D4: stdout の報告形式

既存: `test-coverage: 3/5 must TCs covered\nMissing: TC-003, TC-004`
追加: `Assertionless: TC-001, TC-002`（assertion 欠如の TC を別行で報告）

verdict 判定: `missingTcIds.length === 0 && assertionlessTcIds.length === 0` → `passed`。

- Rationale: build-fixer が stdout を読んで修正するため、問題の種類を区別できる形式にする。
- Alternatives: 単一行に混在 → 問題の種類が判別しにくい

## Risks / Trade-offs

[Risk] ファイルに `expect(` が含まれるが TC-ID に対応する assertion ではないケース（別の TC の assertion が同一ファイルにある）→ Mitigation: 本 change のスコープは「assertion 存在の緩い検査」であり、意味的対応は scope 外として許容する。将来の mutation testing で補強可能。

[Risk] assertion パターンが文字列リテラルやコメント内に出現する偽陽性 → Mitigation: 実害は「空 stub が通る」の反対方向（通るべきものが通る）なので安全側。コメント内のみに assertion パターンがある test は実質空 stub と同等なので検出が望ましい。

## Open Questions

なし
