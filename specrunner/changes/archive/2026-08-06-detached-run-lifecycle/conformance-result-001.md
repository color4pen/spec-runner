# Conformance Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### 1. tasks.md — 完了チェック

T-01 〜 T-12 すべて `[x]`。

| タスク | 内容 | チェック |
|--------|------|----------|
| T-01 | `getDetachLogPath` in xdg.ts | ✓ |
| T-02 | `spawnBackground` 拡張 | ✓ |
| T-03 | `detach.ts`（マーカー / args strip / guidance / self-respawn） | ✓ |
| T-04 | `operational-guidance.ts` foreground notice 配線 | ✓ |
| T-05 | CLI `--detach` flag + `job wait` registry + USAGE 更新 | ✓ |
| T-06 | `job-wait.ts` process-death gate 実装 | ✓ |
| T-07 | `job show` detach log 表示 | ✓ |
| T-08 | Tests: detach spawn / 再帰防止 / spawnBackground | ✓ |
| T-09 | Tests: job wait gate / exit codes / fallback / slug 不在 | ✓ |
| T-10 | Tests: output contract + foreground 無変更 | ✓ |
| T-11 | docs/operations.md 追随 | ✓ |
| T-12 | 最終検証（typecheck + test green） | ✓ |

### 2. design.md 設計判断の実装確認

**D1 — self-respawn opt-in**:
`detach.ts` の `detachSelf()` が `spawnBackground` に `detached:true` / `logFilePath` / `rawEnv+marker` を渡し、親は stdout に guidance を書いて 0 を返す。`command-registry.ts` の run / job start / job resume ハンドラ三箇所で `detachSelf` 呼び出し後 `process.exit(0)` を確認。✓

**D2 — 再帰防止マーカー**:
`DETACH_MARKER_ENV = "SPECRUNNER_DETACHED"` を env に付与。ハンドラの gate は `parsed.flags["detach"] && !isDetachedChild(process.env)` で二重防御。✓

**D3 — slug-keyed detach log**:
`getDetachLogPath(repoRoot, slug)` → `.specrunner/logs/<slug>.detach.log`。`job-show.ts` がファイル存在時のみ `Detach log: <relpath>` を表示。✓

**D4 — spawnBackground 拡張（既存呼び出し元無変更）**:
`SpawnBackgroundOptions` に `detached?` / `logFilePath?` / `rawEnv?` を任意追加。未指定時は従来挙動（非 detached / `stdio:"ignore"` / stripSecrets）。✓

**D5 — 親の slug 解決**:
`resolveSlugForDetach()` が (1) SLUG_REGEX 直接マッチ → (2) file path parse → (3) store lookup の順で解決。無効 slug → spawn 前に非ゼロ終了。resume は positional を SLUG_REGEX で検証。✓

**D6 — process-death gate**:
`runJobWait()` が `state.pid` → sidecar → `lastKnownPid` の順で pid を解決。`isProcessAlive(pid)` が true の間は on-disk status に関わらずループ継続。死亡後に状態再読み込み、`running` → `awaiting-resume` 変換あり。DI seam で実時間・実プロセスなしに検証可能。✓

**D7 — settle 報告と exit codes**:
`nextActionFor(status)` が全 status のアクション文字列を定義。`exitCodeForStatus` が `awaiting-archive`/`archived` → 0、その他 → 1。出力形式: `${slug}: ${status} — ${nextAction}`。✓

**D8 — 出力面への知識注入**:
`FOREGROUND_NOTICE` に `--detach` と `job wait` を含む。`emitForegroundNotice` は `logInfo`（stderr）経由。`CommandRunner.execute()` で `prepare()` 後に呼び出し。USAGE に `job wait <slug>` と `--detach` を three commands 分記載。✓

### 3. spec.md 要件（SHALL / MUST）の確認

| 要件 | 実装確認 |
|------|----------|
| `--detach` 受理（run / job start / job resume） | 三コマンドの flags に `detach: {type: "boolean"}` ✓ |
| spawn: `detached:true` + log redirect + unref + marker | `spawnBackground` opts ✓ |
| 親: pipeline なし、guidance stdout、exit 0 | handler で `detachSelf` → `process.exit(0)` ✓ |
| `--detach` args 除去、他 flag verbatim 継承 | `stripDetachFlag(process.argv.slice(2))` ✓ |
| 再帰防止: marker gate が正典 | `!isDetachedChild(process.env)` が外側 gate ✓ |
| detach log → `job show` で辿れる | `printJobState` に `Detach log:` 行 ✓ |
| spawnBackground 既存挙動保持 | opts 未指定時は全フィールドが従来値 ✓ |
| job wait: pid gate | alive 中は status 無視してループ ✓ |
| job wait: 死亡後 `running` → `awaiting-resume` | `finalStatus === "running"` ブランチ ✓ |
| job wait: no-pid → `isStaleRunning` fallback | no-pid path でフォールスルー ✓ |
| job wait: settle 1 行報告 + exit codes | `reportSettle` + `exitCodeForStatus` ✓ |
| slug 不在: 2s×5 retry → exit 2 | `notFoundRetryCount:5`, `notFoundRetryIntervalMs:2000` ✓ |
| foreground notice: stderr / quiet 抑制 / stdout 汚染なし | `logInfo`（stderr） + `!isDetachedChild` guard ✓ |
| USAGE: `job wait` + `--detach` 明記 | USAGE 文字列に両方含む ✓ |
| `--detach` + `--json` → ARG_ERROR exit 2 | handler 先頭で排他チェック（三コマンド） ✓ |

### 4. request.md 受け入れ基準の確認

| 基準 | テスト | 確認 |
|------|--------|------|
| `--detach` spawn 契約・破壊確認 | TC-001, TC-003 `detach.test.ts` | ✓ |
| detach 親: no-pipeline, guidance, exit 0 | TC-002 `detach.test.ts` | ✓ |
| 再帰防止 | TC-005 `detach.test.ts` | ✓ |
| job wait process-death gate・破壊確認 | TC-010, TC-011 `job-wait.test.ts` | ✓ |
| job wait exit codes + 1行報告 | TC-012, TC-015–TC-017, TC-029 | ✓ |
| isStaleRunning fallback | TC-014 `job-wait.test.ts` | ✓ |
| slug 不在 exit 2 | TC-018 `job-wait.test.ts` | ✓ |
| output contract（notice/guidance/USAGE） | TC-019 `detach-output-contract.test.ts` | ✓ |
| foreground 無変更（既存テスト green） | verification: 10262 passed | ✓ |
| spawnBackground 既存呼び出し元無変更 | TC-008 `spawn-background-detach.test.ts` | ✓ |
| typecheck && test green | verification-result.md: all phases passed | ✓ |

---

## 検証できなかった項目

None。すべての成果物と主要実装を直接読んで確認した。

---

## Findings 詳細

### F-001: TC-004 が `job resume --detach --json` をカバーしていない

**ファイル**: `src/cli/__tests__/detach-flag-cli.test.ts`

実装（`command-registry.ts` 694–698 行）は `job resume` ハンドラにも `--detach --json` 排他チェックを正しく持つ。しかし TC-004 のテストは `run` と `job start` のみで、`job resume` に対応するケースが欠落している。Tasks T-10 の受け入れ基準「`--detach --json` 排他テストが green」は実装上は満たされているが、`job resume` の当該 case がテストに固定されていない。

動作上の誤りはなく、severity は low。テストを 1 ケース追加すれば解消する。
