# Conformance Result — detach-start-ack — iter 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### J1: tasks.md — 全チェックボックス [x] 確認

21 個全チェックボックス [x] 確認済み。

| Task | Items | Status |
|------|-------|--------|
| T-01 `spawnBackground` に `onExit` 追加 | 4 | all [x] |
| T-02 非同期 `detachSelf` + ack ループ | 6 | all [x] |
| T-03 両 `--detach` 分岐で `await detachSelf` + help 書き換え | 3 | all [x] |
| T-04 `job wait` hint 追記 | 2 | all [x] |
| T-05 既存 pin テスト更新 | 3 | all [x] |
| T-06 統合テスト | 3 | all [x] |

### J2: spec.md — Requirements 実装確認

**Requirement: 親は登録完了または子死亡まで待つ**

`src/core/command/detach.ts:152-216`: `detachSelf` は async、`for(;;)` ack ループ。
- 登録判定: `readSidecarPidFn() === childPid`（:200）
- 死亡判定: `childEnded === true`（:206）。`onExit` / `onError` で設定（:182-188）。`pid === undefined` は即 `childEnded = true`（:193-195）。
- 固定 timeout なし。

TC-001（遅延 → sleep 呼出し）・TC-002（登録 → SUCCESS）・TC-014（破壊確認：N 待機 tick = N sleep 呼出し）で歯あり。

**Scenario: resume の残骸 sidecar を誤認しない**

D1 基準（pid 一致）が担保: 残骸 sidecar の pid ≠ childPid は ack と見なさない。TC-004 で確認。

**Requirement: 登録前子死亡 → GENERAL_ERROR + log tail**

死亡ブランチ: `readDetachLogTailFn(logFilePath, 40)` + `buildDetachStartFailure` を stderr へ（:207-209）。
TC-005（GENERAL_ERROR + stderr 内容）・TC-006（spawn error/pid undefined）・TC-007（register-then-die = SUCCESS）で確認。

**Requirement: `job wait` "No job found" に hint**

`src/cli/job-wait.ts:193`: "No job found" の後に `Hint:` 行で `getDetachLogPath(repoRoot, slug)` を参照。
TC-008: exit 2 変わらず、リトライ数変わらず、hint 文字列に `<slug>.detach.log` を含む。

**Requirement: help/guidance 文言の更新**

USAGE（:84/:91/:116）: "登録完了まで待機後に return"、「即座に」なし。
JOB_RESUME_USAGE（:231-233）: "Parent waits until the job is registered (or reports a start failure)"。
TC-009: USAGE に "returns immediately"・"即座に return"・"即座に" が存在しないことを固定。
`buildDetachStartFailure` は `detach.ts:82-88` の単一エクスポート。TC-010 / TC-016 でスラグ・ログパス・tail の含有を固定。

**Requirement: foreground / detach 子の挙動は不変**

`isDetachedChild` ゲートと `DETACH_MARKER_ENV` は変更なし。TC-011 で確認。`spawn-background-detach.test.ts` は diff に現れず（新 TC-012 が追加されたファイルに統合）。

### J3: design.md — 設計判断の反映確認

| Decision | 期待 | 確認 |
|----------|------|------|
| D1: pid identity | `sidecarPid === childPid` | `readSidecarPidFn() === childPid`（:200） |
| D2: exit event、not `isProcessAlive` | `onExit` on handle | `spawn.ts:135`: `proc.on("exit", opts.onExit)` |
| D3: 登録優先順序 | 登録チェック → 死亡チェック | ループ順序: :200 → :206 |
| D4: tail N=40 | `readDetachLogTail(logPath, 40)` | `detach.ts:207`; TC-022 で lines=40 を固定 |
| D5: async `detachSelf` with `DetachSelfDeps` | DI mirrors `JobWaitDeps` | `DetachSelfDeps` インターフェース exported; `deps?.x ?? default` パターン |
| D5: spawn は同期先行 | first `await` 前 | spawn が `for(;;)` ループより前（:177）; TC-013 で確認 |
| D6: `job wait` hint | 不変のリトライロジック + hint | `job-wait.ts:193`; TC-008 |
| D7: 単一失敗メッセージ定義 | exported builder | `buildDetachStartFailure` at `detach.ts:82` |

`xdg.ts:75` の `ponytail:` コメント（whole-file read、将来の逆順チャンク読み替えパス）は D4 設計ノートどおり。

### J4: request.md — 受け入れ基準の歯確認

| AC | テスト | 確認 |
|----|--------|------|
| 登録完了まで exit しない（破壊確認込み） | `detach-ack.test.ts` TC-001, TC-014 | N ticks = N sleep; 即時登録 = 0 sleep |
| 登録前死亡 → 非 0 exit + stderr に log tail と log path | `detach-ack.test.ts` TC-005 | `GENERAL_ERROR`; stderr に tail + logPath |
| 登録完了 → guidance + exit 0 | `detach-ack.test.ts` TC-002 | `SUCCESS`; stdout に slug/"job wait"/"job show" |
| resume 残骸 sidecar を ack と誤認しない | `detach-ack.test.ts` TC-004 | 旧 pid 2 tick 後に childPid → SUCCESS |
| 統合: exit 0 直後の job wait が exit 2 にならない | `detach-integration.test.ts` TC-003, TC-020 | `code === SUCCESS`; `jobIsDiscoverable === true` |
| `job wait` "No job found" に hint | `job-wait.test.ts` TC-008 | hint に `<slug>.detach.log`; exit 2 変わらず |
| 既存テスト `mockReturnValue(0)` → `mockResolvedValue(0)` | `detach-flag-cli.test.ts` :40, :217 | `mockResolvedValue(0)` に更新済み |
| `detach-output-contract.test.ts` に新 pin | `detach-output-contract.test.ts` TC-009/010/016 | USAGE 即時 return なし; builder 輸出・内容確認 |
| `spawn-background-detach.test.ts` 無改変 | diff なし | ファイルは `git diff` 統計に存在しない（TC-012 は同ファイルに追加） |
| `xdg-detach-log.test.ts` 無改変 | diff なし | `git diff main...HEAD --stat` に出現せず |
| `job-wait.test.ts` 既存 it() 無改変 | `job-wait.test.ts` | TC-018 など既存 describe は変更なし; TC-008 は新規 describe として追加 |
| `typecheck && test` が green | `verification-result.md` | build/typecheck/test/lint/coverage 全フェーズ passed |

## 検証できなかった項目

None。全判定項目を確認済み。

## Findings 詳細

None。指摘なし。
