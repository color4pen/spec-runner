# crash 時の state 更新と resume の step 解決を修正する

## Meta

- **type**: bug-fix
- **slug**: fix-crash-state-and-resume-step-resolution

## 背景

PR #116 の pipeline 実行中に 2 つの不具合が発生した：

### 1. crash 時に state が running のまま残る

implementer が「Branch does not exist after agent run」で失敗した際、state が `running` のまま残り `awaiting-resume` に遷移しなかった。resume が「currently running」で拒否され、手動で state を書き換える必要があった。

原因: `executor.execute()` は通常 `.state` を付けて throw するが、executor 内の予期せぬ例外パスでは `.state` が付かない場合がある。`pipeline.runInternal()` の catch（L154-160）は `.state` があれば拾うが、なければ state を更新せず `running` のまま。さらに `pipeline.run()` の catch（L79-87）まで throw が漏れた場合、transition table を通らないため `awaiting-resume` への遷移が起きない。

### 2. resume の step 解決が直感に反する

`resolveResumeStep()` は `resumePoint.step` を phase 判定（spec/code）にしか使わず、step 名自体は `from` 引数（デフォルト `"critic"`）から `STEP_MAPPING[phase][role]` で決まる。

例: `resumePoint.step = "implementer"` で `from` 未指定 → phase = "code"、role = "critic" → `code-review` から再開。implementer のコードが未完了なのに code-review が走り、無意味な escalation になる。

## 要件

### 1. pipeline catch パスの safety net

state 遷移の責務は pipeline にある。executor は `failed` を設定して throw し、pipeline が transition table 経由で `awaiting-resume` に遷移する。executor に `awaiting-resume` の知識を持たせない。

1. `pipeline.runInternal()` の catch パス（L154-160）で、`.state` が付いていない throw に対し `store.fail()` で state を `failed` にする。これにより後続の `getStepOutcome()` → `"error"` → transition table → `escalate` → `awaiting-resume` の既存フローに乗る
2. `pipeline.run()` の catch パス（L79-87）で、`state.status` が `running` の場合は `awaiting-resume` に遷移させる fallback を入れる（runInternal を超えて throw が漏れた場合の最終防衛線）

### 2. resume の step 解決を失敗理由に応じて分岐

`from` 未指定時のデフォルトを、失敗理由に応じて決定する。

3. **crash/error**（`resumePoint.iterationsExhausted === 0` または step が reviewer でない）: `resumePoint.step` そのものから再開する。implementer が crash → implementer からやり直す
4. **review exhaustion**（`resumePoint.iterationsExhausted > 0` かつ step が reviewer）: 対応する fixer から再開する。spec-review が 2 回 needs-fix → spec-fixer から、code-review が 2 回 needs-fix → code-fixer から
5. `--from` が明示的に指定された場合は `--from` が最優先（既存の role-based mapping を維持）
6. `resumePoint` が null かつ `from` 未指定の場合は fallbackStep から phase を推定し critic で再開（既存の fallback 挙動を維持）

### 3. テスト

7. pipeline catch で `.state` なしの throw を受けた場合、state が `awaiting-resume` になることを検証
8. pipeline.run() で runInternal を超えた throw でも state が `awaiting-resume` になることを検証
9. `resolveResumeStep()` で crash（iterationsExhausted=0）→ `resumePoint.step` から再開を検証
10. `resolveResumeStep()` で review exhaustion（iterationsExhausted>0、reviewer step）→ fixer から再開を検証
11. `--from` 指定時は `--from` が最優先されることを検証

## スコープ外

- resume 時に agent に失敗理由を伝える `--message` オプション（別 request）
- cancel コマンド（別 request）

## 受け入れ基準

- [ ] executor が `.state` なしで throw した場合でも、state が `awaiting-resume` になる（`running` のまま残らない）
- [ ] pipeline.run() の catch まで throw が漏れても、state が `awaiting-resume` になる
- [ ] `resumePoint` に失敗した step 名と理由が記録される（既存の escalation パスで実装済み — 動作を確認）
- [ ] crash で失敗した step は同じ step から再開される（from 未指定時）
- [ ] review exhaustion で失敗した reviewer step は対応する fixer から再開される（from 未指定時）
- [ ] `--from` 指定時は role-based mapping が最優先される
- [ ] `bun run typecheck && bun run test` が green

## 補足

### architect 評価済みの設計判断

- `awaiting-resume` への遷移は pipeline の責務。executor は `failed` を設定するだけ。executor に pipeline レベルの state 遷移を知らせない（責務分離）
- pipeline catch の safety net は defense in depth: executor に漏れがあっても pipeline が救える
- resume のデフォルトを crash/exhaustion で分岐する設計は、step kind（reviewer vs creator/fixer）と `iterationsExhausted` で判定できる。`resumePoint` に既に必要な情報が含まれている


---

> **Note**: This request was archived before the change-folder format was introduced.
> Only `request.md` is preserved; design / tasks / delta-specs are not available.
> Migrated from `specrunner/requests/merged/fix-crash-state-and-resume-step-resolution.md` by `merged-to-archive-consolidation`.
