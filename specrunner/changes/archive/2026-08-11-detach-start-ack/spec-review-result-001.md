# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### Spec artifacts 全体精読

- `request.md`: 背景・要件・受け入れ基準・設計判断を精読した
- `design.md`: D1〜D7 の設計決定・Risk/Trade-off・Open Questions を精読した
- `spec.md`: 全 Requirement と全 Scenario を Given/When/Then で確認した
- `tasks.md`: T-01〜T-05 の受け入れ基準と依存関係を確認した

### ソースコード突合（background claims の検証）

以下のファイルを実際に読み、design の前提が正しいかを確認した:

| ファイル | 確認した主要点 |
|---------|--------------|
| `src/core/command/detach.ts` | `detachSelf` が同期・return 0・guidance unconditional であることを確認 |
| `src/util/spawn.ts` | `SpawnBackgroundOptions` に `onExit` が存在しないことを確認（T-01 の必要性） |
| `src/cli/command-registry.ts:428-442, 697-711` | 両 detach 分岐が同期 `detachSelf` + `process.exit(code)` であることを確認 |
| `src/cli/job-wait.ts:140-143, 180-193` | `notFoundRetryCount=5, notFoundRetryIntervalMs=2000`、`stderrWrite("Error: No job found...")` + exit 2 を確認 |
| `src/util/paths.ts:301-303` | `livenessJsonPath(slug)` = `.specrunner/local/<slug>/liveness.json` を確認 |
| `src/core/runtime/workspace-materializer.ts:91, 117, 149, 177` | resume/new-run の各 case で `writeLivenessSidecar` が呼ばれることを確認 |
| `src/core/runtime/local.ts:376` | no-worktree run/resume 双方で `writeLivenessSidecar(slug, jobId, null)` が呼ばれることを確認 |
| `src/errors.ts` | `EXIT_CODE = { SUCCESS:0, GENERAL_ERROR:1, ARG_ERROR:2 }` を確認 |
| `src/core/command/__tests__/detach.test.ts` | TC-001/002/003 が同期 `detachSelf` を前提としていることを確認 |
| `src/cli/__tests__/detach-flag-cli.test.ts` | line 39 の `mockReturnValue(0)` を確認（T-05 での `mockResolvedValue(0)` への変更対象） |
| `src/cli/__tests__/job-wait.test.ts` (TC-018) | エラーメッセージ内容の assert がなく、hint 追加で壊れないことを確認 |

### 設計の正確性検証

- **D1（pid-identity 基準）**: new-run では sidecar が最初に child pid で書かれる (materializer:177)。resume では stale sidecar の pid が前プロセスのものであり、child pid と一致しない。resume child が sidecar を自分の pid で上書きする (materializer:91/117)。基準は new-run・resume 双方で正しく機能する ✓
- **D2（exit event vs isProcessAlive）**: 親が直接 spawn した子は zombie になり得るため `isProcessAlive` は不正確。`exit` event は Node.js が内部 `waitpid` で子を reap したときに発火する。`unref()` はイベントループの参照カウントを外すだけで、親が生存中は `exit` listener が発火し続ける。設計は正確 ✓
- **D3（registration-first ordering）**: spec.md に対応する Scenario がある（"registration observed on the same tick as death is treated as success"）✓
- **job-wait TC-018 が hint 追加で壊れないこと**: TC-018 は exit code と retry 回数のみ assert し、エラーメッセージ本文は assert していないため hint 追加の影響なし ✓

### セキュリティ観点

- **detach log tail 読み取り**: `getDetachLogPath(repoRoot, slug)` は固定パスで path injection のリスクなし
- **slug validation**: resume branch は `SLUG_REGEX` で検証済み (command-registry.ts:699)
- **stderr 出力**: log tail の stderr 転記に特別なリスクなし

## 検証できなかった項目

- **resume + no-worktree の組み合わせの詳細フロー**: `setupWorkspaceNoWorktree` (local.ts:334) の resume path は `opts?.bootstrapState` が undefined のため state 再 seed なし。sidecar は line 376 で child pid にて書かれる。`job wait` が state.json を見つけられるかは、state.json が前回 run から既存である前提に依存するが、resume 時点でこれは成立している。確認はコード読解のみで実行による検証はしていない
- **`attach-from-checkpoint` + detach の組み合わせ**: `job attach` に `--detach` フラグが存在しないため現状では発生しない。将来追加された場合の挙動は sidecar `pid=null` により ack が永遠に成立しないが、子の exit event で GENERAL_ERROR になるため fail-safe

## Findings 詳細

### F-01: 受け入れ基準の統合テストに対応するタスクが存在しない

`request.md` の受け入れ基準に「統合: `job start --detach` が exit 0 した直後の `job wait <slug>` が exit 2 にならないことをテストで固定する」と明記されている。

しかし `tasks.md` の T-01〜T-05 を確認したところ、この統合シナリオをカバーするテストを**作成するタスクが存在しない**。

- T-02 は `detachSelf` のユニットテスト（seam injection で sidecar 観測をシミュレート）
- T-04 は `job wait` の hint テスト
- T-05 は既存 pin テストの更新

`job start --detach` が exit 0 した時点で sidecar が存在することは D1/D3 で論理的に保証されるが、「その後の `job wait` が exit 2 にならない」ことは明示的なテストで固定されていない。acceptance criteria を満たすには T-02 の AC に追加するか、T-06 として分離する必要がある。

### F-02: Design の Open Questions が未確定のまま

`design.md` の "Open Questions" セクションに以下が明示的に "Confirm in review" と記載されている:

1. **detach log の tail 行数**: N=40 を提案しているが確定していない
2. **ack poll 間隔**: ~200 ms を提案しているが確定していない（"Reusing job wait's 2000 ms is also acceptable"と代替案も示している）

これらは実装パラメータであり、実装者が任意の値を選んだ場合にテストで固定できない（テストは seam 経由で mock するため）。poll 間隔はテスト時間に影響し、tail 行数はエラー出力の内容に影響する。レビュー時点で確定させる必要がある。

### F-03: `request.md` 背景セクションの参照行番号が不正確（情報のみ）

`request.md` の "現状コードの前提" に:

> resume 子は pid を自身のものに更新して persist する（`src/core/command/resume.ts:291`）

とあるが、実際の liveness sidecar 更新は `workspace-materializer.ts:91`（resume-existing）および `:117`（resume-recreated）で行われる。`resume.ts:291` の `transitionJob` は `state.json` の `pid` フィールドを更新するものであり、sidecar ではない。

`design.md` はこの点を正確に把握しており（"In the child, process.pid is the child's own pid"、materializer を参照）、実装上の影響はない。記録のみ。

### F-04: spec.md に spawn 失敗（handle.pid === undefined）のシナリオが存在しない

spec.md の "A child that dies before registering SHALL fail the parent" Requirement の Scenario は:

> "the child process ends without ever writing a liveness sidecar carrying the child's pid"

これは spawn が成功し child が途中で死んだケースを主に記述している。spawn 自体が失敗した場合（ENOENT、`handle.pid === undefined`）は "process ends" の語義に含まれないと解釈できる。

T-02 の AC には「Spawn error path: an injected spawnFn that triggers onError (or returns pid: undefined) resolves GENERAL_ERROR without hanging」と明示されており、テストレベルでは担保される。spec に明示的な Scenario を追加すると完結性が高まる。
