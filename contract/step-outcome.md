# step-outcome 契約

pipeline の各 step が「結果」をどう返し、orchestrator がどう読み、どう次へ進むかの契約。

## 大原則

1. **step は結果を「決まった形の JSON」で返す。** agent が書いた文章を読み取って判定するのをやめる。
2. **deterministic なコードは文章を読まない。読むのは JSON だけ。** 文章を読むのは次の agent（LLM）だけ。
   - これが守れないと、pipeline が「文章の書式」に依存し、書式を強制する閉ループに戻る。

## step-class 別 outcome

outcome の「中身」と「信用度」は step の種類で違う。1 つの汎用値に潰さない。

| class | step | outcome | 出どころ / 信用度 |
|---|---|---|---|
| **producer** | design, implementer, spec-fixer, delta-spec-fixer, code-fixer, build-fixer, test-case-gen, adr-gen | `success` / `error` | agent の自己申告（「やった/できなかった」）。信用度・低 → 下流の grounded で裏取り |
| **judge** | spec-review, code-review | `approved` / `needs-fix`（code-review は + `fixableCount`） | agent の自己申告（裁定）。信用度・低 |
| **grounded** | verification, delta-spec-validation, pr-create | 計算結果（exit code / rule / API） | report_result を通らない。信用度・高 |

- `approved` + `fixableCount > 0` は「OK だが非ブロッキングな指摘あり」= fixer で直して **re-review せず進む**（observation path）。`approved` と「直すものがある」は直交。
- producer の success は「完了したから成功」の仮定。正しさの検証は下流の grounded（verification 等）に委ねる。

## フィールド

- **`ok` フィールドは無い。** 「終わったか（liveness）」は **JSON が届いたか（report_result が呼ばれたか）** で見る。フィールドではなく presence。
- **`reason` フィールドは無い。** 失敗の説明は文章 / ログにある。将来 reason から自動修復する場合も、**文章ではなく構造化フィールド**を読むこと（文章を機械に読ませると閉ループ）。
- judge の指摘の「中身」（何を・どこを・なぜ）は文章として残し、**次の fixer（LLM）が読む**。deterministic なコードは読まない。routing に使うのは `fixableCount`（数）だけ。

## escalation と halt

- **agent は自分から「止めて」と言わない。** judge から escalation を廃止。
- **halt は loop 枯渇（回数、grounded）からのみ**起きる。grounded な cli step（verification / delta-spec-validation）は計算由来の escalation を持ってよい（self-report ではないので問題ない）。

## 結果の更新と読み取り

- step 内で agent と複数回やり取りする（本番 → 追撃）。**有効な JSON が来るたびに結果を上書き**する。
- **毎回の JSON は「今の完全な結果」を返させる**（部分更新で前のフィールドを落とさない）。
- **結果として採用するのは、追撃を抜けたあとの最後の有効な JSON。** 最初の一発（確率的で曖昧）で確定させない。

## 追撃（follow-up）

- **rules の追撃は 1 回だけ。** ルールを 1 回流し込むだけで、**守ったかの確認はしない**。
  - 正しさの検証は grounded / golden case 側に任せる方針。追撃で答えを磨き上げる路線は採らない。

## JSON が来ない / 壊れている時

| 状態 | 扱い |
|---|---|
| **idle（JSON が来ない）** | 結果を更新しない（前のまま）。追いかけない。 |
| **形が壊れた JSON** | 追撃で出し直させる。**2 回まで。3 回目で halt**（error で落としてもよい）。 |
| **最後まで有効な JSON が取れない** | **halt せず次の step へ進む**。下流の grounded な床が本当の問題を捕まえる。 |

例外: agent が**有効な JSON で「失敗（error）」と明言**した場合は別扱い。retry → 枯渇で halt。
（"取れない" と "失敗と言った" は区別する。）

## runtime

- claude-code / managed / **codex すべて同じ契約**。codex も JSON を返せるので、frozen を解除して対応させる（契約は 1 つ）。
