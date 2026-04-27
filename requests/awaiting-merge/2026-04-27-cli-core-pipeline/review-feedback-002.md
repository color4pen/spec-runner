# Review Feedback: 2026-04-27-cli-core-pipeline — Iteration 2

## Code Review Result

- **Verdict**: approved
- **Score**: 7.30 / 10.0 (pass threshold: 7.0)
- **Iteration**: 2/2
- **Trend**: improving (+1.05 vs iter 1)

## Scores

| Category | Score (1-10) | Weight | Weighted |
|----------|--------------|--------|----------|
| correctness | 7 | 0.30 | 2.10 |
| security | 7 | 0.25 | 1.75 |
| architecture | 9 | 0.15 | 1.35 |
| performance | 7 | 0.10 | 0.70 |
| maintainability | 7 | 0.10 | 0.70 |
| testing | 7 | 0.10 | 0.70 |
| **Total** | | | **7.30** |

## Verdict

- **verdict**: approved
- **pass_threshold**: 7.0
- **blocking_findings**: CRITICAL: 0, HIGH: 0
- **rationale**: Total score 7.30 ≥ 7.0; all three iter-1 HIGH findings (H1 race, H3 SSE fallback ambiguity) eliminated or demoted. H2 (spec divergence on `stop_reason`) remains as MEDIUM — no longer a silent-failure path because `idle+requires_action` polling fallback now reaches `BRANCH_NOT_REGISTERED` rather than silent success. Must-scenario coverage 54/64 (84%, 90% excl. 4 manual-only). Build/Type/Test/Security all PASS.

## Verification Summary

| Phase | Result | Detail |
|-------|--------|--------|
| Build | PASS | tsc --noEmit clean |
| Type Check | PASS | strict mode, 0 errors |
| Lint | N/A | プロジェクト未導入（ESLint/Biome 未設定） |
| Tests | PASS | vitest 71/71 (10 files); +22 vs iter 1 |
| Security | PASS | npm audit 0 vulnerabilities |

## Consolidated Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | consistency | src/core/completion.ts:29-33 vs openspec/changes/2026-04-27-cli-core-pipeline/specs/session-completion-detection/spec.md L7 | spec MUST `client.beta.sessions.retrieve()` のポーリング結果で `status === "idle"` **かつ** `stop_reason === "end_turn"` を観測した時に completion を確定」と要求するが、`isProposeComplete(session)` は `session.status === "idle"` のみを返す。SDK 0.91.0 の `BetaManagedAgentsSession` には `stop_reason` が存在しないため、ポーリング単独では仕様を満たせない。**ただし iter 1 から失敗モードが軽減**：`terminationReason` 導入により SSE 経路で `idle+end_turn` を確定でき、polling fallback で `idle+requires_action` を誤認しても直後の branch チェックで `BRANCH_NOT_REGISTERED` として失敗するため、サイレント障害は発生しない。HIGH → MEDIUM。 | (a) `pollUntilComplete` 内で `idle` 観測後に `client.beta.sessions.events.list(sessionId, { limit: 1, order: "desc" })` を呼び、最新の `session.status_idle` イベントの `stop_reason` を確認する（SDK 0.91 に該当 API あり、`events.d.ts` L14 を確認）、または (b) spec を「ポーリングは `idle` で確定し、`stop_reason` の確認は SSE 経路の責務」と更新する。Phase 1 では (b) で spec-fixer に渡してもよい。 |
| 2 | MEDIUM | security | src/auth/constants.ts:7 | iter 1 と同。`getGithubClientId()` のフォールバック値 `"Iv23liasdfGHclient0001"` がプレースホルダの可能性が高く、env で上書きしないとデバイスフロー要求が GitHub 側で 404/401 で拒否される。テストでは override で通るが、本番起動時に env 設定漏れがあるとサイレントに失敗する。 | (a) フォールバックを削除し env 必須にして `SPECRUNNER_GITHUB_CLIENT_ID is required` で fail-fast、または (b) 実プロダクション用 client_id を登録してデフォルトとする。`specrunner login` 開始時に env チェックして明確なエラーメッセージを出すのが現実的。 |
| 3 | MEDIUM | correctness | src/auth/github-device.ts:115-121 | iter 1 と同。`expired_token` / `access_denied` の分岐で `process.exit(1)` をライブラリ層で直接呼んでいる。テストで `process.exit` を spy + throw でハックする必要があり、また cli 層の cleanup を阻害する。 | `SpecRunnerError("GITHUB_AUTH_TIMEOUT", ...)` / `SpecRunnerError("GITHUB_AUTH_DENIED", ...)` を throw し、`bin/specrunner.ts` または `cli/login.ts` の catch で exit code を決定する。 |
| 4 | MEDIUM | correctness | src/core/completion.ts:104 | iter 1 と同。`calculateBackoff(0, intervalMs)` で `attempt` 引数に常に 0 を渡しているが、関数本体は `currentIntervalMs * BACKOFF_FACTOR` のみを使い `attempt` は dead-weight。test-cases.md TC-029 が「指数バックオフ 1→3→9」を要求するが、現実装は常に 1.5x 増（2000→3000→4500→6750→...）であり挙動は概ね正しいが、引数のシグネチャが意図不明。 | `calculateBackoff` から `attempt` 引数を削除して `nextBackoff(currentIntervalMs)` にリネーム。callsite も同時に変更。 |
| 5 | MEDIUM | maintainability | src/core/pipeline.ts:35-366 | iter 1 と同。`runProposePipeline` が 332 行と肥大化。フェーズ分解・history append helper の抽出が未実施。可読性は確保されているが将来の拡張で破綻する。 | `createSessionPhase`、`runSseAndPollPhase`、`verifyBranchPhase`、`verifyChangeFolderPhase` に分解。`recordPhase(state, step, status, message)` ヘルパで history append のボイラープレートを集約。Phase 2 のリファクタで対応してよい。 |
| 6 | MEDIUM | correctness | src/core/pipeline.ts:243-291 | iter 1 と同。branch verify と change folder verify で同じパターン（fetch → 401/404 分岐 → state update）が 2 回書かれており、catch のフォールスルー（`code === "GITHUB_TOKEN_EXPIRED"` を再 throw）が複雑。 | `verifyGithubResource(url, token, expectedCodes)` ヘルパに抽出して 2 箇所を統一する。 |
| 7 | MEDIUM | maintainability | src/state/schema.ts:74-107 | iter 1 と同。`validateJobState` は存在チェックのみで `status` enum や `history` 各要素の shape チェックが無い。 | enum チェックと history 各要素の shape チェックを追加。`design.md` の "hand-written validators (no zod)" 方針に整合する範囲で。 |
| 8 | MEDIUM | testing | tests/ | must scenario 64 件中 10 件未実装（うち 4 件は `manual` カテゴリで unit/integration では検証不可）。実装可能な未実装 must: TC-052（config 緩い permission warning）、TC-054（github.accessToken 欠落の `Run 'specrunner login' first.`）、TC-055（apiKey が stdout に出ない）、TC-102（login で github ブロック保存）、TC-103（init で custom_tools が registry 由来）。 | code-fixer または test-augmenter で 5 件を追加実装。優先順位: (1) TC-103（registry-only chain。Bug 1 再発防止に直結）、(2) TC-055（secret leak）、(3) TC-054（fail-fast 検証）、(4) TC-102, TC-052。 |
| 9 | LOW | correctness | src/parser/request-md.ts | iter 1 から繰り越し。unknown type を warning で許容するが、TC-006（should）が未実装。pipeline 後段で `request.type` 分岐がないため、unknown type は事実上処理を阻害しない。 | TC-006 を追加実装するか、許容 type を strict にして `requestMdInvalidError` を throw する方針に統一する。Phase 1 では情報提供レベル。 |
| 10 | LOW | correctness | src/cli/init.ts:113-117 | iter 1 と同。Environment 作成失敗時の rollback で `client.beta.agents.archive(agentId)` 失敗時に stderr のみ出力し、orphaned agent が残ったことを呼び出し元が判別できない。 | `cleanup_failed: true` を error info に含めるか、`SpecRunnerError("INIT_ROLLBACK_FAILED", ...)` でラップして throw する。TC-085 は実装済みだが、cleanup 失敗時の error code 伝搬は未検証。 |
| 11 | LOW | correctness | src/cli/login.ts | iter 1 と同。login 単独で `apiKey: ""` で config を保存する順序依存問題。test-cases に対応 must がないため Phase 2 でよい。 | login 単独では partial save を許容するか、login 前に init 実行を要求するチェックを入れる。 |
| 12 | LOW | architecture | src/core/completion.ts vs src/core/session.ts | `assertBreakAfterCompletion` の guard function は副作用なし・条件 throw もないため、テストで break を保証する役割を果たしていない（TC-026 のテストも `not.toThrow` を確認するのみ）。dead-doc-only ヘルパに近い。 | (a) 削除して session.ts のコメントで break-after-completion を強調する、または (b) global counter で「呼ばれたか」を検証する形にして TC-026 を強化する。 |
| 13 | LOW | maintainability | src/core/completion.ts:32 | コメント「polling does not expose stop_reason directly — that's only in SSE events」が現在のフォールバック設計（`terminationReason`）を反映していないため誤誘導の可能性あり。 | 「`isProposeComplete` は polling 経路専用で `idle` を主指標とする。SSE 経路の `stop_reason` 確認は session.ts の `terminationReason` で表現する」と書き換える。 |
| 14 | LOW | maintainability | bin/specrunner.ts | iter 1 と同。switch case で flag parsing を inline。Phase 1 ではスコープ外可。 | 将来的に minimist 等の薄い CLI parser または `parseFlags` ヘルパに抽出。 |

## Iteration Comparison

### Improvements

- **(H1 SOLVED)** `src/core/pipeline.ts:110-115` — `onBranchRegistered` callback は `registeredBranch` 変数のみ更新し、state 永続化は SSE 完了後の main flow（line 198-207）で同期実行。lost-update race を完全に排除。code-fixer の decision-log と一致（H1）。
- **(H3 SOLVED)** `src/core/session.ts:27-39` — `TerminationReason` 型と `terminationReason` フィールドを `SessionResult` に追加。`pipeline.ts:158-159` の `needsPollingFallback` 判定が `terminationReason !== "end_turn" && !== "terminated"` に変更され、`idleEndTurnDetected: false` と `sseDisconnected: false` が同時成立する曖昧経路が解消。
- **(H4 LARGELY SOLVED)** must テスト 41/63 → 54/64（65% → 84%、auto-only では 90%）。`tests/pipeline.test.ts`（434 行・8 シナリオ）と `tests/init.test.ts`（229 行・5 シナリオ）と `tests/cli.test.ts`（247 行・6 シナリオ）が新規追加。特に **TC-035-042（pipeline 振る舞い）、TC-061（rollback）、TC-063-068（fail-fast / ps）** が実装済。サイレント障害検出に最も効果的なシナリオ群がカバー。
- **(M9 SOLVED)** `src/core/pipeline.ts:209-218` — `status: sseResult.idleEndTurnDetected ? "ok" : "ok"` の dead ternary を `terminationReason === "end_turn" ? "ok" : "warning"` に修正し、polling fallback 経由の completion に warning を出すようになった。
- **(M11 SOLVED)** `loadJobState` 削除済み（`src/state/store.ts`）。
- **(M13 SOLVED)** `src/core/tools/register-branch.ts` のモジュールレベル state（`currentBranch` / `getRegisteredBranch` / `resetRegisteredBranch`）が完全削除され、handler は input を validate して return するだけに。`src/core/tools/index.ts` および `src/cli/run.ts` の関連 import / `resetRegisteredBranch()` 呼び出しも整理。並列セッション安全性が向上。
- **(M16 SOLVED)** `createNewEnvironment(_agentId)` の未使用引数を削除。同時に SDK 仕様変更に追従して `config: { type: "cloud", packages: { type: "packages", npm: ... } }` 形式に修正（M16 の修正に副次的に含まれる SDK 整合）。
- **(M17 SOLVED)** `isRequiresActionIdle` を `src/sdk/sessions.ts` から削除（dead code）。
- **(architecture +1)** module-level state 撤廃 + `terminationReason` の type narrowing で全体の責務が一段クリアに（8 → 9）。

### Regressions

- 検出なし。SDK の Environment 作成 API シグネチャ変更（`packages` → `config.packages`）の追従は M16 修正と同時に行われており、退行ではなくむしろ整合改善。

### Unchanged Issues

- **(M5 carried)** `src/auth/constants.ts:7` GitHub client_id プレースホルダ（finding #2）。
- **(M6 carried)** `src/auth/github-device.ts:115` ライブラリ層 `process.exit` アンチパターン（finding #3）。
- **(M7 carried)** `calculateBackoff(0, intervalMs)` の dead `attempt` 引数（finding #4）。
- **(M8 carried)** `runProposePipeline` の 332 行肥大化（finding #5）。
- **(M10 carried)** branch / change folder verify の重複（finding #6）。
- **(M12 carried)** `validateJobState` の enum/shape 不足（finding #7）。
- **(M14 carried, demoted to LOW)** TC-006 unknown type 未実装（finding #9）。
- **(M15 carried)** init rollback 失敗時の error code 伝搬欠如（finding #10）。

## Score Progression

| Iteration | Total Score | Verdict | Key Changes |
|-----------|-------------|---------|-------------|
| 1 | 6.25 | needs-fix | initial review; HIGH x3 (state race, completion-detection vs spec, SSE fallback ambiguity) + MEDIUM x10; testing 41/63 must（65%） |
| 2 | 7.30 | approved | H1/H3 解消、H4 大幅前進（54/64、84%）、H2 は MEDIUM 降格（サイレント障害でなくなったため）。M9/M11/M13/M16/M17 修正。architecture +1（module state 撤廃）、testing +3（71/71、振る舞いテスト追加）、correctness +2（race / fallback 解消） |

## Convergence

- **trend**: improving（+1.05、`improving` 閾値 0.3 を大幅超過）
- **recommendation**: approved（pass threshold 到達 + HIGH/CRITICAL 0）
- **next-phase-focus**（次の request または cleanup PR で対処推奨）:
  1. (M1) `events.list` を使った `idle + stop_reason` 確認 or spec 更新で完了検知の整合
  2. (M2) GitHub client_id の本番値登録 or env 必須化
  3. (M3) `process.exit` 削除 → `SpecRunnerError` 集約
  4. (M5/M6) `runProposePipeline` のフェーズ分解 + GitHub verify ヘルパ抽出
  5. (M8) 残り 5 件の auto-implementable must テスト（TC-052/054/055/102/103）

## Summary

iteration 1 → 2 で **+1.05 ポイントの大幅改善**（improving）。code-fixer は decision-log（`requests/active/2026-04-27-cli-core-pipeline/decisions/code-fixer.md`）に宣言された 7 項目（H1, H2, H3, H4, M9, M11, M13）すべてに着手し、H1/H3/M9/M11/M13 を完全解消、H4 を 65% → 84% まで前進、H2 は SDK 制約により完全対応はできなかったが `terminationReason` 導入により失敗モードがサイレントから明示的（`BRANCH_NOT_REGISTERED`）へ転換され MEDIUM に降格。

architecture スコアは module-level state 撤廃により 8 → 9。testing は behavior テスト追加で 4 → 7、correctness は race / fallback 曖昧性の解消で 5 → 7。

残る findings はすべて MEDIUM/LOW で、いずれも次フェーズまたは cleanup PR で対処可能。spec divergence (M1)、placeholder client_id (M2)、ライブラリ層 process.exit (M3) の 3 点は技術負債としてフォローアップ推奨。

**verdict: approved** — pass threshold（7.0）達成、CRITICAL/HIGH 0 件、トレンド improving、サイレント障害経路の遮断完了。
