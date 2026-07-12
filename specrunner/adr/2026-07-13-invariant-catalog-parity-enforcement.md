# 不変条件カタログ（doc）と歯（test / allowlist）の B-x ID 集合パリティを cross-check で固定する

## Status

Accepted (2026-07-13)

## Context

`architecture/model.md` §4 と `architecture/conformance.md`（以下、doc カタログ）が定義する構造不変条件 B-x は、
`tests/unit/architecture/core-invariants.test.ts` の `describe("B-N: ...")` ブロックと
`tests/unit/architecture/arch-allowlist.ts` の `invariant` フィールド（以下、歯）によって強制される。

この doc カタログ ↔ 歯の **ID 集合一致を保証する機械的な歯が存在しなかった**。
ADR `2026-06-01-arch-invariant-enforcement-vitest-ratchet` が vitest arch test + ratchet allowlist を確立した時点でも、
doc カタログと歯の同期保証は人手（PR レビュー）に委ねられていた。

その結果、B-12（`node:child_process` の直接 import を seam に限定する不変条件）がテスト側にのみ追加され、
doc カタログ（`model.md` §4 表 / `conformance.md` (A) 表）は B-11 で止まる desync が実際に発生した。
手作業で doc を追随させて解消したが、不変条件を追加・削除するたびに同じ drift が再発しうる。

加えて、`arch-allowlist.ts` ヘッダと `core-invariants.test.ts` 冒頭の散文に「B-1 through B-8」という陳腐化した
範囲表記が残存しており、同種の drift の一例となっていた（現行は B-1〜B-12）。

本 ADR は「doc カタログ ↔ 歯の ID 集合一致を test で固定する」ための設計判断を記録する。

**実測値（本 change の設計時点）:**

| 参照点 | ID 集合 |
|---|---|
| `model.md` §4 表 | {B-1 … B-12} |
| `conformance.md` (A) 表 | {B-1 … B-12} |
| `describe("B-N")` | {B-1 … B-12}（ファイル内の出現順は非連番） |
| `arch-allowlist.ts` の `invariant` | {B-1, B-6, B-12}（部分集合。burn-down 済み entry はゼロ） |

**重要な非対称性**: allowlist は enforced 集合の**部分集合**であり、完全一致は成立しない。
divergence が全 burn-down されれば B-x entry がゼロになるのが allowlist の正常状態。

## Decision

### D1: パリティ歯は独立ファイル `invariant-catalog-parity.test.ts` に配置する

`core-invariants.test.ts` には追記せず、独立ファイルを `tests/unit/architecture/` 以下に新規作成する。

**採用理由**:

新ファイルは `core-invariants.test.ts` を**テキストとして読み**、`describe("B-N")` を正規表現で抽出する。
同一ファイルに置くと、合成 fixture 文字列（摂動テスト用の `describe("B-13" ...)` 相当データ）が
そのファイル自身の抽出対象に混入し、`describe` 集合を汚染する（自己汚染）。
抽出対象 4 ファイル（`model.md` / `conformance.md` / `core-invariants.test.ts` / `arch-allowlist.ts`）を
すべて「自分以外」に保つことで、この自己汚染の可能性を構造的に消す。

配置は `tests/unit/architecture/` であり、既存 `CODEOWNERS`（`/tests/unit/architecture/ @color4pen`）ゲート下に入る。
vitest `include`（`tests/**/*.test.ts`）と tsconfig の双方に自動的に含まれるため追加設定は不要。

### D2: SSOT 化は採用せず cross-check（独立抽出 → 一致 assert）を採用する

不変条件 ID を単一 const `INVARIANT_IDS` に一本化して 4 者がそれを参照する SSOT 化を**棄却**し、
doc カタログと歯を**独立に抽出**して集合一致を assert する cross-check 方式を採用する。

**採用理由**:

SSOT 化は 3〜4 参照点を 1 箇所に寄せる大きい構造変更であり、
各 `describe` が独立した意味を持つ歯の可読性を損なう。
今回の目的（ID 集合の drift 検出）に対して過剰であり、スコープ外。

cross-check は既存の 4 参照点をそのまま残し、その一致だけを機械的に保証する最小変更。
desync 再発防止という目的に対し過不足ない。

**4 つの純粋抽出関数** をテストファイル内 module-local に定義し、副作用（ファイル読み取り）を分離する:

- `extractModelCatalogIds(md: string): Set<string>` — `model.md` の §4 セクションに限定し、行頭セル `**B-N**` 表行から収集
- `extractConformanceCatalogIds(md: string): Set<string>` — `conformance.md` の (A) セクションに限定し、同パターンで収集
- `extractDescribeIds(ts: string): Set<string>` — `core-invariants.test.ts` の `describe("B-N` パターンから収集
- `extractAllowlistIds(ts: string): Set<string>` — `arch-allowlist.ts` の `invariant: "B-N"` パターンから収集

セクション切り出しヘルパ `sliceSection` は見出しが見つからなければ throw する（空返しで vacuous pass しない）。

抽出源の限定: カタログは §4 表と (A) 検査表のセル行に限る。散文中の `B-6` 等の言及や `divergence-status.md` 等の
状況断面 doc は含めない（行頭 `|` + `**B-N**` セルの二重防御で散文を自然除外）。

### D3: teethIds = describe ∪ allowlist（部分集合を union で吸収）

パリティの「歯」集合を `teethIds = describeIds ∪ allowlistIds` と定義する。

allowlist は enforced 集合の部分集合（現状 {B-1, B-6, B-12}）であり、全 burn-down で空になり得る。
`describe ∪ allowlist = describe`（allowlist ⊆ describe の場合）となるため、
union 定式化は allowlist の正当な縮小を自然に吸収する。

パリティの assert:
- `undocumented = teethIds − catalogIds`（歯にあり doc に無い）が空
- `unenforced = catalogIds − teethIds`（doc にあり歯に無い）が空

カタログの内部整合（`modelIds ≡ conformanceIds`）を独立の it() で別途 assert し、
「どちらの表が drift したか」を精密に局在化する。

allowlist ⊆ describe も独立の it() で明示 assert し、
台帳が実在しない invariant を参照した場合（例: `invariant: "B-99"`）を `undocumented` で検出する。

### D4: liveness は model / conformance / describe に課す（allowlist には課さない）

`extractModelCatalogIds` / `extractConformanceCatalogIds` / `extractDescribeIds` の各結果が
**空でない**ことを assert する。`extractAllowlistIds` には liveness を課さない。

**採用理由**:

liveness の目的は「壊れた抽出（空返し）が集合一致の vacuous pass を引き起こすのを防ぐ」こと。
allowlist は全 divergence burn-down 時に B-x entry がゼロになるのが正常状態であり、
非空 liveness を課すと台帳が正しく空になった瞬間に false red が出る。

### D5: 検出テストは実 doc テキストから B-12 行を除去した摂動で再現する

今回の実 desync（B-12 が両カタログ表から欠落、歯には存在）を再現する検出テストを置く。
集合レベルで `catalogIds.delete("B-12")` するのでなく、**実 doc テキストから B-12 表行を filter で除去**して
パーサを再実行する。

**採用理由**:

本 change の本質は doc 表パーサの導入。テキストレベルの行欠落再現は
「パーサが欠落行を取りこぼさない」ことまで end-to-end で固定でき、集合注入より忠実。
摂動空振り（行書式変更で filter が効かなくなる）は摂動ガード（`B-12 が含まれないことを先に assert`）で
loud に失敗し、fail-open にならない。

## Alternatives Considered

### Alternative 1: `core-invariants.test.ts` に追記する（D1 の代替）

- **Pros**: ファイル数が増えない。関連する歯が同居する。
- **Cons**: 合成 fixture 文字列がそのファイルの `describe` 抽出に混入し、抽出を汚染する（自己汚染）。
  摂動テストのデータが同ファイルの走査対象になるため、独立抽出の前提が崩れる。
- **Why not**: 自己汚染リスクが構造的に解消できない。

### Alternative 2: SSOT 化（単一 const `INVARIANT_IDS` に一本化、D2 の代替）

- **Pros**: 3〜4 参照点を 1 箇所に寄せれば desync が物理的に不可能になる。
- **Cons**: 各 `describe` が独立した意味を持つ歯の可読性が損なわれる。
  `describe("B-6: ...")` が `INVARIANT_IDS` を参照する形になると、B-6 が何の invariant かが describe から見えなくなる。
  cross-check で達成できる目的に対し過剰な構造変更。スコープ外。
- **Why not**: 目的（drift 検出）に対し過剰かつ可読性コストが高い。

### Alternative 3: 全 4 集合に非空 liveness を課す（D4 の代替）

- **Pros**: allowlist の壊れた抽出も vacuous pass しなくなる。
- **Cons**: allowlist は全 burn-down で空になるのが正常状態。非空 liveness が false red を出す。
- **Why not**: 正当な台帳の縮小でテストが壊れる。

### Alternative 4: 固定 fixture ファイルを別途置く（D5 の代替）

- **Pros**: テストが実 doc に依存しないため、doc の書式変更でテストが落ちにくい。
- **Cons**: fixture の陳腐化管理が必要。実 doc テキストの摂動で足りる。
- **Why not**: fixture 管理のコストが増えるだけで本質的な価値がない。

### Alternative 5: パーサを `src/` 側に置いてテストから import する（D1 の代替）

- **Pros**: 複数テストからパーサを再利用できる。関数を production code として型管理できる。
- **Cons**: doc 整合検証はテスト専用で production code path を持たない。`src/` に置くことで B-5（`fs` import を seam に限定する不変条件）の適用対象を無用に増やし、architecture 検査の負荷を上げる。
- **Why not**: テストファイル内 module-local 関数で十分であり、`src/` に置く必然性がない。production path が存在しない検証ロジックを `src/` に持ち込むのは 過剰。

### Alternative 6: `catalog = modelIds ∪ conformanceIds`（D3 の代替）

doc カタログを `modelIds` を正典とせず `modelIds ∪ conformanceIds` の union として parity を計算する案。

- **Pros**: conformance 表のみに現れた spurious ID（例: B-13 が conformance だけにある）も parity で捕捉できる。
- **Cons**: `model ≡ conformance` の内部整合テストと二重に red が出る。失敗の局在が「どちらの表がずれたか」ではなく「parity 違反」に曖昧化する。
- **Why not**: `catalog = modelIds`（model ≡ conformance を別途 it() で pin）の方が失敗の局在が明快。conformance だけの drift は内部整合テストが精密に指す。

## Consequences

### Positive

- 不変条件の追加・削除・移動において doc カタログと歯の間の desync が即日 CI red になる
- 既存の 4 参照点（doc 2 表 + describe + allowlist）の構造を維持したまま、最小変更で整合を保証する
- allowlist の正当な縮小（burn-down）がパリティに影響しない（部分集合を union で吸収）
- doc パーサが壊れた場合（空返し・セクション見出し変更）は liveness / sliceSection throw / 摂動ガードで
  fail-open にならず loud に失敗する
- 新ファイルが CODEOWNERS ゲート下に入るため、パリティ歯を無人で緩めることができない

### Negative / Trade-offs

- `architecture/*.md` をテストが直接読む経路が生まれる（`model.md` / `conformance.md` の見出し書式変更が
  テスト失敗を引き起こしうる）。sliceSection の throw 設計により、黙示的な空振りでなく loud な失敗になる
- allowlist の書式 typo（`"B12"` 等のダッシュ欠落）は抽出対象外であり、検出しない（B-x 集合整合のスコープを超える）
- `describe` 出現順が非連番（B-9 → B-12 → B-10 → B-11）の場合も抽出は集合扱いで順序無視。
  diff 表示は数値昇順ソートで読みやすくする

### Known Gaps / Future Work

- B-x 以外の ID 体系（T-xx 回帰ガード / §3 DSM closure ID）の同期は対象外
- allowlist `invariant` 値の書式検証（`"B12"` typo）は本 change のスコープ外
- 散文コメントの現行性を test で恒常監視することは対象外（散文の陳腐化は手修正のみ）

## References

- Request: `specrunner/changes/invariant-catalog-id-sync/request.md`
- Design: `specrunner/changes/invariant-catalog-id-sync/design.md`
- Spec: `specrunner/changes/invariant-catalog-id-sync/spec.md`
- Review: `specrunner/changes/invariant-catalog-id-sync/review-feedback-001.md` (approved, 9.65/10)
- Related: `specrunner/adr/2026-06-01-arch-invariant-enforcement-vitest-ratchet.md` — vitest arch test + ratchet allowlist の起源
- Implementation: `tests/unit/architecture/invariant-catalog-parity.test.ts`
