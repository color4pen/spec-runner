# interruption レコードにシグナル名を記録する

## Meta

- **type**: bug-fix
- **slug**: signal-name-in-interruption
- **base-branch**: main
- **adr**: false

## 背景

実行中の job のプロセスが外部シグナルで終了したとき、events.jsonl の interruption レコードと transition message には `reason: "signal"` / "Interrupted by signal" としか残らず、どのシグナルを受けたのかが記録されない。SIGINT = 人の Ctrl-C / SIGTERM = システム・親プロセスの kill / SIGHUP = 端末切断、という送り主の切り分けができず、無人運用で job が止まったときの調査が状況証拠頼みになる。また SIGHUP はハンドラ未登録のため、端末切断時は exit-guard の記録なしに死ぬ可能性がある。（台帳: issue #764）

## 現状コードの前提

- `src/core/runtime/local.ts:1683-1721` — `signalCleanup` は引数を取らず、SIGINT / SIGTERM の共用ハンドラとして登録される（:1720-1721）。journal へ `{type: "interruption", reason: "signal"}` を追記し、transition は `trigger: "signal-handler"` / message "Interrupted by signal" 固定。最後に `process.exit(130)` 固定
- `src/core/runtime/managed.ts:741-776` — 同型の `signalCleanup` を SIGINT / SIGTERM に登録（:765-766）し、cleanup で `process.off`（:775-776）
- `src/core/lifecycle/exit-guard.ts:65,71,134,140,164` — interruption レコードと `resumePoint` に `reason: "signal"` を固定文字列で書く
- SIGHUP は src 内のどこにも未登録（grep で出現なし）
- `src/core/resume/canon-provenance.ts:27-32` — `INTERRUPTION_REASONS` は `reason` の値（"signal" 等）のみを照合する。フィールド追加はこの判定に影響しない
- Node の signal handler は第 1 引数でシグナル名（`NodeJS.Signals`）を受け取れるが、現状は捨てている

## 要件

1. **シグナル名の記録**: `signalCleanup` がシグナル名を受け取り、interruption レコードに `signal: "SIGINT" | "SIGTERM" | "SIGHUP"` フィールドを追加し、transition message をシグナル名入り（例: "Interrupted by SIGTERM"）にする。local / managed / exit-guard の interruption 書き込み点すべてに適用する。
2. **後方互換**: `reason` の値は "signal" のまま変えない（`resumePoint.reason` も同様）。変更はフィールド追加と message 文言にとどめ、resume 経路・canon-provenance の判定に影響を与えない。
3. **SIGHUP の登録**: local / managed 両 runtime で SIGHUP を SIGINT / SIGTERM と同じ cleanup 経路に登録し、cleanup 時の `process.off` にも含める。
4. **exit code は現状維持**: `process.exit(130)` は変更しない。

## スコープ外

- exit code のシグナル別化（128 + シグナル番号）
- `resumePoint.reason` の値の変更・正規化（local の "Interrupted by signal" と exit-guard の "signal" の表記不一致の解消を含む）
- resume 意味論・canon-provenance（`INTERRUPTION_REASONS`）の変更
- detach / job wait の挙動変更

## 受け入れ基準

- [ ] SIGTERM 受信時の interruption レコードに `signal: "SIGTERM"` が載ることをテストで固定する（SIGINT / SIGHUP も同様に固定、パラメタ化可）
- [ ] transition message にシグナル名が含まれることをテストで固定する
- [ ] `reason` の値が "signal" のままであることをテストで固定し、既存の resume / canon-provenance テストが無変更で green
- [ ] SIGHUP ハンドラが local / managed 両方で登録され、cleanup で `process.off` されることをテストで固定する
- [ ] 既存の signal-state / exit-guard テストが無変更で green
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **フィールド追加のみで `reason` 値は不変**: `INTERRUPTION_REASONS`（canon-provenance）が `reason` 値で機械的照合しており、値の変更は resume の隔離判定に波及する。記録の充実は加算にとどめる。
- **SIGHUP を別扱いしない**: 端末切断も mechanical interruption であり、SIGINT / SIGTERM と別の cleanup 経路を持つ理由がない。同一経路への登録のみとする。
- **exit code 据え置き**: 128+n への修正は挙動変更（親プロセス・監視側の観測に影響）であり、記録の加算という本 request の性格と混ざるため別件とする。
