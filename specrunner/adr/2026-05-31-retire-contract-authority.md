# ADR-20260531: contract/ を out-of-loop authority として退役させる

## ステータス

accepted

## コンテキスト

`contract/` は PR #469 と ADR `2026-05-31-structure-rulings`（D1）で、`architecture/`（構造）の兄弟となる **out-of-loop な「振る舞い側 authority」** として新設された（step-outcome 規約・INV-1/2/3・golden cases を置き、CODEOWNERS でループ外固定）。

2026-05-31 の設計対話でこの位置づけを再検討した結果、以下が判明した:

1. **「振る舞い authority」は誤称**。`contract/` が記述するのは pipeline の*振る舞い*（どの step が走り何を produce するか＝`specrunner/specs/` の領分）ではなく、**step の結果をコードがどう返し・どう読むかの契約（Design by Contract の不変条件）**。契約は振る舞いではない。
2. **強制の実体は散文でなくテストと型**。INV-1/2/3 の歯は `tests/unit/contract/`（CODEOWNERS-gated な arch test）、verdict/outcome の data contract は型（`src/core/port/report-result.ts`）。`contract/*.md` はそれを人間向けに記述した散文に過ぎず、機械強制力を持たない（trust root は散文でなく gated なテスト）。
3. **中身はほぼコーディング規約レベル**。INV-1/2/3 は grep ベースの静的 call-site チェック（lint 相当）で回避が容易（別ファイル・別名・間接アクセス・書式違い）。escalation 廃止の宣言に至っては対応 arch test が無く、`executor.ts` が今も escalation を発する未強制の空手形。実コードを走らせる本物は golden-cases のみ。
4. ほぼ規約の中身に対し、`architecture/` と並ぶ**別の out-of-loop authority ディレクトリ**は過剰（minimal-ceremony 違反）。

## 決定

`contract/` ディレクトリを**退役（削除）**し、契約を実際に強制・エンコードされている場所へ一本化する:

- **歯（強制）= `tests/unit/contract/`**（`invariants.test.ts` / `golden-cases.test.ts`）。CODEOWNERS の `/tests/unit/contract/` gate を維持＝これが trust root。
- **data contract = 型**（`src/core/port/report-result.ts` / `src/state/schema.ts`）。
- **`architecture/` は構造のみに純化**。INV-1（routing は型付きフィールドのみ読む）と verdict×step-class 意味論を `architecture/` から除去（型・データ構造は構造として残置）。
- **CODEOWNERS の `/contract/` 行を削除**（`/tests/unit/contract/` は残す）。

`architecture/` 構造 authority はそのまま維持。**`specrunner/specs/`（振る舞い）／ 型・テスト（契約）／ `architecture/`（構造）** の三者で十分とする。

## 退役する散文の rationale（git 履歴 PR #469 から保全）

削除した `contract/` の設計判断を、強制されない知識として記録する:

- **INV の意図（decision-soundness）**: routing は型付きフィールドのみを読み、LLM の散文を制御フローに使わない。確率的散文が routing/halt を steer して「甘くなった検証が自分の緩和を承認する閉ループ」に陥るのを防ぐため。強制は `tests/unit/contract/invariants.test.ts` ＋ typed `report_result` 設計。
- **escalation 哲学**: agent は自分から「止めて」と言わない。halt は loop 枯渇のみ。**※現状未強制**（`executor.ts:460` が `verdict ?? "escalation"` を発し、禁止 arch test が無い）＝既知の gap。
- **golden の方針**: false-halt を避ける側を must-fail より優先し、grounded 検査の floor を厚く保つ。
- **step-outcome 採用ルール**: 有効な JSON が来るたびフル上書きし、最後の有効 JSON を採用。取れなければ halt せず次 step へ。

## 検討した代替案

- **contract/ を `architecture/` に統合（decision-soundness の柱として吸収）** — 却下。契約を構造定義に混ぜると `architecture/` の純度が落ち、INV（契約）を緩める変更が「構造変更」に偽装されて構造 reviewer を素通りしうる。契約は型とテストに置けば足り、`architecture/` に散文を増やす必要がない。
- **contract/ を `specrunner/rules/` のコーディング規約に移す** — 任意。test docstring ＋型で規約は自己文書化されており必須でないため今回は見送り。
- **現状維持（2 つの out-of-loop authority を並置）** — 却下。「behavior vs structure」という分割が誤り（契約は振る舞いでない）で、redundant に見える元凶。

## 影響

- out-of-loop authority が `architecture/` 一本になり、trust root は CODEOWNERS-gated な `tests/unit/architecture/` ＋ `tests/unit/contract/` に集約。
- ADR `2026-05-31-structure-rulings` の D1（contract/ 新設）と「behavior/structure の対」枠組みを本 ADR が **supersede** する。同 ADR の構造 ruling（D2〜D6）は不変。
- `architecture/` 各 doc の `(contract/)` 引用・behavior 枠組み記述を除去済み。

## 参照

- 削除した `contract/`（PR #469、git 履歴に残存）
- ADR `2026-05-31-structure-rulings` — 本 ADR が D1 を supersede
- `tests/unit/contract/` — 退役後の契約の歯（正典）
- 設計対話: 2026-05-31
