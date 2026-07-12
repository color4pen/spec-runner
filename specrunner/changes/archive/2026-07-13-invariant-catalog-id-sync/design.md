# Design: 不変条件カタログ（doc）と歯（test / allowlist）の B-x ID 集合を test で一致固定する

## Context

architecture の構造不変条件 B-x は **4 つの参照点**に分散して二重管理されている:

| 参照点 | 役割 | 抽出形 |
|---|---|---|
| `architecture/model.md` §4 の表 | 定義カタログ（正本）| 行頭セル `\| **B-N** \|` |
| `architecture/conformance.md` (A) の検査表 | 検査仕様カタログ（正本）| 行頭セル `\| **B-N** ... \|` |
| `tests/unit/architecture/core-invariants.test.ts` の `describe("B-N: ...")` | 強制する歯（検査本体）| `describe("B-N ...` |
| `tests/unit/architecture/arch-allowlist.ts` の `AllowlistEntry.invariant` | 強制する歯（grandfather 台帳）| `invariant: "B-N"` |

この 4 者の B-x ID 集合が一致すべきだが、それを保証する機械的な歯が無い。実際に **B-12**（`node:child_process` の直接 import を seam に限定する不変条件）がテスト側にのみ存在し、doc カタログ 2 表は B-11 で止まる desync が発生し、手作業で doc を追随させて解消した。同じ drift は次に不変条件を追加・削除するたび再発しうる。

現時点の実測値（本 change の設計時点でリポジトリを走査して確認）:

- `model.md` §4 表 = {B-1 … B-12}
- `conformance.md` (A) 表 = {B-1 … B-12}
- `describe("B-N")` = {B-1 … B-12}（ファイル内の出現順は非連番: B-9 の後に B-12、その後 B-10 / B-11）
- `arch-allowlist.ts` の `invariant` = {B-1, B-6, B-12}（**部分集合**。B-2〜B-5 / B-7〜B-11 は divergence ゼロで burn-down 済みのため台帳に entry を持たない。`"DSM"` は B-x 体系外で entry ゼロ）

つまり **allowlist は enforced 集合の部分集合であり、完全一致は成立しない**。これは設計上重要な非対称性で、後述の D3 / D4 がこれを扱う。

**信頼配置**: `architecture/`（`model.md` / `conformance.md`）と `tests/unit/architecture/`（歯）はいずれも `CODEOWNERS` で `@color4pen` にゲートされている。本 change が追加するファイル・編集する 2 ファイルもこの gate 下に入るため、pipeline が無人でカタログ整合の歯を緩めることはできない。

**歯の現状**: test が `architecture/*.md` を読む箇所は現状ゼロ。本 change が最初の doc パーサを導入する。既存 grep ヘルパ（`grepE` / `parseGrepOutput` / `filterViolations`）は subprocess grep 依存で src ツリー向けであり、doc 表のセル解析には不向き。doc 読み取りは `fs.readFileSync` + 行パースで足りる。

## Goals / Non-Goals

**Goals**:

- doc カタログ（`model.md` §4 表 ＋ `conformance.md` (A) 表）から抽出した B-x ID 集合と、歯（`describe("B-N")` ＋ allowlist の `invariant`）が参照する B-x ID 集合が**一致することを test で固定**する。不一致は双方向で red（doc に無く歯にある = undocumented / doc にあり歯に無い = documented-but-unenforced）。
- 抽出源を **§4 表と (A) 検査表のセル行に限定**する。散文中の `B-6` 等の言及・`divergence-status.md` 等の状況断面 doc を catalog 抽出源に含めない。
- **B-12 が doc カタログから欠落した状態（今回の実 desync）を再現**し、それが red になることを検出テストで固定する。
- **liveness**: 抽出集合（model / conformance / describe）が空でないことを固定し、壊れた抽出が vacuous に pass しないようにする。
- 陳腐化した散文範囲表記 `arch-allowlist.ts:5` / `core-invariants.test.ts:4` の「B-1 through B-8」を現行範囲「B-1 through B-12」に更新する。
- 既存の B-1〜B-12 各検査を**検査ロジック無変更**で green に保つ。

**Non-Goals**:

- 不変条件そのものの追加・削除・意味変更（本 change は ID 集合の整合のみ）。
- B-x 以外の ID 体系（`T-xx` 回帰ガード ID / §3 DSM closure ID）の同期。allowlist の `"DSM"` invariant 値は抽出対象外。
- doc 散文コメントの構造的検証。散文範囲表記は要件 4 で手修正するが、その現行性を test で恒常監視することは対象外。
- カタログ正本を単一 const（`INVARIANT_IDS`）へ一本化する SSOT 化リファクタ（D2 の代替案として棄却）。
- `model.md` / `conformance.md` 以外の doc をカタログ正本に昇格すること。
- allowlist の `invariant` 値の書式検証（`"B12"` 等の typo 検出）。B-x 集合整合の範囲を超える。

## Decisions

### D1: 歯は独立した新ファイルに置く（`core-invariants.test.ts` に混ぜない）

新しい歯を `tests/unit/architecture/invariant-catalog-parity.test.ts` として追加する。`core-invariants.test.ts` には**追記しない**。

- **Rationale**: この歯は `core-invariants.test.ts` を**テキストとして読み**、`describe("B-N")` を正規表現で抽出する。歯を同一ファイルに置くと、その歯自身が持つ検出テストの合成 fixture 文字列（例: `describe("B-13" ...)` 相当の再現データや、後述 D5 の摂動テキスト）が同ファイルの抽出対象に混入し、`describe` 集合を汚染する危険がある。抽出対象 4 ファイル（`model.md` / `conformance.md` / `core-invariants.test.ts` / `arch-allowlist.ts`）を全て「自分以外」に保つことで、この自己汚染の可能性を構造的に消す。
- **配置は `tests/unit/architecture/`**: 既存の歯と同居し、`CODEOWNERS`（`/tests/unit/architecture/`）ゲート下に入る。vitest `include`（`tests/**/*.test.ts`）と tsconfig `include`（`tests/**/*.ts`）の双方に自動的に含まれるため、追加設定は不要。
- **Alternatives considered**:
  - *`core-invariants.test.ts` に `describe` を 1 つ追記* — 自己汚染リスク（上記）に加え、検出テストの摂動データが同ファイル走査に載る。独立ファイルの方が読み取り境界が明快。
  - *`src/` 側にパーサを置き test から import* — doc 整合検証はテスト専用で production code path を持たない。src に置く必要がなく、B-x 層検査（B-5 の fs import 制約等）の対象を無用に増やす。テストファイル内 module-local 関数で十分。

### D2: 4 つの純粋抽出関数（テキスト → `Set<string>`）＋ セクション限定パース

新ファイル内に、副作用のない module-local 関数を定義する（ファイル読み取りとパースを分離し、D5 の摂動テストがパーサを再利用できるようにする）:

- `extractModelCatalogIds(md: string): Set<string>` — `model.md` テキストを受け取り、**§4 セクション**（見出し `## 4.` から次の `## ` 見出しまで）を切り出し、その範囲内で行頭セルが `**B-N**` の表行（`/^\s*\|\s*\*\*B-(\d+)\*\*/`）から `B-<n>` を収集する。
- `extractConformanceCatalogIds(md: string): Set<string>` — `conformance.md` テキストを受け取り、**(A) セクション**（見出し `### (A)` から次の `### ` 見出しまで）を切り出し、同じ行頭セル `**B-N**` パターンで収集する。
- `extractDescribeIds(ts: string): Set<string>` — `core-invariants.test.ts` テキストから `/describe\("B-(\d+)/g` で全 `describe` タイトル先頭の B-id を収集する。
- `extractAllowlistIds(ts: string): Set<string>` — `arch-allowlist.ts` テキストから `/invariant:\s*"B-(\d+)"/g` で `invariant` フィールド値を収集する（`"DSM"` や `AllowlistEntry` 型 JSDoc の `e.g. "B-1"` は `invariant:` キーを伴わないため自然に除外される）。

正規化: 抽出した数値 `n` を `` `B-${parseInt(n, 10)}` `` に正規化し（`B-01` と `B-1` の不一致を防止）、`Set<string>` に格納する。比較・表示は数値昇順ソート（`(a,b) => idNum(a) - idNum(b)`）で行い、B-2 < B-10 の順序で diff が読めるようにする。

セクション切り出しヘルパ `sliceSection(text, startRe, endRe): string` は、`startRe` にマッチする見出しが**見つからなければ throw** する（heading 書式が変わったら空返しで vacuous pass するのではなく loud に失敗させる）。

- **Rationale**: 要件 2（抽出源の限定）を「行頭セル `**B-N**` パターン」＋「§4 / (A) セクション限定」の二重防御で満たす。実測（設計時走査）では行頭セルパターン単独でも両ファイルとも正規の 12 行のみに一致するが、セクション限定を重ねることで「将来 §4 / (A) 以外の表に `**B-N**` 行が現れても catalog に混入しない」ことを保証する。散文（`> **2 系統** … B-5〜B-12 …` のような blockquote 行や `B-6/B-7/B-10` の言及）は行頭が `|` でないため両防御に掛からず、確実に除外される。
- **Alternatives considered**:
  - *SSOT 化: `INVARIANT_IDS` 単一 const に一本化し 4 者がそれを参照* — 4 参照点を 1 箇所に寄せる大きい構造変更で、各 `describe` が独立した意味を持つ歯の可読性を損なう。desync 検出という目的に対し過剰（要件のスコープ外）。棄却。
  - *既存 `grepE` / `parseGrepOutput` の流用* — subprocess grep 依存で src の import 行走査向け。doc 表のセル構造（行頭 `\| **B-N**`）解析には行単位 `fs.readFileSync` + 正規表現の方が単純で、grep のエスケープ地雷を避けられる。
  - *セクション限定なしのパターン単独* — 実測では十分だが、要件 2 が「§4 の表と conformance の検査表に限る」を明示するため、セクション限定を加えて意図を構造化する。

### D3: parity は「カタログ（model ≡ conformance）」対「歯（describe ∪ allowlist）」の双方向一致

集合を次のように組む:

- **カタログ内部整合**: `extractModelCatalogIds` と `extractConformanceCatalogIds` が**等しい**ことを独立に assert する（両者とも「正本」であり、片方だけの drift を精密に局在化する）。等しいことを確認したうえで `catalogIds = modelIds` を正典とする。
- **歯**: `teethIds = describeIds ∪ allowlistIds`。
- **双方向 parity**: `computeParity(catalogIds, teethIds)` が
  - `undocumented = teethIds − catalogIds`（歯にあり doc に無い）
  - `unenforced = catalogIds − teethIds`（doc にあり歯に無い）
  の**両方を空**にすることを assert する。

`allowlistIds`（部分集合、現状 {B-1, B-6, B-12}）は `describeIds`（{B-1…B-12}）の部分集合であるため、`describeIds ∪ allowlistIds = describeIds` となり、union は describe 集合に一致する。したがって union 定式化は「allowlist が enforced 集合の部分集合である」という非対称性を**自然に吸収**する（allowlist が空になっても union は describe のまま崩れない）。加えて、allowlist が**存在しない不変条件 ID を参照した場合**（例: `invariant: "B-99"`）は `undocumented` に現れて red になる。可読性のため、`allowlistIds ⊆ describeIds` を独立の it() でも明示的に assert する（失敗時に「台帳が実在しない不変条件を参照」と局在化できる）。

- **Rationale**: 要件 1 の「doc カタログ ＝ 歯」双方向一致を、部分集合である allowlist を壊さずに表現する唯一の整合的な定式化。model ≡ conformance を別 it() に切り出すことで、conformance だけが drift した場合に「どちらの表がずれたか」を精密に指す。
- **Alternatives considered**:
  - *`allowlistIds` に liveness/完全一致を課す* — allowlist は ratchet で縮み、全 burn-down 完了時に B-x entry が空になり得る。完全一致や非空 liveness を課すと**正当な空台帳で false red** になる。部分集合＋union が正しい（D4 参照）。
  - *catalog = `modelIds ∪ conformanceIds`* — conformance だけに現れた spurious B-13 も parity で捕捉できるが、model ≡ conformance の内部整合テストと二重に red を出す。`catalog = modelIds`（model ≡ conformance を別途 pin）の方が失敗の局在が明快。

### D4: liveness は model / conformance / describe に課す（allowlist には課さない）

`extractModelCatalogIds` / `extractConformanceCatalogIds` / `extractDescribeIds` の結果がそれぞれ**空でない**ことを assert する。`allowlistIds` には liveness を**課さない**。

- **Rationale**: liveness の目的は「壊れた抽出（空返し）が空集合同士の一致で vacuous pass するのを防ぐ」こと。parity の両辺（catalog と teeth の describe 由来分）が空になる経路を塞げば十分。一方 allowlist は grandfather 台帳であり、全 divergence が burn-down されれば B-x entry がゼロになるのが**正常状態**。ここに非空 liveness を課すと、台帳が正しく空になった瞬間に false red を出す。実測でも allowlist は既に部分集合（{B-1, B-6, B-12}）で、B-2〜B-11 の多くが entry ゼロなのが正常。
- **Alternatives considered**:
  - *全 4 集合に非空 liveness* — allowlist の正当な空化で壊れる（上記）。棄却。
  - *固定下限 `size >= 12` を課す* — 不変条件追加のたびに数値更新が要り、maintenance-free でなくなる。非空（`size > 0`）で要件を満たす。追加の堅牢化として「既知アンカー B-1 の存在」を確認してもよいが、AC は非空で足りるため必須としない。

### D5: 検出テストは doc テキストから B-12 行を摂動して再現する

今回の実 desync（B-12 が doc カタログ 2 表から欠落、歯には存在）を再現する検出テストを置く:

- 実 `model.md` / `conformance.md` テキストから、行頭セルが `**B-12**` の表行を除去した摂動テキストを作る（`text.split("\n").filter(line => !/^\s*\|\s*\*\*B-12\*\*/.test(line)).join("\n")`）。両ファイルから除去するのは、歴史的状態（両表とも B-11 止まり）を忠実に再現し、model ≡ conformance の内部整合を保ったまま catalog-vs-teeth の parity だけを崩すため。
- 摂動テキストを D2 のパーサに通し `catalogIdsNo12` を得る。
- **摂動ガード**: `catalogIdsNo12` が `B-12` を**含まない**ことを先に assert する（除去が効いたことの確認。行書式が変わって除去が空振りしたら、この時点で loud に失敗する）。
- 実 `teethIds`（B-12 を含む）に対し `computeParity(catalogIdsNo12, teethIds).undocumented` が **`B-12` を含む**（= red 相当）ことを assert する。

- **Rationale**: 検出テストはパーサとparity ロジックの両方を、歴史的失敗入力（表から 1 行欠落）に対して end-to-end で検証する。本 change の本質は doc 表パースなので、集合を直接いじる合成注入より、**doc テキストの行欠落を再現する**方が「パーサが欠落行を取りこぼさない」ことまで固定でき忠実。摂動が空振りしても assertion が loud に失敗するため、fail-open にならない。
- **Alternatives considered**:
  - *集合レベル摂動（`new Set(catalogIds); delete("B-12")`）* — 既存 T-04 回帰ガードの合成注入 idiom に沿い最も単純だが、パーサの行除去追随を検証しない。本 change はパーサ導入が主眼なのでテキストレベルを採用。
  - *固定 fixture ファイルを別途置く* — 実 doc からの摂動で足り、fixture の陳腐化管理が増えるだけ。棄却。

### D6: 陳腐化した散文範囲表記の現行化（要件 4）— 検査に一切触れない編集

次の 2 箇所の散文コメントを現行範囲に更新する:

- `tests/unit/architecture/arch-allowlist.ts:5` — `architecture/model.md §4 (B-1 through B-8).` → `... §4 (B-1 through B-12).`
- `tests/unit/architecture/core-invariants.test.ts:4` — `Enforces architecture/model.md §4 invariants B-1 through B-8 across the` → `... invariants B-1 through B-12 across the`

現行の B-x は連番で B-1〜B-12（全 12 個が存在）なので範囲は「B-1 through B-12」。

- **Rationale**: 要件 4 の陳腐化解消。いずれも**コメント文字列のみ**の編集で、`describe` タイトルや `invariant:` フィールド、検査ロジックには一切触れない。したがって D2 の抽出（`describe("B-` / `invariant: "B-`）はこのコメントを拾わず、既存の B-1〜B-12 各検査は無変更で green を保つ。この「検査に触れない」ことを tasks / spec で明示し、レビュアが誤って「検査改変」と読まないようにする。
- **Alternatives considered**:
  - *散文表記の現行性も test で恒常監視* — スコープ外（要件が明示的に除外）。散文の構造検証は誤抽出リスクを増やすだけで、B-x 集合整合の目的に対し過剰。手修正のみ。

## Risks / Trade-offs

- **[allowlist の正当な空化で false red]** → D4 で allowlist に liveness を課さず、D3 で union（部分集合吸収）にすることで、台帳が全 burn-down で空になっても parity は崩れない。
- **[doc の見出し / 表書式変更でパーサが空振りし vacuous pass]** → D2 の `sliceSection` は見出し未検出で throw、D4 の非空 liveness、D5 の摂動ガードの三重で、抽出が壊れた場合は red になる（silent pass しない）。
- **[要件 4 のコメント編集が「検査改変」と誤読される]** → D6 でコメント限定編集であることを明示し、tasks に「`describe` / `invariant` / 検査ロジックを変更しない」を acceptance として書く。抽出パターンがコメントを拾わないことは設計時走査で確認済み。
- **[新ファイルが CODEOWNERS ゲートで merge に owner review を要する]** → これは意図した信頼配置（歯を無人で緩めさせない）。リスクではなく仕様。実装者はファイルを worktree で作成でき、merge gate のみ owner に委ねる。
- **[allowlist の `"DSM"` や書式 typo `"B12"` が抽出されず検査を素通り]** → 本 change のスコープは B-x 集合整合。`"DSM"` は意図的に対象外（B-x 体系外）。`"B12"`（ダッシュ欠落）等の書式 typo 検出は Non-Goal（別の関心）。残存リスクとして受容し、doc に記録。
- **[describe の出現順が非連番（B-9 → B-12 → B-10 → B-11）]** → 抽出は集合（順序無視）なので影響なし。比較・表示のみ数値昇順ソートで読みやすくする。

## Open Questions

- なし。集合の抽出源・parity 定式化・liveness の掛け方・検出摂動はいずれも実測（設計時のリポジトリ走査）で確定済み。新ファイル名 `invariant-catalog-parity.test.ts` と 4 抽出関数の分割は D1 / D2 で固定。
