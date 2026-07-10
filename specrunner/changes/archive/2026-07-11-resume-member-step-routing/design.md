# Design: resume-member-step-routing

## Context

カスタムレビュアーの並列 fan-out 実行中に中断が発生すると、`state.step` には coordinator (`custom-reviewers`) ではなく **member 名**（例: `cross-boundary-invariants`）が記録される。これは executor が各 member を個別に `state.step` に書き込むためである。

この状態から `job resume` すると、`resolveResumeStep` は `resumePoint.step`（member 名）をそのまま返す。pipeline は member 名でループを開始しようとするが、member 名に対応する遷移行が transition table に存在しないため `nextStep` が `"escalate"` に fallback し、member が `approved` を返しても pipeline が halt する。

同じ中断ライフサイクルで隣接する問題として、signal 停止時に `interruption` レコードが journal へ 2 行重複して書かれる事象がある。原因は、`signalCleanup`（`local.ts`）が async I/O を `await` する間にイベントループが一時的に idle になり、`beforeExit` が発火することで exit-guard（`exit-guard.ts`）も `appendInterruption` を実行するという **check-then-act race** である。

### 現状の制約

- `resolveResumeStep(from, resumePoint, stateStep, allowedSteps)` は priority 順 `--from > resumePoint.step > state.step` で解決し、`resumePoint.step` をそのまま返す（変換なし）。
- `buildAllowedStepSet(reviewers)` は member 名を許可集合に含めるが、coordinator `custom-reviewers` は含めない（`--from custom-reviewers` は拒否される）。
- `CUSTOM_REVIEWERS_STEP_NAME = "custom-reviewers"` は transition table に行を持ち、`runCoordinatorFanOut` が reviewerStatuses ledger の pending を再計算して再入可能設計になっている。
- exit-guard の `state.status !== "running"` チェックは signal handler の persist 完了後にしか機能しない（persist 前の race window で exit-guard が load する）。

## Goals / Non-Goals

**Goals**:

1. member 名の `resumePoint.step` を持つ state からの resume が、coordinator 経由で pipeline に入り直す。
2. `--from <member名>` の明示指定も coordinator にマッピングする（同じ挙動）。
3. coordinator を `buildAllowedStepSet` の許可集合に追加し、`--from custom-reviewers` を正式なエントリポイントとして認める。
4. signal 停止 1 回で `interruption` レコードが journal に 1 件だけ記録される。
5. exit-guard の「signal を経由しない停止への backstop」機能は維持する。

**Non-Goals**:

- reviewerStatuses / regression-gate の意味論変更
- interruption record へのシグナル名記録（#764）
- スリープ抑止（#758）
- 連続 escalation チェック（`--force`）の仕様変更
- write-scope guard の再実装（別 request: write-scope-guard-redo）

## Decisions

### D1: mapping は `resolveResumeStep` 内で行う

**採用**: member → coordinator 変換を `resolveResumeStep` に追加する。呼び出し元の `resume.ts` は `state.reviewers` を第 5 引数として渡す。

**理由**: resume step 解決の全ロジックが `resolveResumeStep` に集中している。変換をここに置くことで呼び出し元（`resume.ts`）の変更が最小となり、coordinator fan-out を持つすべての resume パスが自動的に恩恵を受ける。pipeline.ts や transition table への変更は不要。

**却下した案**:
- `resume.ts` で事前マッピングする — `resolveResumeStep` が member 名を期待しているかのように見えるため読み手を混乱させる。
- pipeline.ts で member を coordinator に再ルーティングする — coordinator fan-out の外で member を実行するコードが不要になる一方、member を「valid な start step」として transition table に追加する誘惑を生む（coordinator 外での実行は合流・statuses 更新を複製することになるため却下）。

### D2: `--from <member名>` は coordinator へサイレントマッピング（エラー化しない）

**採用**: `--from <member名>` を coordinator にマッピングし、INFO ログで通知する。エラーにはしない。

**理由**: `resumePoint.step` が member 名の場合と同じ挙動にすることで、ユーザーが `-from` の値をそのまま state ファイルから取っても正しく動作する。「coordinator を指定せよ」というエラーは、coordinator (`custom-reviewers`) が内部実装詳細である点で不親切。INFO ログが操作上の可視性を担保する。

### D3: coordinator を `buildAllowedStepSet` に追加する

**採用**: reviewers が 1 件以上存在する場合、`CUSTOM_REVIEWERS_STEP_NAME` を許可集合に加える。

**理由**: `--from custom-reviewers` が正式エントリポイントとして機能するようになる。これにより D2 のマッピング後に `allowed.has(coordinator)` チェックを通過できる。また明示的に coordinator を指定する上級ユーザーへの対応にもなる。

### D4: signal 重複抑止は process-level singleton flag で行う

**採用**: 新規モジュール `src/core/lifecycle/signal-state.ts` に `markSignalHandlerFired()` / `isSignalHandlerFired()` を定義する。`signalCleanup` が非同期処理を開始する前に同期で `markSignalHandlerFired()` を呼ぶ。exit-guard は `isSignalHandlerFired()` が true の場合に `appendInterruption` と state 遷移をスキップする。

**理由**:
- フラグ読み取りは O(1) 同期処理。journal の最終行を読む idempotent チェックより I/O オーバーヘッドが小さい。
- signal handler が起動した事実は同一プロセス内でグローバルに共有できる（Node/Bun のモジュールシングルトン）。
- exit-guard の「non-signal backstop」はフラグが `false` の場合に従来通り動作する。

**却下した案**:
- journal-level idempotency（最終行確認） — append 前に毎回 journal を読む I/O が発生する。
- signal handler 内で status を同期的に `awaiting-resume` に書き換える — `transitionJob` と `persist` は async であり、同期的な状態変更は store の整合性を壊しうる。

**非退行保証**: signal を経由しない停止（未ハンドル例外、OOM 等）ではフラグが `false` のまま exit-guard が従来通り動作する。

## Risks / Trade-offs

- [Risk] signal handler が persist 前に例外で中断した場合、exit-guard もフラグにより skip するため、state が `running` のままになりうる。→ Mitigation: 次回の `specrunner resume` 起動時に `running` 状態の job を `awaiting-resume` に遷移させる既存の cleanup 処理が対応する。また signal handler は既に `try/catch` で best-effort persist を試みている。
- [Risk] 将来 signal handler が `local.ts` 以外にも追加された場合、`markSignalHandlerFired()` 呼び出しを忘れると重複が再発する。→ Mitigation: 関数名と `signal-state.ts` のコメントで「signal handler を追加する場合は必ず呼ぶこと」を明記する。

## Open Questions

なし（architect 評価済みの設計判断ですべての分岐が解消されている）。
