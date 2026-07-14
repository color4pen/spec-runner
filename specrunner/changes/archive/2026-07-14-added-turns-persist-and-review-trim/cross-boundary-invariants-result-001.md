# Cross-Boundary Invariants Review: added-turns-persist-and-review-trim

- **reviewer**: cross-boundary-invariants
- **iteration**: 1
- **verdict**: approved

## Summary

3 変更（journal 永続化・postWork count-miss 修正・code-review followUpPrompt 撤去）を通じて、実装が黙って破る暗黙の前提（不変条件）を検出した。違反は見当たらない。

## 検査した不変条件と判定

### INV-1: `reportRetry + outputRepair === followUpAttempts`

- **境界**: `ClaudeCodeRunner.run()` の report_result 再試行ループ → output repair ループ → 返却 `AgentRunResult`
- **判定**: ✓ 維持
- `postWork++` の移動はこの等式に含まれない `postWork` カウンタのみを変更する。`followUpAttempts` は `reportRetry`/`outputRepair` のループ内で対称に加算され続ける（agent-runner.ts:739/860）。`ADDED_TURNS_ZERO` の error/timeout 経路はすべて `followUpAttempts: 0` と `{ 0,0,0 }` を同時に返し `0+0===0` を保つ。

### INV-2: postWork は「消費した turn の数」を表す

- **境界**: post-work ループ内の `runFollowUpQueryWithRetry` 呼び出し → failure early-return
- **判定**: ✓ 維持
- 変更前は `postWork++` が failure early-return より後にあり、失敗した turn が未計上だった。移動後は `runFollowUpQueryWithRetry` 返却直後に加算されるため、成功・非 success 返却どちらの経路でも 1 回加算される（agent-runner.ts:766–767）。
- なお `runFollowUpQueryWithRetry` が throw した場合（transient 再試行消尽）は外側の catch に飛ぶため `postWork++` は実行されない。この経路は `ADDED_TURNS_ZERO` を返し `postWork: 0` になるが、throw 経路でのカウント喪失は設計 D2 が明示的に許容（"catch block で counter が block-scope 外の経路 → ADDED_TURNS_ZERO"）。

### INV-3: journal round-trip で `addedTurns` がロスレス

- **境界**: `StepRun.outcome.addedTurns` → `stepRunToRecord` → `appendEventRecord` → `fold()`
- **判定**: ✓ 維持
- `stepRunToRecord`（event-journal.ts:366）と `fold()`（event-journal.ts:293）の双方が同一の `conditional-spread` パターンを使用し、他の optional outcome field（toolResult・followUpAttempts 等）と整合している。

### INV-4: 旧 journal record（addedTurns なし）の後方互換

- **境界**: 既存の `events.jsonl` → `fold()`
- **判定**: ✓ 維持
- `addedTurns` が optional field で conditional-spread により復元される。旧 record を fold すると `r.outcome.addedTurns` が `undefined` になり、spread は空 `{}` となり、`StepRun.outcome.addedTurns` が `undefined` のまま保たれる。

### INV-5: `state.json` に `steps` が含まれない（`addedTurns` の永続化は journal 専用）

- **境界**: `stateToStateJson` → `state.json` → load 時 `fold()` で reconstruction
- **判定**: ✓ 維持
- `stateToStateJson` は `history` と `steps` を明示的に除外し（job-state-projection.ts:158–159）、`addedTurns` は journal のみに永続化される設計を壊さない。

### INV-6: code-review の `followUpPrompt` 撤去後も content-format repair path が動く

- **境界**: `step-context-builder.ts` → `allFollowUpPrompts` → `postWorkPrompts` → `shouldRunFollowUp` / `outputVerification`
- **判定**: ✓ 維持
- `existingFollowUp` が `undefined` になり、`allFollowUpPrompts` が `[]`、`postWorkPrompts: undefined`（step-context-builder.ts:151 の `length > 0` ガード）。
- `shouldRunFollowUp` は `postWorkPrompts?.length > 0` のとき true なので、post-work ループは実行されない。
- 一方 `outputContracts` の content-format contract（policy: "follow-up"）は残存し、format 違反時は output repair turn が発火する（agent-runner.ts:812–862）。これは `followUpPrompt` とは独立した経路であり除去の影響を受けない。

### INV-7: code-review 撤去 → routing 変化なし

- **境界**: `followUpPrompt` の self-check → `deriveJudgeVerdict` → pipeline 遷移
- **判定**: ✓ 維持
- `deriveJudgeVerdict` は structured findings（`report_result` の schema 検証済み severity enum）を入力とし（judge-verdict.ts:32–40）、.md の Fix カラム/severity 値を参照しない。self-check turn の撤去は routing の入力経路を変えない。

### INV-8: legacy-resume code-fixer の `.md` フォールバック経路

- **境界**: structured toolResult を欠く旧 job の resume → `code-fixer.ts:323` → `.md` 読み込み
- **判定**: ✓ 維持
- `.md` 自体は code-review の main work turn が引き続き出力する。撤去されたのは self-check turn であり、`.md` の生成元は変わらない。フォールバック経路の挙動は不変。

### INV-9: `ADDED_TURNS_ZERO` は frozen object — 共有参照安全性

- **境界**: error/timeout 経路での `addedTurns: ADDED_TURNS_ZERO` 返却 → downstream（executor / commit-orchestrator / state helpers / JSON.stringify）
- **判定**: ✓ 維持
- downstream は `addedTurns` を読み込み・conditional-spread・JSON シリアライズするのみで変更を加えない。Object.freeze で保護されているが、変更がないため問題は生じない。

### INV-10: specrunner/rules/code-review/ の不在による rule-derived follow-up の欠如

- **境界**: `resolveStepRules("code-review", ...)` → `rulesPrompts` → `allFollowUpPrompts`
- **判定**: ✓ 維持
- `specrunner/rules/code-review/` ディレクトリが存在しないことを確認した。`rulesPrompts` は空配列になり、`allFollowUpPrompts` が `[]` になる。将来このディレクトリが作成された場合は rule-based follow-up が自動的に有効になる（設計上の意図）。

## Findings

なし。

## Observations

- **[low]** `runFollowUpQueryWithRetry` が throw した場合（transient 再試行消尽後）に `postWork++` が実行されない点はエッジケースとして残る。throw は outer catch に到達し `ADDED_TURNS_ZERO` が返されるため自己整合しており、設計 D2 が明示的に許容している。既存の unit test がこの経路を直接カバーしていないが、優先度は低い。
