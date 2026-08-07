# code-fixer の fallback prompt が CRITICAL findings の修正義務を欠落している

## Meta

- **type**: bug-fix
- **slug**: code-fixer-critical-fallback
- **base-branch**: main
- **adr**: false

## 背景

code-fixer の prompt には findings を本文に埋め込む経路と、findings ファイルの読み取りを指示する fallback 経路がある。findings 埋め込み経路は「Fix all HIGH and CRITICAL severity findings (mandatory)」と指示するが、fallback 経路 2 箇所は「Fix all HIGH severity findings (mandatory)」で **CRITICAL が欠落**している。fallback 経路に入った場合、agent が CRITICAL findings を修正義務なしと解釈し放置しうる。severity 階層上 CRITICAL > HIGH であり、正当化できる差ではない。

## 現状コードの前提

- `src/core/step/code-fixer.ts:191` 付近（findings 埋め込み block）: `1. Fix all HIGH and CRITICAL severity findings (mandatory)`
- 同ファイル :219 付近と :291 付近（fallback block、`Review feedback: ${findingsPath}` を読ませる経路）: `2. Fix all HIGH severity findings (mandatory)` — CRITICAL の言及なし
- conformance 経路（:148 付近）も `Fix all HIGH and CRITICAL severity findings from the conformance review (mandatory)` で CRITICAL を含む
- tests/ に `Fix all HIGH`（and CRITICAL なし）を期待する assertion は存在しない（grep 0 件）

## 要件

1. fallback block 2 箇所の指示を `Fix all HIGH and CRITICAL severity findings (mandatory)` に修正する
2. code-fixer の全 prompt 経路（findings 埋め込み・fallback・conformance）で CRITICAL が mandatory に含まれることを test で固定する

## スコープ外

- prompt template 間の重複統合（別課題）
- spec-fixer の prompt（severity 階層を持たない別契約）

## 受け入れ基準

- [ ] `src/core/step/code-fixer.ts` 内に `Fix all HIGH severity findings` （`and CRITICAL` を伴わない形）が grep 0 件
- [ ] 全 prompt 経路の CRITICAL mandatory を固定する test が追加され green
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- 文言修正のみで prompt 構造には触れない（構造統合は経路ごとの契約差の整理が必要で、bug-fix の範囲を超える）
