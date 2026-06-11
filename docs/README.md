# ドキュメントの配置原則

このリポジトリのドキュメントは、置き場ごとに「読者」と「腐り方」が決まっている。何かを書くときは、まずこの表で置き場を決める。

| 置き場 | 読者 | 性質 | 腐り方 |
|---|---|---|---|
| `README.md` | 使い始める人 | 本筋の通り道（install → request → run → archive）+ 各領域への導線 | 散文。本筋以外を足さないことで守る |
| `docs/` | 使い込む人 | how-to（request の書き方、無人運用） | 散文。**最小の冊数**を保つ |
| `architecture/` | 構造を変える人 | 構造の正典 + 設計 ADR | 定義 doc は変更に追随、ADR は追記専用 |
| `specrunner/project.md` | **agent**（毎 job 注入） | プロジェクト概要・不変の構造知識 | 腐ると agent を直接誤導する。機能の形が変わったら必ず追随 |
| `specrunner/rules/` `specrunner/reviewers/` | **agent**（実行される） | 規律・レビューレンズ（データとしての知識） | load-time validation と実行で常時運動。黙って腐れない |
| `specrunner/adr/` `CHANGELOG.md` | 履歴を辿る人 | pipeline 生成の挙動 ADR / リリースノート | 追記専用・生成。更新義務なし |

## 原則

1. **各事実は一箇所にだけ住む。** 他の場所はリンクする。正確な signature・型は常にコードが正典で、docs は責務と契約の形までを書く
2. **散文を増やす前に、データにできないか考える。** 実行される知識（rules / reviewers / template のコメント）は腐れば検知されるが、散文は黙って腐る
3. **README は痩せたまま保つ。** 機能が増えたら README には1節+リンクだけ足し、奥行きは docs/ へ
4. **時間断面を時間に依存しない文書に書かない。** 進行中の状態は issue / drafts に、決着は archive / ADR に
5. **agent という読者を忘れない。** `specrunner/project.md` と rules/ は人間向け文書の写しではなく、毎 job の文脈そのもの。pipeline の形を変える変更は、この層の追随を完了条件に含める
