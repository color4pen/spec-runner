# Design: arch-test-core-wide-ratchet

## Context

`architecture/model.md` は 7 層（composition-root / domain / ports / adapters / persistence / shared-kernel / leaf）の closure model（§3）と 8 つの構造不変条件 B-1〜B-8（§4）を定義している。しかし現状の唯一の歯 `tests/unit/architecture/module-boundary.test.ts` は **core/request/ のみ** scoped であり、core/runtime/ を明示除外している。結果として既知の divergence が複数存在し、CI は新規 divergence を検出できない。

enforcement 機構の選択肢として `model.md` §6 は 2 つを挙げている:
1. **dependency-cruiser** — TS-native の静的解析ツール。宣言的に `forbidden`/`allowed`/`required` ルールを JSON/JS で記述。
2. **vitest arch test の拡張** — 既存テストに grep ベースのアサーションを追加。

## Goals / Non-Goals

**Goals**:
- 構造 enforcement を core 全体に拡張（core/runtime の除外を解除）
- B-1〜B-8 + closure model を assert する歯を立てる
- 現状の既知 divergence を ratchet allowlist として凍結し today green にする
- allowlist に無い新規 forbidden edge で red になる regression guard を確立する

**Non-Goals**:
- 個別 divergence の修正（R1〜R4、B-6/7/8 seam 修正は後続 change）
- src 全体への enforcement 拡張（本 change は core scope に限定）
- architecture/ docs の編集
- dependency-cruiser による src-wide full enforcement（後続 change で検討）

## Decisions

### D1: vitest arch test 拡張を採用（dependency-cruiser は不採用）

**選択**: 既存 vitest arch test (`tests/unit/architecture/module-boundary.test.ts`) を core 全体に拡張する方式。

**Rationale**:
- **no-new-dep**: dependency-cruiser は devDependency 追加が必要。現状 devDeps は最小限（typescript, eslint, tsup, @types/node）であり、solo・minimal-ceremony 原則に反する。
- **incremental**: 既存テストが `grep + expect` パターンを確立済み。同じパターンで B-1〜B-8 をカバーでき、学習コスト・保守コストが低い。
- **bun compatible**: dependency-cruiser は Node.js 前提で Bun との互換性が不確実。vitest は既に Bun で動作確認済み。
- **allowlist の表現**: TypeScript の定数配列で allowlist を定義し、grep 結果からフィルタすれば ratchet を実現できる。

**Alternatives considered**:
- dependency-cruiser: 宣言的で §3 の表を直接 compile しやすいが、新規 dep + Bun 互換性リスク + 設定ファイル別管理が必要。closure model 全体を compile するのは src-wide 拡張時に再検討する価値がある。
- eslint import rules: 粒度が粗く、layer 間の方向制約を表現しにくい。

### D2: allowlist はテストファイル内の TypeScript 定数として定義

**選択**: `tests/unit/architecture/arch-allowlist.ts` に allowlist を TypeScript 配列として定義。各エントリに `file`, `invariant` (B-#), `tracking` (R#) を持たせる。

**Rationale**:
- CODEOWNERS-gated な `tests/unit/architecture/` 内に配置されるため governance は既存パスで確保。
- TypeScript 型でエントリ構造を強制でき、ドキュメントとコードが乖離しない。
- テストから直接 import して使えるため、別ファイル形式（JSON/YAML）のパース不要。

**Alternatives considered**:
- JSON ファイル: 型安全性がなく、コメントも書けない。
- dependency-cruiser の `allowed` / pathNot 設定: D1 で不採用としたため連動して不採用。

### D3: テストファイルを新規作成し既存ファイルは触らない

**選択**: `tests/unit/architecture/core-invariants.test.ts` を新規作成。既存の `module-boundary.test.ts` は core/request scoped のまま残す（削除しない）。

**Rationale**:
- 既存テストは core/request の B-1 regression guard として独立した価値がある。
- 新テストは core 全体 scope で B-1〜B-8 + closure を網羅するため、scope が異なる。
- 将来 src-wide に拡張する際に `core-invariants.test.ts` を `src-invariants.test.ts` に rename/拡張するのが自然。

### D4: closure model は layer-mapping + forbidden-edge 方式で実装

**選択**: §2 の layer-mapping（パス→層の対応表）を定義し、§3 の closure table で ✗ のセルに該当する import を grep で検出。allowlist にない hit があれば fail。

**Rationale**:
- §3 の表を直接コードに転写できる（7×7 の boolean matrix）。
- grep パターンを layer 単位で構成すれば、新規 layer 追加時も matrix 更新のみで対応可能。
- unknown edge（表に定義されていないモジュールからの import）も自動的に ✗ 扱いになり closure が成立。

### D5: B-5〜B-8 は pattern-match ベースの grep 検査

**選択**: B-5（判定系 I/O）、B-6（raw process.env）、B-7（raw stdout/stderr）、B-8（config.runtime 散在）は import graph ではなく call-site の grep で検出。

**Rationale**:
- B-5〜B-8 は「依存方向」ではなく「call-site 制約」。import 解析では捕まらない。
- grep パターンが明確（process.env, process.stdout, config.runtime 等）で false positive を制御しやすい。
- allowlist で known violations をフィルタすれば ratchet が成立。

## Risks / Trade-offs

- [Risk] grep ベースの検出は false positive / false negative がある → Mitigation: allowlist のエントリごとにコメントで grep パターンと期待動作を記述。regression guard テストで false red を検証。
- [Risk] vitest grep アプローチは src-wide 拡張時にスケールしない可能性 → Mitigation: 本 change は core scope に限定。src-wide では dependency-cruiser 再検討を ADR に明記。
- [Risk] allowlist が「追加されやすい」方向に drift する → Mitigation: CODEOWNERS で `tests/unit/architecture/` をゲート。allowlist に entry 追加は divergence 増を意味するため PR review で検出。

## Open Questions

- なし（architect 評価済みの判断で解消済み。ADR に trade-off を残す）。
