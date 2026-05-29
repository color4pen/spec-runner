# invariants — 守らせる不変条件

`step-outcome.md` の契約のうち、**機械的に強制する**もの。HARD = 破ったら CI を落とす / build を止める。doc = 規律（人間が見る）。

enforcement の実体（arch test / lint / type）は `src/` `tests/` に出るが、そこは pipeline が触れる空間なので、**enforcement を変える変更は人間 review 必須**（無人マージさせない）。甘くする変更を無人で通すと、不変条件が骨抜きになる。

## HARD（強制）

- **INV-1: deterministic なコードは agent の文章を routing / outcome に使わない。**
  例: transition の `when` 述語が結果ファイルの本文（`fileContent`）を読んだら fail。routing は型付きフィールドのみ。
  enforce: `src/core/pipeline` / `src/core/step` への arch test。

- **INV-2: outcome は「構造化 JSON（agent）」か「grounded な計算（cli）」からのみ来る。**
  文章を正規表現で読んで verdict を作らない。
  enforce: 同上 arch test + 該当パーサの不在チェック。

- **INV-3: 期待した JSON が来ない時、文章で代用しない。**
  来ない → 更新しない / 進む。壊れている → 追撃で出し直し。**どの経路でも prose に fallback しない。**
  enforce: adapter / executor のテスト。

> INV-1〜3 は要するに同じこと —— **「プログラムは JSON だけ読む、文章は読まない」**。これが守られていれば、書式強制の閉ループは構造的に起きない。

## doc（規律 / 人間 review）

- escalation は agent から出さない（halt は枯渇のみ）。
- step-class 別の outcome 形（producer=success/error、judge=approved/needs-fix+fixableCount、grounded=計算）。
- 結果は「追撃後の最後の有効 JSON」を採用。毎回フルで上書き。
- 追撃（rules）は 1 回・注入のみ・検証なし。

## 出自

issue #468 / `step-outcome.md`。
