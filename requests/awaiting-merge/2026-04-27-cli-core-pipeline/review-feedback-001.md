# Review Feedback: 2026-04-27-cli-core-pipeline — Iteration 1

## Code Review Result

- **Verdict**: needs-fix
- **Score**: 6.25 / 10.0 (pass threshold: 7.0)
- **Iteration**: 1/2
- **Trend**: — (initial)

## Scores

| Category | Score (1-10) | Weight | Weighted |
|----------|--------------|--------|----------|
| correctness | 5 | 0.30 | 1.50 |
| security | 7 | 0.25 | 1.75 |
| architecture | 8 | 0.15 | 1.20 |
| performance | 7 | 0.10 | 0.70 |
| maintainability | 7 | 0.10 | 0.70 |
| testing | 4 | 0.10 | 0.40 |
| **Total** | | | **6.25** |

## Verdict

- **verdict**: needs-fix
- **pass_threshold**: 7.0
- **blocking_findings**: CRITICAL: 0, HIGH: 3
- **rationale**: Total score below threshold (6.25 < 7.0). Three HIGH findings around correctness (race condition, spec divergence in completion detection, missing fail-fast for `requires_action` polling) plus 22 unimplemented `must` test scenarios.

## Verification Summary

| Phase | Result | Detail |
|-------|--------|--------|
| Build | PASS | tsc --noEmit / tsc --outDir dist エラー 0 件 |
| Type Check | PASS | strict mode、エラー 0 件 |
| Lint | N/A | プロジェクト未導入（ESLint/Biome 未設定） |
| Tests | PASS | vitest 49/49 PASS（6 test files） |
| Security | PASS | npm audit clean（0 vulnerabilities） |

## Consolidated Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | correctness | src/core/pipeline.ts:110-127 | `onBranchRegistered` コールバック内で `void (async () => { state = await updateJobState(state, ...) })` で外側の `state` 変数を fire-and-forget で更新している。同時に main flow（lines 129, 136, 144 以降）も `state = await appendHistory(...)` で同じ変数に書き込むため、lost-update race が発生する。SSE コールバックの非同期書き込みが main flow の `appendHistory` の合間に挟まると、片方の `history` 追記が永続化されない可能性がある。**サイレント障害**（state file から history が一部消える）として顕在化する。 | (a) `state` を変数代入で並行更新するパターンを廃止する。コールバックは `registeredBranch` 変数だけ更新し、永続化は main flow が SSE 完了後に同期的に行う。または (b) state 更新を逐次化するシリアライザ（mutex / queue）を導入する。最もシンプルなのは (a): `onBranchRegistered: (b) => { registeredBranch = b; }` のみとし、`state = await appendHistory(...)` の `register-branch-received` エントリは ssePromise 完了後にまとめて追加する。 |
| 2 | HIGH | correctness | src/core/completion.ts:29-33 | `isProposeComplete` が `session.status === "idle"` のみを返し、`stop_reason === "end_turn"` を確認していない。spec（specs/session-completion-detection/spec.md L9）は MUST `{ status: "idle", stop_reason: "end_turn" }` を求めているが、コメント「polling does not expose stop_reason」を理由にチェックを省略している。SDK 0.91.0 の `BetaManagedAgentsSession.status` は `'rescheduling' \| 'running' \| 'idle' \| 'terminated'` のみで `stop_reason` は持たないため、ポーリングのみで `idle+end_turn` と `idle+requires_action` を識別できない。SSE が切断されてポーリング fallback に入った場合、`requires_action`（Custom Tool 応答待ち）のセッションを「完了」と誤判定し、`branchNotRegisteredError` を即出力する誤った失敗フローに進む。 | (a) ポーリングで `idle` を観測した時点で `events.list(sessionId)` を 1 回呼び、最新の `session.status_idle` イベントの `stop_reason` を取得して `end_turn` でなければ未完了として継続する、または (b) spec を「ポーリングは `idle` を主指標とし、`stop_reason` は SSE のみ」と修正する（spec-fixer）。実装側で対処する場合は `pollUntilComplete` 内で「idle 観測後に events.list で確認」する処理を追加する。design.md L429 の R2 mitigation も同じ要件を述べている。 |
| 3 | HIGH | correctness | src/core/pipeline.ts:163-198 | SSE が完了せず（`idleEndTurnDetected: false` かつ `terminated: false`）、`sseDisconnected` も false の場合（SSE が "正常完了" せず黙ってループ終了したケース）にも `pollUntilComplete` に fallback する分岐になっているが、その場合ポーリングは `isProposeComplete` で `idle` を真とするため、即「完了」を返してしまう（finding #2 と相互作用）。さらに `if (sseDisconnected \|\| !sseResult.idleEndTurnDetected)` の条件は SSE が `terminated` で正常に break した場合（`terminated: true`）には到達しないが、その分岐で `state` の `session-terminated` への更新は line 146-160 で実行済みのため redundancy がある。 | finding #2 を修正すれば自然に解消する。加えて、SSE が `idleEndTurnDetected: false` で抜けた理由（abort, error, normal exit）を区別する戻り値を追加し、ambiguous な fallthrough を排除する。`SessionResult` に `terminationReason: 'end_turn' \| 'terminated' \| 'sse_error' \| 'aborted' \| 'unknown'` を追加することを推奨。 |
| 4 | HIGH | testing | tests/ | 全 must scenario 63 件中 22 件が未実装（test-cases.md / implementation-notes.md より）。特に致命的サイレント障害の検出に有効なシナリオが欠落している: TC-035-042（pipeline 状態遷移、`register_branch` 未呼び出し検出、SSE 順序、CHANGE_FOLDER_NOT_FOUND、401, branch 不在 warn）、TC-057-062（init 冪等性、Env 失敗 rollback）、TC-063-068（fail-fast 順序）、TC-072（不明 cmd exit 2）。review-lessons.md「サイレント障害（エラーなし・機能しない）の検出にはテストが最も有効」に直接抵触。 | code-fixer に test-cases.md と implementation-notes.md の Coverage Gaps セクションを渡し、22 件の must テストを実装させる。優先順位は以下: (1) TC-037（register_branch 未呼び出しで BRANCH_NOT_REGISTERED）、(2) TC-035-036（pipeline 状態遷移記録）、(3) TC-061（Environment 作成失敗で agent rollback）、(4) TC-040-041（GitHub 401 / change folder 404）、(5) 残り。pipeline.ts は mock を使った振る舞いテストで検証する。 |
| 5 | MEDIUM | security | src/auth/constants.ts:7 | `getGithubClientId()` のフォールバック値 `"Iv23liasdfGHclient0001"` がプレースホルダとみられる。実 GitHub OAuth App の client_id でないため、env で上書きしないとデバイスフロー要求が GitHub 側で拒否される（404/401）。テストでは env を override して通るが、本番起動時にユーザーが env を設定し忘れるとサイレントに失敗する。 | (a) フォールバック値を削除し env 必須にして「`SPECRUNNER_GITHUB_CLIENT_ID is required`」で fail-fast にする、または (b) 実プロダクション用 client_id を登録してデフォルト値とする。design.md / proposal.md でどちらの方針かを明示すること。`specrunner login` の最初に env チェックを入れて明確なエラーメッセージを出すのが現実的。 |
| 6 | MEDIUM | correctness | src/auth/github-device.ts:115-121 | `expired_token` / `access_denied` の分岐で `process.exit(1)` を直接呼んでいる。ライブラリ層で `process.exit` を呼ぶと (a) 上位の cli/login.ts での後処理（finally / cleanup）が走らず、(b) テストで verifying するために `vi.spyOn(process, "exit").mockImplementation(() => { throw ... })` のハック（TC-077, TC-078）を強制する。ハックなしでは vitest 実行が即座に終了してしまう。アンチパターン。 | `SpecRunnerError` を throw し、`bin/specrunner.ts` の `main().catch(...)` または `cli/login.ts` で exit code を決定する。たとえば新規 error code `GITHUB_AUTH_TIMEOUT` / `GITHUB_AUTH_DENIED` を追加し、cli 層で適切な exit code を返す。 |
| 7 | MEDIUM | correctness | src/core/completion.ts:104 | `intervalMs = calculateBackoff(0, intervalMs)` で `attempt` 引数に常に `0` を渡しているが、`calculateBackoff(attempt, currentIntervalMs)` のシグネチャ上 `attempt` は使われていない（実装は `currentIntervalMs * BACKOFF_FACTOR` のみ）。引数が dead-weight。test-cases.md TC-029 が「指数バックオフの初期 3 回間隔」を要求しているが、現在の実装は 2000 → 3000 → 4500 → ... と毎回 1.5x で増えるため、test-cases.md の意図する 1→3→9→27 とは異なる挙動。 | (a) `calculateBackoff` から `attempt` 引数を削除して `nextBackoff(currentIntervalMs)` にリネーム、または (b) `attempt` ベースの指数（`INITIAL * factor^attempt`）に変更し callsite で attempt を増やす。implementation-notes.md「指数バックオフ 1→3→9→27」とコードが乖離しているため spec / test との整合を取る。 |
| 8 | MEDIUM | maintainability | src/core/pipeline.ts:42-353 | 関数が 312 行と肥大化し、history append + state update + error handling のボイラープレートが 30 箇所以上に重複している。"session-create" / "register-branch-received" / "branch-verified" / "change-folder-verified" などのフェーズロジックが入れ子で読みにくい。 | フェーズ単位に分解する。`createSessionPhase(state, deps) → state`, `runSseAndPollPhase(state, deps) → { state, branch }`, `verifyBranchPhase(state, deps, branch) → state`, `verifyChangeFolderPhase(state, deps, branch) → state` のように切り出し、`runProposePipeline` をオーケストレーション層に薄くする。history append のボイラープレートは `recordPhase(state, step, status, message)` ヘルパに集約する。 |
| 9 | MEDIUM | correctness | src/core/pipeline.ts:201-206 | `state = await appendHistory(state, { ..., status: sseResult.idleEndTurnDetected ? "ok" : "ok", ... })` で三項演算子の両分岐が `"ok"` で同じ。意図不明の dead-code またはコピペバグ。 | `status: "ok"` に修正、または fallback ケースでは `"warning"` を出す（ポーリング fallback で完了した場合は warning が妥当）。 |
| 10 | MEDIUM | correctness | src/core/pipeline.ts:227-279 | branch verify と change folder verify の両方で同じ pattern（fetch → 401/404 分岐 → state update）を 2 回書いており、エラーハンドリングのフォールスルー（catch 内で `code === "GITHUB_TOKEN_EXPIRED"` を再throw）が複雑。 | `verifyGithubResource(url, token, expectedCodes)` ヘルパに抽出して 2 つの呼び出しを統一する。constraints.md「変換コード等の重複ロジックはヘルパー関数に抽出」に整合。 |
| 11 | MEDIUM | correctness | src/state/store.ts:122-127 | `loadJobState(jobId)` が定義されているが、コードベース内で誰も呼んでいない（grep 結果）。test-cases に対応する must もない。デッドコード。 | 削除するか、cli/ps の `--detail <jobId>` 等の機能で活用する（後者なら scope 外として除外）。review-lessons「デッドコード（本番コードから未参照の関数等）が残存していないか」に該当。 |
| 12 | MEDIUM | maintainability | src/state/schema.ts:74-107 | `validateJobState` は `version`, `jobId`, `createdAt` 等の存在チェックのみで、`status` 値が `"running" \| "success" \| "failed" \| "terminated"` のいずれかに含まれるかを検証していない。`history` 配列の各要素も検証していない。 | enum チェックと history 各要素の shape チェックを追加する。type-only narrowing なら zod-lite な手書き validator を厳密化する（design.md「hand-written validators (no zod)」方針に整合）。 |
| 13 | MEDIUM | architecture | src/core/tools/register-branch.ts:42, 47-48 | tool handler が module-level mutable state（`currentBranch`）を持つ。並列セッションが同一プロセス内で動いた場合に状態混線するリスク。本実装では single session 前提だが、`specrunner ps` のように将来の並列実行を考えると structural defect。`onBranchRegistered` callback が pipeline.ts に branch を渡しているため、この module-level state 自体が dead state。 | handler は input の branch を validate して `{ ok: true, branch }` を返すだけにし、`currentBranch` / `getRegisteredBranch` / `resetRegisteredBranch` を全て削除する。SSE dispatcher（session.ts:92）は handler の戻り値から branch を取得して `onBranchRegistered` を呼ぶ既存ロジックで十分。 |
| 14 | MEDIUM | correctness | src/parser/request-md.ts:80-82 | unknown type を `stderrWrite("Warning: ...")` で警告して継続するが、test-cases.md TC-006（must）が要求する挙動と整合しているか未確認（TC-006 は未実装）。さらに pipeline 後段で `request.type` を使った分岐がないため、unknown でも success に至る。要件適合性が要検証。 | TC-006 を実装し、unknown type で warning を出した上でフローが継続することを assert する。または design.md で許容 type を strict にしたいなら type 不一致で `requestMdInvalidError` を投げる方針に切替え、warning 路線は廃止する。 |
| 15 | LOW | correctness | src/cli/init.ts:113-117 | Environment 作成失敗時の rollback で `client.beta.agents.archive(agentId)` が失敗した場合に `stderrWrite("Failed to cleanup orphaned agent ...")` を出すだけで、終了コードや error info は呼び出し元に伝わらない（envErr は throw される）。orphaned agent が残ったことを呼び出し元が判別できない。 | rollback 失敗時に `cleanup_failed: true` を含む error info を構築するか、`SpecRunnerError("INIT_ROLLBACK_FAILED", ...)` でラップして throw する。テスト TC-061 でも検証する。 |
| 16 | LOW | maintainability | src/cli/init.ts:161-172 | `createNewEnvironment` の引数 `_agentId` が未使用（先頭アンダースコアで意図的に無視）。Environment は agentId と紐付かないなら引数自体を削除すべき。 | `createNewEnvironment(client)` にシグネチャを変更する。 |
| 17 | LOW | architecture | src/sdk/sessions.ts:108-110 | `isRequiresActionIdle` が export されているが、コードベース内で参照がない。仕様（specs/session-completion-detection/spec.md L47）には `requires_action` で「再 dispatch」する記述があるが、実装側でこの述語は未使用。 | 実装される予定がない場合は削除する。Phase 2 で `requires_action` recovery を実装する場合は今回のレビューでスコープ外として明示する。 |
| 18 | LOW | maintainability | src/logger/stdout.ts:6-11 | mask 対象が API key / token のみ。GitHub user_code（device flow で表示される短いコード）は秘密ではないが、エラーログに含まれた場合に注意を喚起したい場合がある。Slack 等への外部出力は今回スコープ外なので情報提供のみ。 | スコープ外。Phase 2 でログ destinations が増えた際に再評価。 |
| 19 | LOW | performance | src/util/atomic-write.ts:33-39 | コメント「fsync would require opening with fs.open but writeFile handles flushing」とあるが、`writeFile` は OS バッファに書いた後 close するだけで `fsync` は呼ばない。クラッシュ耐性のみが要件で「データロス時はジョブを再実行可能」なら問題ないが、design.md / module-analysis では fsync 要否の議論がない。 | 現状で OK だが、design / module-analysis に「fsync は呼ばない、再実行可能性で吸収」と明記しておくと将来 review で再指摘されない。 |
| 20 | LOW | maintainability | bin/specrunner.ts:36-75 | `switch` の各 case で flag parsing を inline で行っている。将来コマンドが増えると重複が増える。 | minimist 等の薄い CLI parser を使うか、`parseFlags(args, schema)` ヘルパを抽出する。Phase 1 ではスコープ外可。 |
| 21 | LOW | correctness | src/cli/login.ts:18-25 | login 単独で実行された場合（`specrunner login` だけ） `apiKey: ""` で config を保存する。次回 `specrunner run` で `loadConfig` が `validateConfig` の `apiKey.length === 0` チェックに引っかかり `CONFIG_INCOMPLETE` を吐く。順序依存だが、login 単独での「半分作成された config」が混乱の元。 | login 単独では config に github のみ書き込む partial save を許容するか（schema の version 1 + github のみで save）、login 前に必ず init を要求するチェックを入れる。test-cases に対応 must がない場合はスコープ外可。 |

## Iteration Comparison

（初回イテレーションのため記載なし）

### Improvements
- N/A (initial iteration)

### Regressions
- N/A (initial iteration)

### Unchanged Issues
- N/A (initial iteration)

## Score Progression

| Iteration | Total Score | Verdict | Key Changes |
|-----------|-----------|---------|-------------|
| 1 | 6.25 | needs-fix | initial review; HIGH x3 (state race, completion detection vs spec, SSE fallback ambiguity) + MEDIUM x10; testing コアレッジ 65%（41/63 must） |

## Convergence

- **trend**: — (initial)
- **recommendation**: continue → code-fixer に H1〜H4 を優先修正 + must テスト追加 を指示し iteration 2 へ
- **next-iteration-focus**:
  1. (H1) pipeline.ts の state race を解消（callback では variable 更新のみ、永続化は main flow へ）
  2. (H2) `isProposeComplete` を `events.list` で stop_reason 確認に拡張、または spec 側を修正
  3. (H3) `SessionResult.terminationReason` を追加して fallback 条件を明示化
  4. (H4) 必須テスト 22 件を実装（特に TC-035-042 / TC-061）
  5. M5-M14 はベストエフォート（M9 / M11 の dead code 削除は低コスト）

## Summary

実装は module-architect の S1-S5 推奨を素直に取り込み、registry colocate / SDK narrowing 集約 / atomic write 抽出など architecture スコアは高い（8/10）。security も masking と 0600 enforcement で堅実（7/10）。

一方、core pipeline の **完了検知ロジックが spec と乖離**（H2）し、**state 並行更新のレースコンディション**（H1）を抱える。SSE fallback 経路に **未完了セッションを完了と誤判定**するバグの可能性（H3）が含まれ、いずれもサイレント障害の温床。test 49 件は通るが **must 22 件未実装**で、この種のバグを検出する pipeline 振る舞いテストが欠落（H4）。

correctness 5 / testing 4 を引き上げないと閾値（7.0）に到達しない。code-fixer による次回イテレーションでは pipeline.ts の race + completion ロジック + SSE 結果の枝分かれを優先し、テストを並行追加することを推奨する。
