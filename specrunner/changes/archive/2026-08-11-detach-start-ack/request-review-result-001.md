# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### Step 1: コードアサーション検証（全 15 項目）

request.md に記載されたファイルパス・行番号を Read ツールで実測し照合した。

| アサーション | 内容 | 結果 |
|---|---|---|
| `command-registry.ts:428-442` | run の --detach 分岐 | ✅ 一致 |
| `command-registry.ts:697-711` | resume の --detach 分岐 | ✅ 一致 |
| `detach.ts:105-130` | `detachSelf` 関数定義 | ✅ 一致 |
| `detach.ts:110` | `getDetachLogPath` 呼び出し | ✅ 一致（ただし redirect は spawnFn 内、下記 Observation 参照） |
| `xdg.ts` — `getDetachLogPath` | 存在確認 | ✅ 存在（line 66） |
| `workspace-materializer.ts:114-117` | sidecar は :117・:149・:177 | ✅ 一致（resume/:117, attach-from-checkpoint/:149, new-run/:177） |
| `local.ts:371-376` | no-worktree 初回 disk 登録 | ✅ 一致 |
| `run.ts:61-75` | preflight 実行 | ✅ 一致 |
| `runner.ts:105-124` | provider readiness probe | ✅ 一致 |
| `pipeline-run.ts:90-133` | reviewer / pipeline descriptor 検証 | ✅ 一致 |
| `job-wait.ts:141-143` | `notFoundRetryCount: 5, notFoundRetryIntervalMs: 2000` | ✅ 一致 |
| `job-wait.ts:180-193` | not-found retry loop | ✅ 一致 |
| `resume.ts:291` | pid パッチ（`pid: process.pid`） | ✅ 一致（state.json へのパッチ） |
| `job-state-store.ts:78-79` | `status: "running", pid: process.pid` | ✅ 一致 |
| `src/errors.ts` | `EXIT_CODE` 定数定義 | ✅ 一致（SUCCESS:0, GENERAL_ERROR:1, ARG_ERROR:2） |

### Step 2: 参照テストファイルの存在確認

受け入れ基準で名指しされた既存テストファイルが実在することを Glob で確認した。

- `src/cli/__tests__/detach-flag-cli.test.ts` ✅
- `src/cli/__tests__/detach-output-contract.test.ts` ✅
- `src/util/__tests__/spawn-background-detach.test.ts` ✅
- `src/util/__tests__/xdg-detach-log.test.ts` ✅
- `src/cli/__tests__/job-wait.test.ts` ✅

### Step 3: 設計判断の妥当性確認

- `spawnBackground` の戻り値が `{ pid: number | undefined }` を持つことを `src/util/spawn.ts` で確認（line 39）。親が spawn 後に子の PID を保持できるセームが存在する。
- 現在の `detachSelf` は spawn 戻り値を破棄（line 119-124 で戻り値未キャプチャ）。新 ack 機構は戻り値キャプチャを必要とするが、これは design step の設計範囲。
- `buildDetachGuidance` が単一エクスポート（line 69）であり、output contract テスト様式が既に確立されていることを確認。

### Step 4: 問題背景の正確性確認

- `detachSelf` が spawn 後に即 `return 0` する（line 129）ことを直接確認。親の exit は handler 内 `process.exit(code)` で完結しており、子の登録状態を一切待たない。
- `job wait` の "not-found retry" が 5 回 × 2000ms 固定窓であることを job-wait.ts:141-143 で確認。preflight → workspace setup の所要時間が network 依存であることを考慮すると、race が再現可能な条件である。

## 検証できなかった項目

- `resume --detach` で「前回 run の残骸 sidecar」が実際にレースを引き起こすシナリオの end-to-end 再現（sandbox の制約上、実プロセス起動不可）。ただし sidecar write が workspace-materializer.ts:117 に存在し、resume 子の pid が反映されることはコード上確認済み。
- Windows 挙動（スコープ外）。

## Findings 詳細

None。

---

**Observation（ブロックなし）**:  
request.md の記述「resume 子は pid を自身のものに更新して persist する（`resume.ts:291`）」について: line 291 は `transitionJob` の `patch` 内に `pid: process.pid` を持つ state.json の更新であり、**liveness sidecar** の更新は `workspace-materializer.ts:117` が担う（workspace setup フェーズ）。両方とも "workspace setup → pipeline 開始" の順で発生するため、ack タイミングの設計上の問題はなく、記述の帰属先が若干曖昧なだけである。実装への影響なし。
