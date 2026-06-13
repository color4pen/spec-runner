# resume 時の再開コンテキストを state から自動生成し、素の resume を常に正しくする

## Meta

- **type**: spec-change
- **slug**: resume-context-auto-injection
- **base-branch**: main
- **adr**: true

## 背景

escalation 後の resume で step を再実行すると、agent は二重に「完了済み」の証拠を見る — ①resume されたセッション記憶は前回 attempt で完了報告した記憶を持つ、②worktree には前回 attempt の成果物が残っている。このため再実行の意図（再判定・作業継続）が伝わらず、人間が `--prompt` / /resume コメントに「これは N 回目の attempt で、前回はこうだった」という説明文を毎回手書きする運用になっている（2026-06-12 の #662 対応で 3 回実施）。

この説明文の内容は分解するとすべて state.json に既にあるデータ（attempt 回数・前回 verdict・前回 findings・停止理由）であり、機械が決定論的に生成できる。人間の prose に依存する現状は、文面の書き方で結果が変わる・配達障害に気づけない（#674）という脆さを持つ。

## 現状コードの前提

- `src/core/command/resume.ts:262` → `src/core/command/runner.ts:165-168` → `src/core/step/executor.ts:275,291-292` — 人間の `--prompt` / /resume コメント由来の resumePrompt が one-shot で agent prompt に注入される経路（既存）
- `src/adapter/claude-code/agent-runner.ts:175-176` — resumePrompt は `<resume-context>` セクションとして注入される
- `src/state/schema.ts:226` — `resumePoint`（step / reason / iterationsExhausted）が state に記録済み。stepRuns には attempt ごとの verdict / toolResult / findingsPath が残る
- 再開コンテキストの自動生成は存在せず、人間 prompt が無い resume では agent は前回文脈の説明なしに起こされる

## 要件

1. resume で step を再実行する際、executor が state から再開コンテキストを自動生成して agent prompt に注入する。内容: 当該 step の attempt 回数 / 前回 attempt の verdict と停止理由 / 「worktree に前回 attempt の成果物が存在しうるが、それは完了を意味しない。今回の attempt として作業・判定をやり直すこと」という再開意味論の明示
2. 人間由来の resumePrompt（--prompt / /resume コメント）は自動コンテキストに**追記**される補足とし、無くても素の resume が正しく動くこと
3. 自動コンテキストは決定論的に生成する（LLM による要約を挟まない）
4. 将来、判断記録（decision ledger 等）が state に追加された場合に注入対象へ含められる拡張点を持つこと（実装は不要、構造のみ）

## スコープ外

- resume の再開位置決定ロジックの変更（#603 の本体）
- /resume コメントの書式変更（別 request: judge 判断の構造化）
- adapter 側の注入機構の変更（resumePrompt の既存経路をそのまま使う）

## 受け入れ基準

- [ ] escalation 後の素の resume（prompt なし）で、自動生成された再開コンテキスト（attempt 回数・前回 verdict・再開意味論）が agent prompt に含まれることをテストで固定する
- [ ] 人間 prompt がある場合、自動コンテキスト + 人間 prompt の両方が含まれることをテストで固定する
- [ ] 初回実行（resume でない run）ではコンテキストが注入されないことをテストで固定する
- [ ] `typecheck && test` が green

## 関連

- 実測: 2026-06-12 #662 の escalation 対応で同内容の説明文を人間が 3 回手書きした
- #603（resume-simplify — 本 request は再開位置でなく再開時の文脈伝達のみを扱う）
- #674（resumePrompt の codex 注入。本 request の前提配管）
