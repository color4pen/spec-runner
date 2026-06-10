# agent session の一過性エラーを有限回の自動再試行で吸収する

## Meta

- **type**: new-feature
- **slug**: transient-error-auto-retry
- **base-branch**: main
- **adr**: false

## 背景

agent session が一過性のインフラエラー（API への接続失敗等）で落ちると、pipeline は即座に halt し、人間が素の `job resume` を打つまで止まる。実運用では「数秒〜数分の瞬断 → 判断ゼロの resume」というパターンが繰り返し発生しており（1 日で 5 回の実績）、この復帰作業は機械化可能である。escalation の前に有限回・backoff 付きで自動再試行し、瞬断を無人で吸収する。粘りは有限予算とし、使い切ったら現行どおりの halt（人間の resume 待ち）に落ちる — 無限再試行は構造的に起こさない。

## 現状コードの前提

- 一過性エラーの実例（観測値）: `Claude Code SDK query failed: ... API Error: Unable to connect to API (ConnectionRefused)` / 同 `(FailedToOpenSocket)`。エラー生成箇所は `src/adapter/claude-code/agent-runner.ts:331` / `:511`
- 現挙動: この失敗は step のエラーとして pipeline halt（awaiting-resume）に直行し、素の `job resume` で落ちた step から再入して成功する
- 既存の有限再試行の部品と前例: `src/util/retry.ts`（指数 backoff、`maxAttempts` 既定 4、`sleepFn` 注入可）、fixer ループの maxIterations + exhaustion、report_result の follow-up retry（maxAttempts 2）
- `SESSION_RETRIES_EXHAUSTED` というエラーコードが既に存在する（`src/errors.ts:81`）

## 要件

1. transient エラーの分類をホワイトリストで定義する: 接続失敗（ConnectionRefused / FailedToOpenSocket / timeout / 5xx 相当）のみを transient とし、**未知・その他のエラーは現行どおり即 halt**（fail-closed）
2. transient エラーで agent step が失敗した場合、halt の前に有限回・指数 backoff で自動再試行する（既定: 最大 3 回、`util/retry` の型に従う）。再試行の配置（adapter 内の query 再試行か、executor による step 再実行か）は design 判断とする
3. 予算を使い切ったら現行と同一の halt（awaiting-resume + resumePoint 記録）に落ちる。escalation という脱出口を変更しない
4. 再試行の事実を観測可能にする: 試行回数を StepRun / events.jsonl に記録し、「N 回再試行の末の halt」と「即 halt」が後から区別できること。進捗 stdout にも再試行中である旨を出す
5. 再試行回数の予算は step の成功でのみリセットされる（同一 step 内で失敗し続ける限り予算は減る一方）
6. 上限値は config で調整可能にする（既定 3、0 で機能無効 = 現行挙動）
7. 再試行の再入セマンティクスを design で明示する: session を継続できる場合（既存の resumeSessionId 相当の機構）は中断点から継続し、継続不能な場合は step 先頭から再実行する。先頭から再実行する場合、中断した session の途中成果（書きかけのファイル等）が worktree に残り得ることを前提に、各 step class が安全に再入できる根拠（例: implementer は tasks.md のチェック状態から続きを判断する既存設計）を design.md に記載する

## スコープ外

- 外側からの見守り・自動 resume（inbox の責務）
- transient 以外のエラー（agent の判断エラー・verification 失敗等）の扱い
- managed runtime 固有の session 再スケジューリング機構の変更

## 受け入れ基準

- [ ] transient エラーを 1 回挟んで成功するケースで、halt せずに step が完走する（mock でテスト）
- [ ] **persistent な transient エラー（毎回失敗）を与えたとき、既定 3 回の再試行後に必ず halt に到達する**（無限ループしないことの直接検証）
- [ ] 非 transient エラー（未知のエラー文字列）は再試行されず即 halt する
- [ ] 試行回数が state に記録され、進捗出力に再試行が表示される
- [ ] 上限 0 の config で現行挙動と完全一致する
- [ ] 再入セマンティクス（session 継続 / step 先頭再実行と途中成果の扱い）が design.md に明示されている
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- 有限予算 + escalation 脱出口という既存ループ規律（fixer / follow-up retry / util/retry）の適用であり、新しいループの型を導入しない。無人で吸収するのは「判断の要らない復帰」のみで、判断の要る escalation の意味論には触れない
