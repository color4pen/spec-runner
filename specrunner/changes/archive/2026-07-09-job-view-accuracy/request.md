# job ls / job stats の表示・集計を事実に一致させる

## Meta

- **type**: bug-fix
- **slug**: job-view-accuracy
- **base-branch**: main
- **adr**: false

## 背景

運用ビュー系の 2 コマンドに「観測事実と食い違う値を表示する」bug がある。

1. `job ls` は awaiting-resume の job に escalation 発生元 step を表示するが、導出が steps 履歴全体の走査であるため、escalation を解消して resume した後に別の理由（poll timeout / iteration exhaustion 等）で再び awaiting-resume になった job でも、過去の解消済み escalation を現在の待機理由として表示する。次アクション（`job resume`）は正しいため実害は理由ラベルの誤りだが、運用一覧の目的（今なぜ止まっているか）に反する。
2. `job stats` は usage.json を slug のみで解決するため、同一 slug の複数 job（archive 済み request の再 run で発生し得る）が同じ change dir に解決され、一方の job の cost が両方の行に合算されて `costUsdTotal` が二重計上される。invocation には jobId が記録されているのに突合に使われていない。

## 現状コードの前提

- `src/core/job-list/operations-view.ts:150-167` — `deriveEscalationSourceStep` は `state.steps` 全体から `verdict === "escalation"` の最新 run を拾う。現在の中断理由は参照しない
- `src/state/schema.ts:107-113` — `ResumePoint { step, reason: string, iterationsExhausted, exhaustionPhase? }` が現在の中断を表す。設定箇所は `src/core/pipeline/pipeline.ts:218,426,683` と `src/core/step/executor.ts:412`（reason: "timeout" 等）
- `src/state/schema.ts:518-521` — `resumePoint` は optional（legacy state には存在しない）
- `src/core/command/job-stats.ts:358-376` — usage.json の解決は `getJobSlug` → `resolveChangeDir(slug)` のみで、invocation を jobId で filter しない
- `src/core/job-access/resolve-change-dir.ts:16-56` — slug は active 優先、無ければ最新日付の archive dir に解決される。同一 slug の複数 job は全て同じ dir に解決される
- `src/core/usage/types.ts:17` — invocation は `jobId?: string` を持つ（optional、旧データには無い）

## 要件

1. `job ls` の escalation 発生元表示を「現在の中断が escalation 由来であるとき」に限定する。導出は `resumePoint`（現在の中断の record）に紐づけ、steps 履歴全体の走査による過去 escalation の誤帰属を排除する
2. `resumePoint` を持たない legacy state では、従来の履歴走査による導出をフォールバックとして維持する（表示消失の退行を防ぐ）
3. `job stats` の cost 集計で、usage.json の commandInvocations を当該 job の jobId で突合し、他 job の invocation を混入させない
4. jobId フィールドを持たない旧形式 invocation は従来どおり計上する（後方互換）

## スコープ外

- `resumePoint` schema の変更（reason の enum 化を含む）
- usage.json 書式の変更
- `job ls` / `job stats` の表示フォーマット・列構成の変更（導出値の修正のみ）
- `resolve-change-dir` の解決規則の変更

## 受け入れ基準

- [ ] escalation 由来の awaiting-resume で発生元 step が表示され、timeout / iteration exhaustion 由来の awaiting-resume では（steps 履歴に過去の escalation があっても）表示されないことをテストで固定する
- [ ] `resumePoint` を持たない legacy state fixture で従来どおり表示されることをテストで固定する
- [ ] 同一 slug で jobId が異なる 2 job が同一 usage.json に解決される fixture で、各行の cost が自 jobId の invocation 合計のみとなり、summary の costUsdTotal に二重計上がないことをテストで固定する
- [ ] jobId 無し invocation のみの usage.json fixture で従来どおり計上されることをテストで固定する
- [ ] 既存テスト無変更で green
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **採用**: escalation 表示の一次情報源を `resumePoint` とし、legacy state のみ従来の履歴走査をフォールバックにする。`resumePoint` は中断時に必ず書かれる現在値で、「今なぜ止まっているか」という表示意図と一致する
- **却下**: `resumePoint.reason` を enum 化してから実装する案 — persisted schema の変更を伴いスコープが膨らむ。reason の判定は escalation 中断を書き込む既存箇所の実値に従う
- **却下**: 履歴走査に「最後の resume 以降」の時刻 cutoff を入れる案 — resume 時刻の別ソースが必要になり、`resumePoint` 参照より間接的で誤帰属の余地が残る
- **却下**: usage.json の jobId 無し旧 invocation も厳密突合で除外する案 — 旧データの cost が一律 null になる退行。後方互換（従来計上）を維持する
