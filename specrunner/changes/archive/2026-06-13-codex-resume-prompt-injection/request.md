# codex adapter が resumePrompt を消費せず、escalation 後の人間判断が agent に届かない

## Meta

- **type**: bug-fix
- **slug**: codex-resume-prompt-injection
- **base-branch**: main
- **adr**: false

## 背景

issue #662 の run（2026-06-12）で、escalation への /resume コメント（request 作成者の判断記録）を 2 回投稿したが、resume された request-review（gpt-5.5）が 3 回連続で一字一句同等の finding を報告して escalation を繰り返した。調査の結果、inbox の planResumes はコメントから prompt を正しく抽出し runResumeCore に渡しているが、**codex adapter が `ctx.session.resumePrompt` を一切参照しておらず**、判断文が agent prompt に到達していなかった。

/resume コメントジェスチャーは issue 起点運用の中核（escalation 対応の既定経路）であり、codex 経路でこれが無言で無効になるのは運用上の致命傷になる。

## 現状コードの前提

- `src/adapter/claude-code/agent-runner.ts:175-176` — `ctx.session.resumePrompt` を `<resume-context>` セクションとして main プロンプトに注入する（正常系の参照実装）
- `src/adapter/codex/agent-runner.ts` — `resumePrompt` への参照が 0 件（grep 確認済み）。resume 時は `resumeThread` でセッション復元のみ行う
- `src/core/inbox/planner.ts:160-226` — planResumes は escalation marker を cutoff に、それ以降の /resume コメントから `parseResumePrompt` で判断文を抽出し ResumeAction に載せる（正常動作を確認済み）
- `src/core/inbox/run-inbox.ts:334-336` — `runResumeCore(slug, { prompt })` へ受け渡し（正常）
- 実測: #662 で同一 HIGH finding × 3 回（13:38 / 13:45 / 14:00）、判断文への言及ゼロ

## 要件

1. codex adapter の main turn プロンプトに `ctx.session.resumePrompt` を注入する。形式・意味論は claude-code adapter の `<resume-context>` 注入と同等にする（共通化の可否は design で判断）
2. resumePrompt が無い通常 run のプロンプトは変化させない

## スコープ外

- inbox / planner 側の変更（正常動作を確認済み）
- claude-code adapter の変更

## 受け入れ基準

- [ ] resumePrompt 設定時に codex の main turn プロンプトへ判断文が含まれることをテストで固定する
- [ ] resumePrompt 未設定時のプロンプトが従来と同一であることをテストで固定する
- [ ] `typecheck && test` が green

## 関連

- 実測: #662 の 3 連続同一 escalation（2026-06-12）
- **#673 と同一ファイル（src/adapter/codex/agent-runner.ts）を編集するため、並列実行せず順次とすること**
