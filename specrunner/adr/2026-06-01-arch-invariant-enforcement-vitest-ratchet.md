# ADR-20260601: アーキ不変条件の enforcement 機構として vitest arch test 拡張 + ratchet allowlist を採用

**Date**: 2026-06-01
**Status**: accepted

## Context

`architecture/model.md` は 7 層の closure model（§3）と 8 つの構造不変条件 B-1〜B-8（§4）を定義しているが、唯一の歯 `tests/unit/architecture/module-boundary.test.ts` は `core/request/` のみ scoped であり `core/runtime/` を明示除外していた。その結果、既知の複数の divergence が CI に捕まらず増殖可能な状態にあった（`2026-05-31-structure-rulings` ADR に記録）。

enforcement を core 全体に拡張するにあたり、`model.md` §6 が挙げる 2 つの実装機構の選択が必要になった:

1. **dependency-cruiser** — TS-native の静的解析ツール。宣言的に `forbidden`/`allowed`/`required` ルールを JSON/JS で記述。
2. **vitest arch test の拡張** — 既存テストの `grep + expect` パターンを core 全体に拡張。

さらに、既知 divergence の扱いとして:

- **big-bang（全 divergence を修正してから歯を on）**: 着手が遅れ、その間も新規 divergence が増える。
- **ratchet（現状を allowlist で凍結して regression を止め、burn-down は後続 change）**: 先に regression を止め、修正は高 ROI 順に進める。

## Decision

### D1: vitest arch test 拡張を採用（dependency-cruiser は不採用）

既存 `tests/unit/architecture/module-boundary.test.ts` と同じ `grep + expect` パターンで `tests/unit/architecture/core-invariants.test.ts` を新規作成し、core 全体（`core/runtime/` 除外を解除）に B-1〜B-8 + closure を assert する。

**採用理由**:

- **no-new-dep**: dependency-cruiser は devDependency 追加が必要。現行 devDeps は最小限（typescript, eslint, tsup, @types/node）であり、solo・minimal-ceremony 原則に照らして追加コストが不均衡。
- **incremental**: 既存テストが `grep + expect` パターンを確立済み。同パターンで B-1〜B-8 をカバーでき、学習コスト・保守コストが低い。
- **bun compatible**: dependency-cruiser は Node.js 前提であり Bun との互換性が不確実。vitest は Bun で動作確認済み。
- **allowlist の表現**: TypeScript 定数配列で allowlist を定義し、grep 結果からフィルタすれば ratchet を TypeScript 型安全に実現できる。

**dependency-cruiser の保留（src-wide 拡張時に再検討）**:

dependency-cruiser は宣言的で `model.md` §3 の closure 表を直接 compile しやすい。src 全体への enforcement 拡張（後続 change）では grep ベースのスケール限界が顕在化するため、その段階で dependency-cruiser への移行を改めて評価する。

### D2: ratchet allowlist を採用（big-bang 不採用）

現状の既知 divergence を `tests/unit/architecture/arch-allowlist.ts` に TypeScript 型付き定数配列として grandfather し、allowlist 込みで enforcement が today green になるようにする。

**採用理由**:

- **regression を先に止める**: big-bang では全修正完了まで新規 divergence が無検出のまま増殖する。ratchet は即日 CI を赤にする能力を確立する。
- **allowlist = §5 divergence 台帳の機械形**: `model.md` §5 の散文台帳を「縮むだけの機械強制 allowlist」に写す。台帳と歯の二重 authority drift を解消し、エントリ削除＝divergence 解消が機械的に追える。
- **一方向（不可逆）**: allowlist への追加は divergence 増を意味するため CODEOWNERS + PR review でゲート。削除のみを正とすることで ratchet が緩まない。
- **burn-down 分割**: R2（runtime SDK import）・R1（parser→core 循環）・R3（step-names back-edge）・R4（util leaf 違反）を高 ROI 順に後続 change で1件ずつ削れる形にする。

### D3: 既存 module-boundary.test.ts は削除せず共存

`core/request/` scoped の既存テストは独立した regression guard として価値を持つため残す。新テスト `core-invariants.test.ts` は core 全体 scope で B-1〜B-8 + closure を網羅し、将来 src-wide に拡張する際に rename/拡張するのが自然。

### D4: allowlist エントリ構造を TypeScript 型で強制

各エントリに `file`（違反ファイルパス）・`invariant`（`B-2` 等）・`tracking`（`R2` 等の burn-down ID）を必須フィールドとして型定義する。フィールド欠落は TypeScript compile error になる。

### D5: B-5〜B-8 は call-site grep で検出

B-5（判定系 I/O）・B-6（raw process.env）・B-7（raw stdout/stderr）・B-8（config.runtime 散在）は依存方向ではなく call-site の制約であるため、import 解析ではなく呼び出し箇所の grep で検出する。

## Alternatives Considered

### Alternative 1: dependency-cruiser による静的解析（D1 の対抗案）

- **Pros**: 宣言的。`model.md` §3 の closure 表を `forbidden`/`allowed`/`required` に直接 compile できる。大規模 codebase に scalable。
- **Cons**: devDependency 追加が必要。dependency-cruiser は Node.js 前提であり Bun との互換性が不確実。設定ファイルを別途管理する必要がある。no-new-dep 原則に抵触する。
- **Why not**: 現時点の core scope では vitest 拡張が十分。grep ベースのスケール限界が顕在化する src-wide 拡張時（後続 change）に改めて評価する。

### Alternative 2: big-bang（全 divergence を修正してから歯を on）

- **Pros**: allowlist が不要。コードと歯が完全同期した状態で enforcement を開始できる。
- **Cons**: R1〜R4 の修正完了まで（複数 change スパン）新規 divergence が無検出のまま増殖する。着手が遅れる。solo では一気修正のコストが高い。
- **Why not**: ratchet の方が即日 regression を止められる。burn-down は高 ROI 順に後続 change で分割できる。

### Alternative 3: JSON/YAML 形式の allowlist ファイル

- **Pros**: ツール非依存で人間が読める。テキストエディタでも編集しやすい。
- **Cons**: TypeScript 型安全性がない。JSON はコメントが書けない。テストから import する際にパース処理が必要になる。
- **Why not**: `arch-allowlist.ts` の TypeScript 定数配列で型安全性・コメント・直接 import の利便性をすべて満たせる。

### Alternative 4: eslint import rules による制約

- **Pros**: 既存 eslint セットアップに乗れる。lint 段階（コンパイル前）で検出できる。
- **Cons**: layer 間の方向制約（upper→lower forbidden）を宣言的に表現しにくい。allowlist 相当の粒度を eslint rule で実現するには AST 解析の実装コストが高い。false positive のリスクもある。
- **Why not**: vitest arch test の方が既存パターンに近く、テスト結果と CI 連携が自然。layer matrix を直接コードに転写できる。

## Consequences

### Positive

- 本 change 以降、`src/core/` に新規 forbidden edge が入った瞬間に CI が red になる（unknown edge = divergence の closure 保証）
- allowlist が縮む方向にのみ変化する一方向 ratchet が確立される
- `model.md` §5 の散文台帳と allowlist が同期し、二重 authority drift がなくなる
- 後続 change（R1〜R4 burn-down）がエントリ削除という明確なゴールを持てる

### Negative

- grep ベースの検出は false positive / false negative のリスクがある（import パターンの変化・コメント内のマッチ等）
- src 全体への拡張時（後続 change）では grep ベースのスケール限界が出る可能性がある → dependency-cruiser 再検討の起点になる

### Known Debt

- **src-wide 拡張未完**: 本 change は `src/core/` に限定。`src/` 全体（adapter/parser/util 等）への enforcement 拡張は後続 change に委ねる。その際に dependency-cruiser への移行を再評価する。
- **単一 mutator 未対応**: lifecycle 不変条件（`store.fail()`/`exit-guard` の raw status 書き等）は import graph でも call-site grep でも捕まりにくいため、本 change の allowlist・テスト対象から除外。後続 change で enforcement 設計を別途検討する。
- **R1/R3/R4 の allowlist 化**: parser→core（R1）・step-names back-edge（R3）・util leaf 違反（R4）は src-wide 拡張 change で allowlist 化・テスト対象化する。

## References

- Request: `specrunner/changes/arch-test-core-wide-ratchet/request.md`
- Design: `specrunner/changes/arch-test-core-wide-ratchet/design.md`
- Delta spec: `specrunner/changes/arch-test-core-wide-ratchet/specs/module-boundary/spec.md`
- `architecture/model.md` — §3 closure model・§4 B-1〜B-8・§5 divergence 台帳・§6 enforcement 選択肢
- ADR `2026-05-31-structure-rulings` — E1（arch test を core 全体へ拡張）の起点
- Implementation: `tests/unit/architecture/core-invariants.test.ts`・`tests/unit/architecture/arch-allowlist.ts`
