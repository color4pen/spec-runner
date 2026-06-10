# SECURITY.md を追加する（脆弱性報告窓口の明示）

## Meta

- **type**: chore
- **slug**: security-policy
- **base-branch**: main
- **adr**: false

## 背景

公開リポジトリに脆弱性報告の窓口定義がない。LLM agent に git worktree 内でコードを書かせ PR を作らせるツールという性質上、脆弱性報告（prompt injection、権限昇格、secrets 漏洩など）を受け取る経路の明示は一般的な OSS より価値が高い。GitHub は SECURITY.md があると Security タブと issue 作成画面に報告導線を表示する。

## 現状コードの前提

- リポジトリ直下に SECURITY.md は存在しない
- README に trust model の節があり、「request.md は信頼された入力」「solo 運用前提」が明記されている

## 要件

1. リポジトリ直下に SECURITY.md を追加する。内容は以下を含む:
   - サポートされるバージョン（0.x の最新 minor のみ）
   - 報告方法: GitHub の Private vulnerability reporting（Security タブ → Report a vulnerability）を一次窓口とする
   - 応答の目安（個人メンテナンスのため best-effort である旨を正直に書く）
   - スコープの注記: README の trust model（request.md は信頼された入力、untrusted な request.md の実行は想定外）を参照し、その前提の範囲内で何が脆弱性に該当するかを示す
2. 英語で書く（README と同じ言語）

## スコープ外

- GitHub の Private vulnerability reporting 機能の有効化（repo Settings、人間が行う）
- バグバウンティ・報奨金の言及
- README の変更

## 受け入れ基準

- [ ] SECURITY.md がリポジトリ直下に存在し、報告方法・対応方針・スコープを含む
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

なし（docs 追加のみ）
