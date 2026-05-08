# Test Cases: preflight.ts を 3 責務に分割し spawnOrEscalate ヘルパーを抽出する

## 凡例

- **must**: 受け入れ基準に直結。実装必須
- **should**: 品質・回帰リスクが高い。実装推奨
- **could**: nice-to-have。余裕があれば

---

## TC-01: spawnOrEscalate — 成功時

**Priority**: must  
**Task**: T1

```
GIVEN spawn が exitCode 0 で返る
WHEN spawnOrEscalate({ spawn, cmd: "git", args: ["fetch", "origin", "feat"], cwd, failedStep, resumeCommand }) を呼ぶ
THEN { ok: true, stdout: <spawnの stdout>, stderr: <spawnの stderr> } が返る
```

---

## TC-02: spawnOrEscalate — exitCode 非ゼロ時に escalation を生成する

**Priority**: must  
**Task**: T1

```
GIVEN spawn が exitCode 1、stderr "fatal: branch not found" で返る
WHEN spawnOrEscalate({ spawn, cmd: "git", args: ["fetch", "origin", "feat"], cwd, failedStep: "Phase 1 (git fetch)", resumeCommand: "specrunner finish my-slug" }) を呼ぶ
THEN result.ok === false
AND result.escalation に "git fetch origin feat failed (exit 1)" が含まれる（detectedState 自動構築）
AND result.escalation に "specrunner finish my-slug" が含まれる（resumeCommand 反映）
AND result.escalation に "fatal: branch not found" が含まれる（stderr 反映）
```

---

## TC-03: spawnOrEscalate — recommendedAction カスタム値の優先

**Priority**: must  
**Task**: T1

```
GIVEN spawn が exitCode 1 で返る
WHEN spawnOrEscalate に recommendedAction: "Fix spec errors first" を渡す
THEN result.escalation に "Fix spec errors first" が含まれる
AND デフォルトの "Check error:" 文字列は含まれない
```

---

## TC-04: spawnOrEscalate — recommendedAction 未指定時のデフォルト文字列

**Priority**: should  
**Task**: T1

```
GIVEN spawn が exitCode 2、stderr "  permission denied  " (前後スペースあり) で返る
WHEN spawnOrEscalate に recommendedAction を渡さない
THEN result.escalation に "Check error: permission denied." が含まれる（stderr.trim() 適用）
AND result.escalation に "Then re-run: <resumeCommand>" が含まれる
```

---

## TC-05: pr-status.ts — fetchPrViewWithRetry が ForTest suffix なしで export される

**Priority**: must  
**Task**: T2

```
GIVEN pr-status.ts が存在する
WHEN "fetchPrViewWithRetry" を named import する
THEN import が成功し、関数として呼び出せる
AND "fetchPrViewWithRetryForTest" という名前の export は存在しない
```

---

## TC-06: pr-status.ts — pollMergeStateAfterPush が ForTest suffix なしで export される

**Priority**: must  
**Task**: T2

```
GIVEN pr-status.ts が存在する
WHEN "pollMergeStateAfterPush" を named import する
THEN import が成功し、関数として呼び出せる
AND "pollMergeStateAfterPushForTest" という名前の export は存在しない
```

---

## TC-07: fetchPrViewWithRetry — UNKNOWN mergeStateStatus のリトライ

**Priority**: must  
**Task**: T2（移動後の振る舞い不変）

```
GIVEN gh pr view が1回目 mergeStateStatus: "UNKNOWN" を返し、2回目 "CLEAN" を返す
WHEN fetchPrViewWithRetry を呼ぶ
THEN 2回目の結果 { mergeStateStatus: "CLEAN", ... } が返る
AND 1回目の UNKNOWN は透過的にリトライされる
```

---

## TC-08: fetchPrViewWithRetry — リトライ上限到達時に最終値を返す

**Priority**: should  
**Task**: T2

```
GIVEN gh pr view が UNKNOWN_RETRY_COUNT 回すべて mergeStateStatus: "UNKNOWN" を返す
WHEN fetchPrViewWithRetry を呼ぶ
THEN 最後の試行結果（UNKNOWN）が返る
AND 無限ループにならない
```

---

## TC-09: pollMergeStateAfterPush — MERGED 検知で終了する

**Priority**: must  
**Task**: T2（移動後の振る舞い不変）

```
GIVEN gh pr view が2回目に state: "MERGED" を返す
WHEN pollMergeStateAfterPush を呼ぶ
THEN "MERGED" の state が返る
AND それ以降の polling は行われない
```

---

## TC-10: pollMergeStateAfterPush — リトライ上限到達時に空文字列を返す

**Priority**: should  
**Task**: T2

```
GIVEN gh pr view が POST_PUSH_RETRY_COUNT 回すべて "OPEN" を返す
WHEN pollMergeStateAfterPush を呼ぶ
THEN "" (空文字列) が返る
AND escalation は生成されない（escalation ではなく空文字列が仕様）
```

---

## TC-11: branch-checkout.ts — checkoutForValidation が export される

**Priority**: must  
**Task**: T3

```
GIVEN branch-checkout.ts が存在する
WHEN "checkoutForValidation", "restoreBranch" を named import する
THEN 両関数が import でき、呼び出せる
```

---

## TC-12: restoreBranch — warnFn が呼ばれる

**Priority**: must  
**Task**: T3 (warnFn 追加)

```
GIVEN warnFn spy を用意する
AND git checkout が失敗するシナリオを設定する
WHEN restoreBranch({ ..., warnFn: spy }) を呼ぶ
THEN spy が警告メッセージとともに呼ばれる
AND process.stderr.write は呼ばれない
```

---

## TC-13: restoreBranch — warnFn 未指定時は process.stderr.write にフォールバック

**Priority**: should  
**Task**: T3

```
GIVEN warnFn を渡さない
AND git checkout が失敗するシナリオを設定する
WHEN restoreBranch({ ... }) を呼ぶ
THEN process.stderr.write が呼ばれる（デフォルトフォールバック）
AND ランタイムエラーは発生しない
```

---

## TC-14: preflight.ts — 行数が 250 行以下に縮小している

**Priority**: must  
**Task**: T4

```
GIVEN リファクタリング後の preflight.ts
WHEN ファイルの行数をカウントする
THEN 行数 ≤ 250 である
```

---

## TC-15: preflight.ts — pr-status / branch-checkout の要素を export しない

**Priority**: must  
**Task**: T4

```
GIVEN リファクタリング後の preflight.ts
WHEN export 一覧を確認する
THEN "fetchPrViewWithRetry", "fetchPrViewWithRetryForTest" が export されていない
AND "pollMergeStateAfterPush", "pollMergeStateAfterPushForTest" が export されていない
AND "checkoutForValidation", "restoreBranch" が export されていない
AND "UNKNOWN_RETRY_COUNT" 等のポーリング定数が export されていない
```

---

## TC-16: preflight.ts — warnFn DI: 未プッシュコミット警告のキャプチャ

**Priority**: must  
**Task**: T4 (warnFn DI)

```
GIVEN warnFn spy を持つ PreflightInput を用意する
AND git status が "Your branch is ahead of 'origin/...'" を返す（unpushed commits あり）
WHEN runPreflight(input) を呼ぶ
THEN spy が "Warning: feature branch has unpushed commits.\n" で呼ばれる
AND process.stderr.write は呼ばれない
```

---

## TC-17: preflight.ts — warnFn DI: openspec validate 警告のキャプチャ

**Priority**: must  
**Task**: T4 (warnFn DI)

```
GIVEN warnFn spy を持つ PreflightInput を用意する
AND openspec validate が exitCode 1 で返るシナリオを設定する（check 5+6 警告ケース）
WHEN runPreflight(input) を呼ぶ
THEN spy が openspec validate 関連の警告で呼ばれる
AND process.stderr.write は呼ばれない
```

---

## TC-18: preflight.ts — warnFn 未指定時はデフォルト動作

**Priority**: should  
**Task**: T4

```
GIVEN warnFn を指定しない PreflightInput（既存テストパターン）
WHEN runPreflight(input) を呼ぶ
THEN ランタイムエラーは発生しない
AND 警告は process.stderr.write に出力される（既存動作維持）
```

---

## TC-19: orchestrator.ts — pr-status.js から直接 import している

**Priority**: must  
**Task**: T5a

```
GIVEN リファクタリング後の orchestrator.ts
WHEN import 文を確認する
THEN "from './pr-status.js'" または "from \"./pr-status.js\"" の import が存在する
AND "fetchPrViewWithRetryForTest" という識別子は存在しない
AND "pollMergeStateAfterPushForTest" という識別子は存在しない
AND preflight.js からの import に ForTest alias は含まれない
```

---

## TC-20: orchestrator.ts — spawnOrEscalate を 5 箇所以上で使用している

**Priority**: must  
**Task**: T5b (受け入れ基準)

```
GIVEN リファクタリング後の orchestrator.ts
WHEN spawnOrEscalate 呼び出し箇所をカウントする
THEN 呼び出し回数 ≥ 5
```

---

## TC-21: orchestrator.ts — checkoutFeatureBranch の git fetch 失敗時に escalation を返す

**Priority**: must  
**Task**: T5b

```
GIVEN git fetch origin <branch> が exitCode 1 で失敗する
WHEN runFinishOrchestrator を実行する（Phase 1）
THEN exitCode: 1 が返る
AND escalation に "Phase 1 (git fetch)" が含まれる
AND git checkout -B は実行されない
```

---

## TC-22: orchestrator.ts — checkoutFeatureBranch の git checkout -B 失敗時に escalation を返す

**Priority**: must  
**Task**: T5b

```
GIVEN git fetch は成功するが git checkout -B が exitCode 1 で失敗する
WHEN runFinishOrchestrator を実行する（Phase 1）
THEN exitCode: 1 が返る
AND escalation に "Phase 1 (git checkout -B)" が含まれる
```

---

## TC-23: orchestrator.ts — pushFeatureBranch の git push 失敗時に escalation を返す

**Priority**: must  
**Task**: T5b

```
GIVEN git push origin <branch> が exitCode 1 で失敗する
WHEN runFinishOrchestrator を実行する（Phase 2）
THEN exitCode: 1 が返る
AND escalation に "Phase 2 (git push)" が含まれる
```

---

## TC-24: orchestrator.ts — gh pr merge 失敗時に escalation を返す

**Priority**: must  
**Task**: T5b

```
GIVEN gh pr merge が exitCode 1 で失敗する
WHEN runFinishOrchestrator を実行する（Phase 3）
THEN exitCode: 1 が返る
AND escalation に "Phase 3 (gh pr merge)" が含まれる
```

---

## TC-25: orchestrator.ts — Phase 4 git checkout 失敗時に escalation を返す

**Priority**: should  
**Task**: T5b

```
GIVEN git checkout <baseBranch> が exitCode 1 で失敗する
WHEN runFinishOrchestrator を実行する（Phase 4）
THEN exitCode: 1 が返る
AND escalation に "Phase 4 (git checkout" が含まれる
```

---

## TC-26: orchestrator.ts — Phase 4 git pull 失敗時に escalation を返す

**Priority**: should  
**Task**: T5b

```
GIVEN git checkout <baseBranch> は成功するが git pull --ff-only が exitCode 1 で失敗する
WHEN runFinishOrchestrator を実行する（Phase 4）
THEN exitCode: 1 が返る
AND escalation に "Phase 4 (git pull --ff-only)" が含まれる
```

---

## TC-27: テストファイル — ForTest suffix の import が存在しない

**Priority**: must  
**Task**: T6

```
GIVEN リファクタリング後の tests/unit/core/finish/preflight.test.ts
WHEN import 文を確認する
THEN "fetchPrViewWithRetryForTest" という識別子が存在しない
AND "pollMergeStateAfterPushForTest" という識別子が存在しない
AND fetchPrViewWithRetry は "pr-status.js" から import されている
AND pollMergeStateAfterPush は "pr-status.js" から import されている
```

---

## TC-28: 既存テストの全 pass — preflight.test.ts

**Priority**: must  
**Task**: T7 (振る舞い不変)

```
GIVEN リファクタリング完了後
WHEN bun run test -- tests/unit/core/finish/preflight.test.ts を実行する
THEN 全テストが pass する
AND skip やエラーは 0
```

---

## TC-29: 既存テストの全 pass — finish-orchestrator.test.ts

**Priority**: must  
**Task**: T7 (振る舞い不変)

```
GIVEN リファクタリング完了後
WHEN bun run test -- tests/finish-orchestrator.test.ts を実行する
THEN 全テストが pass する
AND skip やエラーは 0
```

---

## TC-30: typecheck が green

**Priority**: must  
**Task**: T7

```
GIVEN リファクタリング完了後
WHEN bun run typecheck を実行する
THEN 型エラーが 0 件
AND import パス変更漏れが typecheck によって検出されない
```

---

## TC-31: spawnOrEscalate の使用箇所合計 — preflight + orchestrator で 5 箇所以上

**Priority**: must  
**Task**: T4 + T5b (受け入れ基準)

```
GIVEN リファクタリング後の preflight.ts と orchestrator.ts
WHEN spawnOrEscalate 呼び出しをカウントする（両ファイル合計）
THEN 呼び出し回数 ≥ 5
```

---

## TC-32: 循環依存がない — branch-checkout.ts の依存方向

**Priority**: should  
**Task**: T3

```
GIVEN branch-checkout.ts の import 文
WHEN 依存グラフを確認する
THEN branch-checkout.ts → escalation.ts（一方向）
AND branch-checkout.ts → spawn-helper.ts（一方向）
AND preflight.ts / orchestrator.ts は branch-checkout.ts に依存しない（branch-checkout が依存する）
AND 循環依存は存在しない
```

---

## TC-33: pr-status.ts が PrViewData を preflight.ts から import する

**Priority**: should  
**Task**: T2

```
GIVEN pr-status.ts の import 文
WHEN 依存を確認する
THEN "PrViewData" は "./preflight.js" から type-only import されている
AND PrViewData は pr-status.ts で再定義されていない
```

---

## TC-34: spawnOrEscalate — args が空配列の場合の detectedState

**Priority**: could  
**Task**: T1

```
GIVEN spawn が exitCode 1 で返る
AND args: [] で呼ぶ
WHEN spawnOrEscalate を呼ぶ
THEN detectedState が "${cmd}  failed (exit 1)" ではなく "${cmd} failed (exit 1)" になる
   （args.join(" ") が "" のため前後の整形を確認）
```

---

## TC-35: runPreflight — warnFn が渡されても成功パスに影響しない

**Priority**: should  
**Task**: T4

```
GIVEN warnFn spy を持つ PreflightInput を用意する
AND 全チェック（1-7）が成功するシナリオ
WHEN runPreflight(input) を呼ぶ
THEN { ok: true } が返る
AND spy は呼ばれない（警告トリガーが発生しない）
```
