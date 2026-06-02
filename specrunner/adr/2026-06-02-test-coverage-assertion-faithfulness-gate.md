# ADR: test-coverage フェーズに assertion 存在検査（faithfulness gate）を追加する

- **Date**: 2026-06-02
- **Status**: Accepted
- **Slug**: scenario-test-faithfulness-gate

## Context

`2026-05-19-verification-tc-coverage` で verification の test-coverage phase が確立され、must TC-ID が test ファイルに**出現するか**を機械検査するようになった。しかしこの検査は TC-ID 文字列の出現のみを確認するため、`it("TC-001", () => {})` のような空 stub でも pass する。

`2026-06-02-spec-model`（ADR）は「振る舞いの真実は test」と定めている。その真実が空 stub で満たされてしまうのは矛盾である。verification が「TC-ID が存在する」を保証しても「TC が実際に何かを検証している」は保証されない。

## Decision

test-coverage phase に第 2 の検査として **assertion 存在検査（faithfulness gate）** を追加する。

1. must TC-ID を参照する test ファイルに、少なくとも 1 つの assertion パターン（`expect(` / `assert(` / `assert.`）が存在することを検査する。
2. assertion 欠如の TC を `assertionlessTcIds` フィールドで報告し、test-coverage を `failed` にする。
3. 検査粒度は「TC-ID を含むファイル全体」とし、AST 解析は行わない。
4. `TestCoverageResult` 型に `assertionlessTcIds: string[]` フィールドを追加する。

## Design Decisions

### D1: 検査粒度は「TC-ID を含むファイル全体」

**選択**: TC-ID が出現するファイル全体を対象に assertion パターンを検索する。`describe` / `it` ブロック単位での TC-ID ↔ assertion の対応は検査しない。

**理由**: 既存 test-coverage の「TC-ID を含むファイル全体を検索対象とする」粒度と一貫性がある。ブロック単位の対応検査は AST 解析が必要で複雑性が跳ね上がる。assertion が 1 つでも存在するファイルを「空 stub ではない」と見なすことで最小コストの faithfulness 検査を実現できる。

**却下案**:
- `it` ブロック単位で assertion を検査 → AST parser 依存、scope 外の複雑性。
- ファイル全体の assertion 数を閾値で判定 → 閾値の根拠が不明確。

### D2: assertion パターンは `expect(` / `assert(` / `assert.` の 3 パターン

**選択**: 正規表現 `/expect\(|assert\(|assert\./` で assertion の存在を判定する。

**理由**: spec-runner のテストスタックは vitest だが、target project は任意のテストランナーを使う。3 パターンで vitest/jest（`expect(`）と node:assert（`assert(` / `assert.strictEqual` 等）の主要フレームワークをカバーする。

**却下案**:
- `expect(` のみ → node:assert ユーザーが false negative。
- `toEqual` 等メソッド名を列挙 → パターン爆発、メンテ負荷。

### D3: `missingTcIds` と分離した `assertionlessTcIds` フィールドを追加

**選択**: 既存の `missingTcIds`（TC-ID 不在）と区別し、新フィールド `assertionlessTcIds`（TC-ID は存在するが assertion 無し）を追加する。両方が空なら `passed`、どちらかに要素があれば `failed`。

**理由**: 「TC-ID が無い」と「TC-ID はあるが空 stub」は異なる問題。build-fixer が stdout の報告を読んで修正する際、問題の種類を区別できることが必要。`missingTcIds` に統合すると修正指示が曖昧になる。

**却下案**:
- `missingTcIds` に統合 → 「TC-ID 不在」と「assertion 欠如」の区別が失われる。

## Alternatives Considered

### Alternative 1: mutation testing による厳密な faithfulness 検証

assertion が存在するだけでなく、TC に対応するテストが実際に振る舞いを検証しているかを mutation testing（コードを微小変更してテストが落ちるかを確認する手法）で機械的に保証する案。

- **Pros**: assertion と TC の意味的対応を機械的に検証できる。空 stub はもちろん、assertion はあるが TC と無関係なテストも検出できる。
- **Cons**: mutation testing の実行コストが高い（全テストを多数の mutant に対して繰り返し実行する）。target project のテスト実行環境をより深く把握する必要がある。実装複雑性が大幅に増す。
- **Why not**: 本 change の目的は「中身の歯が全くない（空 stub）」という最も安価に検出できる問題を塞ぐことにある。完全な faithfulness 検証は将来の別 request に委ね、まず assertion 存在という機械的・安価な基準で底上げする。

### Alternative 2: `it` / `describe` ブロック単位での TC-ID ↔ assertion 対応検査

TC-ID が出現する `it` ブロックを AST で特定し、そのブロック内に assertion が存在するかを検査する案。

- **Pros**: TC-ID と assertion の対応をより厳密に検査できる。同一ファイル内の別 TC の assertion で誤って pass するケースを防ぐ。
- **Cons**: TypeScript/JavaScript の AST parser への依存が必要。既存の test-coverage phase が regex + file I/O のみで実装されているのに対して複雑性が跳ね上がる。テストランナーごとのブロック構造（`test()`, `it()`, `describe()` のネスト）への対応が必要。
- **Why not**: ファイル単位の粒度は既存 test-coverage の粒度と一貫しており、AST 解析なしに実装できる。「ファイル内に assertion が 1 つもない」という最もシンプルな検出で十分なコスト対効果がある。

## Consequences

- `TestCoverageResult` 型の contract が変わる（`assertionlessTcIds` フィールド追加）。既存の consumer は空配列として後方互換。
- 空 stub（`it("TC-001", () => {})`）のみの test は test-coverage が `failed` になる。
- ファイルに TC-ID に無関係な assertion が含まれる場合、false negative として通過する（意味的対応は scope 外）。将来の mutation testing で補強可能。
- コメント内のみに assertion パターンがある test は偽陽性として通過するが、安全側（通るべきものが通る方向）であり実害は小さい。

## Scope

本 ADR は assertion **存在**の「緩い」faithfulness 検査を確立する。assertion と TC-ID の意味的対応（どの assertion がどの TC を検証しているか）は mutation testing 等の別 request に委ねる。

## References

- Request: `specrunner/changes/scenario-test-faithfulness-gate/request.md`
- Design: `specrunner/changes/scenario-test-faithfulness-gate/design.md`
- Related ADR: `specrunner/adr/2026-05-19-verification-tc-coverage.md`（test-coverage phase 確立）
