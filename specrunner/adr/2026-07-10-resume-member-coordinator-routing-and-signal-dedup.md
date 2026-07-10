# custom reviewer member step の resume は coordinator 経由に統一し、シグナル停止の interruption 重複を singleton flag で防ぐ

**Date**: 2026-07-10
**Status**: accepted
**Related**:
- `specrunner/adr/2026-06-07-resume-point-as-canonical-source.md`（`resolveResumeStep` 設計の先行決定）
- Issue #769（member 名 resumePoint → escalate 落ちの実例）

## Context

### 問題 1: member 名 resumePoint からの resume が escalate に落ちる

custom reviewer の並列 fan-out 実行中にプロセスが中断されると、`state.step` には coordinator (`custom-reviewers`) ではなく **member 名**（例: `cross-boundary-invariants`）が記録される。executor が各 member を個別に `state.step` へ書き込むためである。

この状態から `job resume` すると、`resolveResumeStep` は `resumePoint.step`（member 名）をそのまま返す（先行 ADR D1 "verbatim" 方針）。pipeline は member 名でループを開始しようとするが、member 名に対応する遷移行が transition table に存在しないため `nextStep` が `"escalate"` に fallback し、member が `approved` を返しても pipeline が halt する。`--from code-review` で正規遷移から入り直す workaround を知らなければ job は完成不能になる。

`runCoordinatorFanOut` は `reviewerStatuses` ledger から pending member を再計算する再入可能設計になっており、coordinator (`custom-reviewers`) を resume エントリポイントとして使えば approved 済み member の再実行を回避しつつ正規遷移を辿れる。

### 問題 2: シグナル停止で interruption レコードが 2 行重複する

`signalCleanup`（`local.ts`）が async I/O を `await` する間にイベントループが一時的に idle になり、`beforeExit` が発火することで exit-guard（`exit-guard.ts`）も `appendInterruption` を実行する **check-then-act race** が存在する。exit-guard の `state.status !== "running"` チェックは、signal handler の persist 完了後にしか有効に機能しない（persist 前の race window でロードするため）。

結果として同一 ts の interruption レコードが journal に 2 行記録され、fold 消費者（resumePoint 材料・将来の verify）にノイズが伝播する。

## Decision

### D1: member → coordinator マッピングを `resolveResumeStep` 内で行う

`resolveResumeStep` に `reviewers` 引数を追加し、`--from` または `resumePoint.step` が custom reviewer の member 名を指す場合、`CUSTOM_REVIEWERS_STEP_NAME`（`"custom-reviewers"`）に変換して返す。

**Rationale**: resume step 解決ロジックが `resolveResumeStep` に集中している。変換をここに置くことで呼び出し元 `resume.ts` の変更が引数追加 1 行に留まり、coordinator fan-out を持つ全 resume パスが自動的に修正される。pipeline.ts や transition table の変更は不要。

先行 ADR の "verbatim" 方針（D1）は「静的 step および regression-gate は変換しない」として維持し、member → coordinator への変換を**意図的な例外**として追加する。coordinator こそが member 実行の唯一エントリポイントであるため、verbatim に返すことが誤りである。

**却下した案**:
- `resume.ts` で事前マッピング — `resolveResumeStep` が member 名を受け入れるかのように見えて読み手を混乱させる
- pipeline.ts でメンバーを coordinator に再ルーティング — member の合流・statuses 更新・approvedAtCommit 記録を coordinator 外で複製することになる

### D2: `--from <member名>` は coordinator へサイレントマッピング（エラーにしない）

`--from <member名>` を `--from custom-reviewers` と等価に扱い、INFO ログで変換を通知する。エラーにはしない。

**Rationale**: `resumePoint.step` が member 名の自動 resume パスと同じ挙動にすることで、ユーザーが `--from` の値をそのまま state ファイルから取っても正しく動作する。coordinator (`custom-reviewers`) が内部実装詳細である点で「coordinator を指定せよ」エラーは不親切。

### D3: coordinator を `buildAllowedStepSet` の許可集合に追加する

reviewers が 1 件以上存在する場合、`CUSTOM_REVIEWERS_STEP_NAME` を許可集合に加える。reviewers が空の場合は追加しない（零レビュアー不変条件を維持）。

**Rationale**: D2 のマッピング後に `allowed.has(coordinator)` チェックを通過できるようにする。上級ユーザーが `--from custom-reviewers` を明示指定する経路も正式なエントリポイントとして認める。

### D4: signal 重複抑止はプロセスレベル singleton flag で行う

新規モジュール `src/core/lifecycle/signal-state.ts` に `markSignalHandlerFired()` / `isSignalHandlerFired()` を定義する。`signalCleanup` が非同期処理を開始する前に同期で `markSignalHandlerFired()` を呼ぶ。exit-guard の全 handler は `isSignalHandlerFired()` が `true` の場合に `appendInterruption` と state 遷移をスキップする。

**Rationale**:
- フラグ読み取りは O(1) 同期処理。journal 末尾確認より I/O オーバーヘッドが小さい。
- signal handler が起動した事実は同一プロセス内でグローバルに共有できる（Node/Bun モジュールシングルトン）。
- exit-guard が担う「signal を経由しない停止の backstop」機能は、フラグが `false` の場合に従来通り動作するため維持される。

**新設契約**: signal handler を追加する場合は、最初の `await` より前に `markSignalHandlerFired()` を同期呼び出しすること。`signal-state.ts` のコメントに明記する。

**却下した案**:
- journal-level idempotency（末尾行確認） — append 前に毎回 journal を読む I/O が発生する
- signal handler 内で status を同期的に `awaiting-resume` へ書き換える — `transitionJob` と `persist` は async であり同期変更は store の整合性を壊しうる
- resume 側で重複容認 + 表示側 dedupe — 記録時点で防げる重複を fold 消費者全員に負担させる

## Alternatives Considered

### Alt-A: member step を transition table に動的追加する

member が resume した場合に、その member 名から `regression-gate` への遷移行を動的に追加する。

- **Pros**: `resolveResumeStep` を変更せずに pipeline 側だけで対処できる
- **Cons**: fan-out の合流・`reviewerStatuses` 更新・`approvedAtCommit` 記録を coordinator の外で複製することになる。coordinator を member の唯一実行経路とする原則が崩れる
- **Why not**: 却下

### Alt-B: `--from <member名>` を明示エラーにして coordinator 指定を案内する

member 名を `--from` に渡した場合、`"Invalid --from value. Use --from custom-reviewers to re-enter the coordinator."` で失敗させる。

- **Pros**: 不正な入力を早期に弾く
- **Cons**: coordinator (`custom-reviewers`) は内部実装詳細であり、ユーザーが step 名を state ファイルからコピーした場合に不必要な障壁となる。自動 resume パスと `--from` 指定パスで挙動が非対称になる
- **Why not**: D2 のサイレントマッピングを採用。却下

### Alt-C: journal-level idempotency で signal 重複を防ぐ（D4 の代替）

`appendInterruption` を呼ぶ前に journal の末尾行を読み、同一 ts の interruption レコードが既存する場合は追記をスキップする。

- **Pros**: フラグを持ち込まず、journal が自己完結した防衛策になる
- **Cons**: `appendInterruption` が呼ばれるたびに journal I/O が発生する。O(1) の同期フラグと比べてオーバーヘッドが大きく、将来の高頻度呼び出しにスケールしない
- **Why not**: signal handler が起動した事実はプロセス内でモジュールシングルトンとして共有可能であり、I/O を介さない singleton flag の方が軽量・明確。却下

### Alt-D: resume 側で重複を容認し、表示側で dedupe する（D4 の代替）

journal への重複記録を許容し、fold 消費者（UI / resumePoint 計算等）が重複行をフィルタリングして無視する。

- **Pros**: 記録側の変更が不要。既存の append パスを一切触らない
- **Cons**: journal は "truth" であり、同一事象の重複記録は fold する全消費者にノイズを渡す。resumePoint 材料・将来の verify チェック・すべての読み手が個別に dedupe 責務を負うことになる。根本的な race を解消せず、問題の表面だけを隠す
- **Why not**: 記録時点で防げる重複を読み手全員に負担させる形になるため却下

## Consequences

### Positive

- member 名 resumePoint を持つ job が正規終端（regression-gate → conformance → pr-create / awaiting-archive）まで進む。escalate への fallback 経路が消える。
- coordinator が member 実行の唯一エントリポイントとして明確化される。approved 済み member の不要な再実行が起こらない（`reviewerStatuses` ledger の pending 再計算に従う）。
- signal 停止 1 回につき interruption レコードが journal に 1 件だけ記録される。journal を fold する消費者（resumePoint 材料・将来の verify）に重複ノイズが伝播しなくなる。

### Negative / Known Debt

- `markSignalHandlerFired()` を呼ばない signal handler が将来追加された場合、重複が再発する。`signal-state.ts` のコメントで呼び出し義務を明記して緩和する。
- signal handler が persist 前に例外で中断した場合、exit-guard もフラグにより skip するため state が `running` のままになりうる。次回 resume 起動時の既存 cleanup 処理が対応する。

## References

- Request: `specrunner/changes/resume-member-step-routing/request.md`
- Design: `specrunner/changes/resume-member-step-routing/design.md`
- Spec: `specrunner/changes/resume-member-step-routing/spec.md`
- Related ADR: `specrunner/adr/2026-06-07-resume-point-as-canonical-source.md`
