# hard-crash 後の resume を進捗(state.step)から再構築し、「再開位置が不明」での詰まりを解消する

## Meta

- **type**: bug-fix
- **slug**: resume-from-progress
- **base-branch**: main
- **adr**: false

## 背景

README は「**State lives in your repository, not in a process. Kill the process, reboot — the next run picks up where things stood.**」を掲げる（README.md:192）。しかし最もありふれたクラッシュ（`kill -9` / OOM / コンテナ回収 / 電源断）ではこれが成立しない。

graceful な停止（Ctrl-C / SIGTERM / 通常の escalation・予算切れ）だけが「しおり」= `resumePoint` を書く。hard crash はシグナルハンドラが走らないため `resumePoint` も interruption record も書かれず、ジョブは `status=running` / `step=<中断 step>` のまま残る。

`resume` は回復時に `awaiting-resume` へ遷移するが、`resumePoint` が null かつ `--from` 未指定だと「再開位置が不明」で失敗する。**進捗 `state.step` は実行前に毎回永続化されている（中断 step が分かる）のに、それを再開判断に使わない。** 無人運用（inbox）ではこの失敗を3回繰り返した後、誤った「crash loop suspected」理由で人間に escalation する。

修正は単純で、**`resumePoint` が無ければ既に永続化済みの `state.step` から再開 step を導出する**。新規の書き込みは不要（データは既に state にある）。

## 現状コードの前提

- `README.md:192` — 「Kill the process, reboot — the next run picks up where things stood.」（本 request が守る契約）。
- `src/core/step/executor.ts:206` — agent step は実行前に `await store.update(jobState, { step: step.name })` で `state.step` を永続化する（中断しても残る）。
- `src/core/pipeline/pipeline.ts:347-348` — 各 step 実行後に `store.persist(state)`。`state.step` / `state.steps` は毎 step ディスクに残る。
- `resumePoint` を書くのは graceful 停止のみ: local シグナルハンドラ（`src/core/runtime/local.ts:837-855` の `appendInterruption` + `resumePoint`）と pipeline の escalation / exhaustion（`src/core/pipeline/pipeline.ts:218,424,681`）。hard crash はハンドラ不発で `resumePoint`・interruption とも書かれない。
- `src/core/command/resume.ts:163-166` — `resumePoint === null && this.options.from === undefined` で「再開位置が不明」を throw（`No resume point`）。`resumePoint` だけを見る。
- `src/core/command/resume.ts:148` — 一方で escalation チェックには `resumePoint?.step ?? (state.step ? toStepName(state.step) : undefined)` と `state.step` を既に使っている（=`state.step` は参照可能）。
- `src/core/resume/resolve-step.ts:31-36` — `resolveResumeStep(from, resumePoint)` は `from` 未指定 + `resumePoint` null で throw する。
- `src/core/command/resume.ts:115-133` — stale running 検出時の回復遷移は `pid: null` のみ patch し、`resumePoint` を設定しない。
- `resumePoint.reason` / `iterationsExhausted` は `src/core/resume/resume-context.ts:42-43` で再開プロンプトに表示するだけ（cosmetic）。再開ロジックは使わない。
- ループ予算カウンタは `src/core/pipeline/pipeline.ts:264` で毎 run `new Map()` から初期化され、`resumePoint.iterationsExhausted` を引き継がない（resume で予算はどのみちリセットされる既存挙動）。
- 無人回復: inbox は resume 失敗を `MAX_STALE_RECOVERY_ATTEMPTS`(3) 繰り返した後 escalation する（`src/core/inbox/run-inbox.ts:291-312`、理由 "Auto-recovery exceeded max attempts (crash loop suspected)"）。

## 要件

1. `resumePoint` が無い場合、再開 step を `state.step` から導出する。再開 step の決定順序を **`--from` → `resumePoint.step` → `state.step`** とし、いずれも無い（1 step も開始していない）場合のみ「再開位置が不明」で失敗させる。`src/core/command/resume.ts` の guard（163-166）と `src/core/resume/resolve-step.ts` の throw 経路を、この順序を満たすよう変更する。
2. `resumePoint.reason` / `iterationsExhausted` の合成は行わない（cosmetic かつ再開ロジック非依存）。`resumeContext`（`resume.ts:264`）は `resumePoint` 不在時 `undefined` のままで良い（既存 null ガード維持。hard crash 時は中断理由メモが付かないだけで機能影響なし）。
3. hard crash で中断した step は再開時に頭からやり直す（既存の `resumePoint` 再開と同じ step 粒度の意味論）。`state.step` が完了済み step を指す場合の扱い（verbatim 再実行 / 次 step へ前進）は design が決める。**verbatim 再実行を既定**とする。
4. inbox 自動回復が、`resumePoint` の無い stale running job を **1サイクルで回復**できる（3回失敗 → escalation 経路に入らない）。

## スコープ外

- cancel の永続化順序、managed シグナルハンドラの interruption 追記、`--no-worktree` archive の冪等性、fresh-persist 順序（同テーマだが別 request）。
- ジョブ作成直後・最初の step 永続化前のクラッシュ（`state.step` すら無いウィンドウ）。回収不能のまま「再開位置が不明」で良い（別 finding）。
- ループ予算の resume 引き継ぎ（現状のフレッシュ初期化のまま。挙動変更しない）。

## 受け入れ基準

- [ ] `status=running` / `step=<某>` / `resumePoint` なし / プロセス死 のジョブを resume すると、`state.step` から再開し、その step を再実行することをテストで固定する。
- [ ] `state.step` も `resumePoint` も無い（1 step 未開始）ジョブのみ「再開位置が不明」で失敗することをテストで固定する。
- [ ] `resumePoint` がある通常ケースの再開挙動が不変であること（回帰なし）をテストで固定する。
- [ ] inbox 自動回復が `resumePoint` 無しの stale running job を1サイクルで回復し、3回失敗 → escalation 経路に入らないことをテストで固定する。
- [ ] `typecheck && test` が green。

## architect 評価済みの設計判断

- **採用**: 再開 step を進捗（`state.step`）から再構築する。`state.step` は実行前に永続化される（`executor.ts:206`）ため hard crash でも残る。**却下: `resumePoint` を毎 step 更新して新鮮なしおりを保つ案** — `state.step` と二重管理になり冗長。読む側のフォールバックで足り、新規書き込みはゼロ。
- **採用**: `reason` / `iterationsExhausted` は合成しない。再開ロジック非依存（`resume-context.ts` の表示専用）であり、ループ予算も毎 run リセットされるため不要。最小差分にして退行面を小さく保つ。
- **採用**: 中断 step の再実行は step 粒度の既存 resume 意味論に一致。mid-step の途中再開はしない（`resumePoint` があってもしていなかった）。
