# golden cases — 検査が甘くされても気づくための固定ケース

grounded な検査（verdict 判定 / fixableCount / verification 等）が将来こっそり甘くされても、
**「絶対に通してはいけない入力」「絶対に弾いてはいけない入力」**を固定しておけば、
「落ちるべきものが通った」で検出できる。

検査ロジックを変える変更を実行する時、これらが期待通りに判定されることを assert する。

## 通してはいけない（甘くなると通ってしまう危険なもの）

- 空 / 壊れた agent の結果が `approved`（OK）扱いされない。
  （読めない＝通さない。新契約でもこの safe 側を維持。）
- `approved=false`（needs-fix）なのに `fixableCount=0` という矛盾を通さない。
- verification でテストが失敗（exit code ≠ 0）しているのに `passed` にならない。

## 弾いてはいけない（正常なのに止めると困るもの）

- 指摘なしの clean な `approved` → 進む。
- `approved` + `fixableCount > 0` → fixer（observation）→ 進む（re-review なし）。

## 方針メモ

- 優先順位は **「正しいのに止める（false-halt）」を避ける方**に置く。細かい must-fail を増やすより、誤って止めないことを優先。
- ただし「JSON が取れない時は halt せず次へ進む」設計のため、**grounded な床（この golden case 群と verification）が"飛ばした agent step の受け皿"も兼ねる**。床が薄いと、飛ばした分がすり抜ける。だから床は厚く保つ。
- カタログは今は最小限。具体的な「これが通ったら終わり」が出てきたら追加する。

## 出自

issue #468 / `step-outcome.md` / `invariants.md`。
