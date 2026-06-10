# README を公開向けに拡充する（pipeline 概要・コスト目安・前提と対応範囲・0.x 宣言）

## Meta

- **type**: chore
- **slug**: readme-public-release
- **base-branch**: main
- **adr**: false

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

## 背景

README.md は Installation / Quick Start / failure-resume / コマンドリファレンス / Configuration / Runtime Modes / Troubleshooting を備え、運用ドキュメントとしては機能している。一方で、作者以外のユーザーが初見で読む前提の情報 — pipeline が何をどう進めるか、escalation が正常な停止であること、1 request あたりのコスト、信頼モデルと対応プロジェクト範囲、0.x の安定性宣言 — が欠けている。npm 公開に先立ちこれらを追記する。

## 要件

1. 冒頭に pipeline 概要の節を追加する: request-review → design → spec-review → test-case-gen → implementer → verification → code-review → conformance → adr-gen → PR という step の流れと、各 judge step で needs-fix ループが回ること、escalation は失敗ではなく「人間の判断待ち」の正常な停止であり `job resume` で再開することを説明する。step 名は実装（`src/kernel/step-names.ts`）と一致させる
2. コスト目安の節を追加する: `specrunner/changes/archive/*/usage.json` の実測データを集計し、典型的な request 1 件あたりの token 使用量と USD 換算レンジ（最小〜中央値〜最大程度の粒度）を記載する。使用モデルが config で変更可能であることと、レンジが request の複雑さに依存することを併記する
3. 前提と対応範囲の節を追加する:
   - request.md は信頼された入力である（request を書いた本人が PR を承認する solo 運用が前提。第三者の request.md をそのまま流す運用は想定外）
   - verification は package.json の scripts（build / typecheck / test / lint）検出に基づくため、主対象は Node / Bun プロジェクトである。scripts が検出できないプロジェクトでは検証ゲートが働かず、品質保証がレビュー agent の判断に依存することを明記する
   - 外部コントリビュータのいるリポジトリでは git log / diff が agent prompt に入るため、信頼できないコミット履歴を持つリポジトリでの実行は推奨しないことを注意書きする
4. 安定性宣言の節（または冒頭バッジ直下）を追加する: 0.x の間は state / config フォーマットに破壊的変更があり得ること、migration は提供されるが semver minor で入ることを明記する
5. 追記はすべて既存 README の言語（英語）と見出し・コードブロックの体裁に合わせる
6. 既存節の記述は変更しない（追記のみ。既存内容と矛盾が見つかった場合は修正せず escalation で報告する）

## スコープ外

- npmjs.com への公開作業（registry 変更・publish 設定）
- ドキュメントサイトの構築
- architecture/ 配下のドキュメント変更
- README の既存節のリライト・再構成

## 受け入れ基準

- [ ] pipeline 概要・コスト目安・前提と対応範囲・安定性宣言の 4 節が追加されている
- [ ] pipeline 概要の step 名・遷移が実装（step-names.ts / pipeline/types.ts の STANDARD_TRANSITIONS）と一致している
- [ ] コスト数値が usage.json の実測集計に基づいており、算出方法が節内に一言示されている
- [ ] 既存節に差分がない（追記のみ）
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- ドキュメントサイトは設けず README 一本とする。リポジトリ外の文書はコードと同じ PR でレビューされず乖離するため、ユーザー文書も repo 内に置く（architecture/ を repo 内に固定しているのと同じ理由）。README が 400 行を超えたら repo 内 docs/*.md への分割を検討する
