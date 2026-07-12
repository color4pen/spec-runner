# 不変条件カタログ（doc）と歯（test / allowlist）の B-x ID 集合が一致することを test で固定する

## Meta

- **type**: spec-change
- **slug**: invariant-catalog-id-sync
- **base-branch**: main
- **adr**: true

## 背景

architecture の構造不変条件は 2 系統で二重管理されている: (a) 定義カタログ = `architecture/model.md` §4 の表 ＋ `architecture/conformance.md` の検査表、(b) 強制する歯 = `tests/unit/architecture/core-invariants.test.ts` の `describe("B-N: ...")` と `arch-allowlist.ts` の grandfather 台帳（`invariant` フィールド）。この 2 系統の B-x ID 集合を一致させる機械的な歯が無いため、片方だけ更新すると desync が起きる。

実際に B-12（`node:child_process` の直接 import を seam に限定する不変条件）がテスト側にのみ存在し、doc カタログは B-11 までで止まっている desync が発生し、手作業で doc を追随させて解消した。同じ drift は次に不変条件を追加・削除するたび再発しうる。加えて、範囲を散文で書いた古い表記（`arch-allowlist.ts` ヘッダと `core-invariants.test.ts` 冒頭の「B-1 through B-8」）も現行の B-12 から取り残されており、同種の陳腐化の実例になっている。

本 request は、この desync を **構造的に再発不能にする歯**を追加し、残存する陳腐化表記を現行化する。

## 現状コードの前提

- `architecture/model.md` §4 — 不変条件カタログの正本。表の各行は `| **B-N** | invariant | なぜ |` 形式。現状 B-1〜B-12。系統説明（B-1〜B-4 = 依存方向 / B-5〜B-12 = edge に写らない構造制約）も同節にある
- `architecture/conformance.md` — 検査表 `| **B-N** ... | assert する内容 | 検査方法の候補 |`。現状 B-1〜B-12
- `tests/unit/architecture/core-invariants.test.ts` — `describe("B-N: ...")` が B-1〜B-12 を強制（B-10 / B-11 は追加順の都合でファイル末尾寄り = ID は非連番の出現順）。grep ヘルパ（`grepE` / `parseGrepOutput` / `isCommentLine` / `filterViolations`）が既存。**test が `architecture/*.md` を読む箇所は現状ゼロ**（本 request が最初のパーサ導入）
- `tests/unit/architecture/arch-allowlist.ts` — `AllowlistEntry.invariant`（`"B-N"`）を持つ grandfather 台帳。CODEOWNERS で `/tests/unit/architecture/ @color4pen` にゲートされている（`arch-allowlist.ts:12-13`）
- 陳腐化した散文範囲表記: `arch-allowlist.ts:5`（「B-1 through B-8」）、`core-invariants.test.ts:4`（「invariants B-1 through B-8」）。いずれも現行は B-12

## 要件

1. doc カタログ（`model.md` §4 の表 ＋ `conformance.md` の検査表）から抽出した B-x ID 集合と、歯（`core-invariants.test.ts` の `describe("B-N")` ＋ `arch-allowlist.ts` の `invariant` フィールド）が参照する B-x ID 集合が **一致することを test で固定する**。一致は双方向: doc に無く歯にある ID（undocumented invariant）も、doc にあり歯に無い ID（documented-but-unenforced invariant）も red にする
2. 抽出源を限定する: カタログの正本は §4 の表と conformance の検査表に限る。散文中の `B-6` 等の言及や、`divergence-status.md` 等の状況断面 doc を catalog 抽出源に含めない（誤抽出で偽陽性/偽陰性を出さない）
3. B-12 が doc カタログから欠落した状態（＝今回発生した実 desync）を再現し、それが red になることを検出テストで固定する。合わせて、抽出集合が空でないこと（壊れた抽出が vacuous に pass しない）を liveness として固定する
4. 陳腐化した散文範囲表記を現行化する: `arch-allowlist.ts:5` と `core-invariants.test.ts:4` の「B-1 through B-8」を現行範囲に更新する

## スコープ外

- 不変条件そのものの追加・削除・意味変更（本 request は ID 集合の整合のみ）
- B-x 以外の ID 体系（T-xx 回帰ガード ID / §3 DSM closure）の同期
- doc 散文コメントの構造的検証（散文の範囲表記は要件 4 で手修正するが、その現行性を test で恒常監視することは対象外）
- カタログ正本を単一 const（SSOT）へ一本化するリファクタ（下記「設計の方向」で不採用）
- `model.md` / `conformance.md` 以外の doc をカタログ正本に昇格すること

## 受け入れ基準

- [ ] doc カタログと歯の B-x ID 集合の一致を test で固定する（不一致で red）
- [ ] B-12 を doc カタログから除いた状態が red になることを検出テストで固定する（今回の実 desync の再現 fixture）
- [ ] liveness: 抽出した ID 集合がいずれも空でないことを test で固定する（壊れた抽出が vacuous pass しない）
- [ ] `arch-allowlist.ts` / `core-invariants.test.ts` の「B-1 through B-8」散文表記が現行範囲に更新されている
- [ ] 既存の architecture テスト（B-1〜B-12 の各検査）が無変更で green
- [ ] `typecheck && test` が green

## 設計の方向（request 作成者の推奨・design step で確定する）

- **推奨**: doc 集合と test/allowlist 集合の **cross-check**（両者を独立に抽出して一致を assert）。既存の二重管理（doc・test・allowlist の 3 参照）はそのまま残し、その一致だけを歯で保証する最小変更。desync 再発防止という目的に対し過不足ない
- **不採用（design で覆すなら理由を記録）**: 不変条件 ID を単一 const `INVARIANT_IDS` に一本化し 3 者がそれを参照する SSOT 化 — 3 者の参照点を 1 箇所に寄せる大きい構造変更で、各 `describe` が意味を持つ歯の可読性を損なう。今回の目的（ID 集合の drift 検出）には過剰
- **配置**: 新しい歯は `core-invariants.test.ts` に追加するか独立ファイルにするかは design 判断。doc 読み取りは `fs.readFileSync` で足りる（既存 grep ヘルパの流用は必須でない）
