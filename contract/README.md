# contract/ — pipeline を縛る契約（out-of-loop trust root）

ここは **個々の request より上位**にある、pipeline の振る舞いを縛る契約を置く場所。
人間が著者で、**pipeline / agent はここに書き込まない**（書けない）。

## なぜ specrunner/ の外なのか

spec-runner は自分自身を pipeline で開発している（dogfooding）。問題は閉ループ:

- `specrunner/adr/` は **pipeline が書く**（adr-gen ステップが生成する）。
- `specrunner/specs/` は **finish で pipeline が merge する**（spec-merge）。
- `src/` `tests/` も pipeline が書き換える。

つまり `specrunner/` 配下や `src/` は、すべて **pipeline が触れる空間**。そこに「pipeline を縛る契約」を置くと、**pipeline が自分を縛る契約を自分で書き換えられる**。検証を甘くする変更を、その甘くなった検証が承認してしまう —— これが潰したい閉ループ。

trust root は、**ループが構造的に届かない場所**に固定して初めて意味を持つ。`contract/` はそのための場所。

## pipeline との関係

- **contract/ が唯一の authority。** `specrunner/specs/` 等で報告/完了の契約を記述するものは、ここに従属する（二重 authority の drift を避ける）。
- **enforcement（型・arch test・golden case の実体）は `src/` `tests/` に出る**が、それは contract/ が定義したものを「守る側」。enforcement は pipeline が触れる空間にあるので、**enforcement の変更は人間 review 必須**（無人マージさせない）。
- 理想は `contract/` を **commit denylist** に入れて agent が触れないようにすること。仕組みが無いうちは **規律 + 人間 review** で守る（denylist 機構は別途）。

## 順序

1. **いまここ**: 契約の文書を書く（このディレクトリ）。
2. その後: 契約を**消費する** request を切り、`src/` `tests/` に型・arch test・golden case を実装する。

契約が「物として」先に存在することで、後続の request は「契約に従うだけ」になり、各 request が契約を都度決め直す（＝つぎはぎ）を防ぐ。

## ファイル

| ファイル | 中身 |
|---|---|
| `step-outcome.md` | step が結果をどう返し、pipeline がどう読むかの契約本体 |
| `invariants.md` | 守らせる不変条件と、どこで強制するか |
| `golden-cases.md` | 検査が甘くされても気づくための must-fail / must-pass |

## 出自

設計議論は issue #468 を参照。
