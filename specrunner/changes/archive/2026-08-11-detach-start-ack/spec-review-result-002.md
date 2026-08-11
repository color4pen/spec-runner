# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### Spec artifacts 再精読（attempt 2）

attempt 1 での escalation に対して operator が裁定を下した。operator adjudications が `state.json` に記録されている。
各 adjudication を artifact の現状と照合した。

| artifact | 確認した主要点 |
|---------|--------------|
| `tasks.md` | T-01〜T-05 を精読。T-06（統合テスト）が存在しないことを確認 |
| `design.md` | Open Questions セクションが「Confirm in review」のまま未確定であることを確認 |
| `spec.md` | "A child that dies before registering" Requirement の Scenario 群を確認。spawn 失敗 Scenario が存在しないことを確認 |
| `request.md` | 「現状コードの前提」の resume.ts:291 参照を確認 |

### Operator adjudications の照合結果

| Finding | 裁定 | 現在のアーティファクト状態 |
|---------|------|------------------------|
| F-1 tasks.md に T-06 を新設 | fixable/medium | 未適用（T-06 不在） |
| F-2 Open Questions を確定値で置換 | 確定（N=40, 200ms） | 未適用（"Confirm in review" のまま） |
| F-3 spawn 失敗 Scenario を spec.md に追加 | fixable/low | 未適用（Scenario 不在） |
| F-4 request.md の resume.ts:291 参照を修正 | fixable/low | 未適用（旧記述のまま） |

### ソースコード照合（attempt 1 の確認を継承）

attempt 1 で実施した以下の確認結果は変化なし（ソースコードは変更されていない）:

- `src/core/command/detach.ts`: `detachSelf` が同期・return 0 のまま
- `src/util/spawn.ts`: `onExit` 未追加
- `src/cli/command-registry.ts`: 両 detach 分岐が同期 `detachSelf` を使用
- `src/cli/job-wait.ts`: not-found stderr に hint なし
- `src/core/runtime/workspace-materializer.ts:91,117`: resume 時の `writeLivenessSidecar` 呼び出し場所（F-4 の正確な参照先）
- `src/core/command/resume.ts:291`: `transitionJob` は state.json の pid フィールド更新のみ（sidecar ではない）

## 検証できなかった項目

None — attempt 1 で実施した検証は継承済み。operator 裁定により F-2 の "decision-needed" は解消されており、本 attempt では全 finding が fixable として報告可能。

## Findings 詳細

### F-1: tasks.md に T-06（統合テスト）が存在しない

operator adjudication: "tasks.md に T-06 を新設する。実装は seam 注入でよいが、detach 親の ack 完了(exit 0)と job wait の loadState 成功を同一 fixture 上で連続実行する形にすること。"

`tasks.md` に T-06 を追加する必要がある。内容:
- 統合テスト: `job start --detach` が exit 0 した後、同一の seam fixture 上で `job wait <slug>` の loadState が成功することを確認
- `detachSelf` が `EXIT_CODE.SUCCESS` を resolve した時点で sidecar が登録済みであり、`job wait` の `loadState` が slug を発見できることをテストで固定する
- 対象ファイル: `src/cli/__tests__/detach-integration.test.ts` または既存 test ファイルへの追加

### F-2: design.md の Open Questions が未確定

operator adjudication: "detach log tail は N=40 行、ack poll 間隔は 200ms。design.md の Open Questions セクションをこの確定値で置換し、値はテストで pin すること。"

`design.md` の "Open Questions" セクション（末尾 3 箇条）を確定値で置換する必要がある:
- tail 行数: N=40 lines（確定）
- poll 間隔: 200ms（確定）
- 両値はテストの seam 注入で pin される（`pollIntervalMs: 200` + `readDetachLogTail(..., 40)` を assert）

### F-3: spec.md の "A child that dies before registering" Requirement に spawn 失敗 Scenario が存在しない

operator adjudication: "Given spawnFn が ENOENT で onError を発火 or handle.pid が undefined / When detach 親が ack 待機を開始 / Then hang せず GENERAL_ERROR で exit する"

spec.md の該当 Requirement に以下 Scenario を追加する:

```
#### Scenario: spawn failure (ENOENT or pid undefined) propagates as a non-zero exit

**Given** the spawn function fires `onError` (e.g. ENOENT) or returns a handle
with `pid === undefined`
**When** the detach parent begins the ack wait
**Then** it exits without hanging, with `EXIT_CODE.GENERAL_ERROR`
```

T-02 の AC にはこのケースが含まれているが（"Spawn error path"）、spec.md に対応する Scenario がないため spec と tasks の間に gap がある。

### F-4: request.md の resume.ts:291 参照が不正確

operator adjudication: "「resume 子は pid を自身のものに更新して persist する（src/core/command/resume.ts:291）」を「resume 時の liveness sidecar 更新は workspace-materializer.ts:91（resume-existing）/ :117（resume-recreated）で行われる。resume.ts:291 の transitionJob は state.json の pid フィールドの更新である」に置換する。"

`request.md` の「現状コードの前提」の記述が実際のコードと乖離している:
- 旧: `resume 子は pid を自身のものに更新して persist する（src/core/command/resume.ts:291）`
- 正: liveness sidecar の更新は `workspace-materializer.ts:91`（resume-existing）/ `:117`（resume-recreated）。`resume.ts:291` の `transitionJob` は `state.json` の `pid` フィールドの更新である
- 設計への影響はないが、request.md の正確性が損なわれている
