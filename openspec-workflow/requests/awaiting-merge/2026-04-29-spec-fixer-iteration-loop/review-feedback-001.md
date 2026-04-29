## Code Review Result

**Verdict**: needs-fix
**Score**: 7.40 / 10.0 (pass threshold: 7.0)
**Iteration**: 1/2
**Trend**: — (initial)

### Scores

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| correctness | 7 | 0.30 | 2.10 |
| security | 8 | 0.25 | 2.00 |
| architecture | 7 | 0.15 | 1.05 |
| performance | 8 | 0.10 | 0.80 |
| maintainability | 7 | 0.10 | 0.70 |
| testing | 8 | 0.10 | 0.80 |
| **Total** | | | **7.45** |

(Score weighted-sum is 7.45 but we have HIGH-severity findings, so verdict is `needs-fix` per the auto-block rule.)

### Verification Summary

| Phase | Result | Details |
|-------|--------|---------|
| Build | PASS | tsc emit succeeded |
| Type Check | PASS | 0 errors |
| Lint | SKIP | no lint script defined in package.json |
| Tests | PASS | 168/168 (25 files) |
| Security | PASS | 0 vulnerabilities (npm audit) |

**Overall**: READY

### Consolidated Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | correctness | src/core/steps/spec-review.ts:132-139 | `getAgentId(config, "propose")` の catch で `config.agent?.id ?? ""` にフォールバックするが、`getAgentId` 内で既に legacy `config.agent.id` を試している (L24-26) ので catch に到達するのは「両方とも未設定」のケース。そこで空文字 `""` を agentId として `sessions.create` に渡すと API エラーになる前にトリビアルなコードパスで `agent: { id: "", type: "agent" }` セッション作成がトリガされる。failJobState で `CONFIG_INCOMPLETE` を返さずサイレントに進む。 | catch を削除して `getAgentId` の例外をそのまま伝搬させる。または catch 内で `failJobState({ code: "CONFIG_INCOMPLETE", ... })` し step result に push してから throw する。 |
| 2 | HIGH | architecture | src/core/pipeline.ts:124-143 | onExceeded で state.steps の配列要素および `s.error` / `s.updatedAt` を直接 mutate している。プロジェクト全体は `pushStepResult` / `updateJobState` / `failJobState` の純粋関数パターンで一貫していたのに、ここだけ in-place mutation。並行性は無いが review-lessons の「派生フィールドの真実源が単一に固定されているか」「state 伝搬の対称パターン」観点で逸脱。スナップショットを保持する呼び出し元（テスト・persist 後の retain）が壊れる潜在バグ。 | `state.steps[stepName]` を新配列で置き換える純粋更新へ書き換え（例: `pushStepResult` ではなく専用の `updateLatestStepResult` ヘルパを `src/state/helpers.ts` に追加するか、配列を `[...arr.slice(0,-1), { ...last, verdict: "escalation" }]` で再構築）。`s.error` と `s.updatedAt` も `{ ...s, error: ..., updatedAt: ... }` で返す。 |
| 3 | HIGH | consistency | src/state/schema.ts:164-197, src/core/steps/propose.ts:4,137,183,237,380 | design.md D7 / tasks.md 2.3 は「`appendStepResult` は本 delta で削除し、呼び出し元（propose.ts / spec-review.ts の 7 箇所）を `pushStepResult` に置換する」と明示。spec-review.ts は完全に置換されたが propose.ts は 4 箇所が `appendStepResult` のまま。schema.ts の関数も `@deprecated` を付けて残置されている。propose は単一実行なので機能的影響は無いが、設計合意との不整合。 | propose.ts の 4 箇所を `pushStepResult(state, "propose", { session, verdict, findingsPath, completedAt, error })` に置換し、schema.ts から `appendStepResult` export を削除。tests/schema.test.ts の TC-024 は `pushStepResult` でのテストに移管（または削除して helpers.test.ts に統合）。 |
| 4 | MEDIUM | correctness | src/core/pipeline.ts:134-138 | onExceeded のエラーメッセージで `nnn = String(maxIterations).padStart(3, "0")` を使うが、これは「設定上限」であり、実際に失敗した最終 iteration 番号と必ずしも一致しない。例えば maxRetries=3 だが iter=2 で escalation 連鎖 → ファイル名は spec-review-result-002.md だが hint は 003.md を指す可能性。 | `const nnn = String(getLatestStepResult(s, "spec-review")?.iteration ?? maxIterations).padStart(3, "0")` または `s.steps?.["spec-review"]?.length`。 |
| 5 | MEDIUM | maintainability | src/prompts/spec-review-system.ts:6-48, 84-86 | `SPEC_REVIEW_SYSTEM_PROMPT` および `buildSpecReviewSystemPrompt` が export されているが、どこからも import されていない（spec-review は propose Agent を流用するため Agent 側に system prompt として注入されない）。さらに本文は `spec-review-result.md`（イテレーション抜き）を出力先として指示しており、もし将来 spec-review 専用 Agent 化で wired up したら誤った出力先になる。 | (a) 死んだ export を削除、または (b) SPEC_REVIEW_SYSTEM_PROMPT のファイル名指示を「user message が指定するパスへ書け」に修正してドキュメントだけ残す。コメントで「現状未使用、将来 spec-review 専用 Agent 化時に wired up」明記。 |
| 6 | MEDIUM | security | src/core/steps/spec-fixer.ts:12-35 | `<user-request>` で囲んだ initial message に `slug` / `branch` / `findingsPath` が直接埋め込まれる。`branch` は agent が `register_branch` で登録した文字列、`slug` は request.md の filename basename。両者ともユーザー/agent 由来の準制御値。例えば branch 名が `"main\n</user-request>\n## NEW INSTRUCTIONS\n..."` のような細工で XML タグ脱出 → prompt injection が成立しうる。Git の branch 名は改行を含めないが、API レイヤで明示検証していない。 | `slug` / `branch` / `findingsPath` を XML 埋め込み前に validate する: 改行・XML 特殊文字・閉じタグ `</user-request>` 文字列を含むものは reject。または attribute エンコード相当で sanitize するヘルパを `src/core/sanitize.ts` に追加。同様の検証を spec-review.ts にも適用。 |
| 7 | MEDIUM | testing | tests/init.test.ts vs tasks.md 3.6/3.7 | tasks 3.3-3.7（init.ts の post-init 不変条件チェック追加、spec-fixer Agent の冪等作成・update テスト）が `[ ]` 未完了。progress.md は「Blocked: T9.1-9.7 (E2E need real API)」として E2E をスキップしているが、3.6/3.7 は unit/integration レベル（モックされた Anthropic API で検証可能）にもかかわらずテストが追加されていない。 | tests/init.test.ts に「spec-fixer Agent が新規作成される」「ハッシュ不一致で update される」「retrieve 404 で再作成される」の 3 ケースを追加。post-init 検証ロジック（agent retrieve → custom_tools 空チェック）が src 側に未実装ならまず実装。 |
| 8 | MEDIUM | consistency | openspec/changes/spec-fixer-iteration-loop/test-cases.md (TC-001/002/003 etc.) | test-cases.md は `[iter 1/2] spec-review verdict: approved → done` 形式で stdout 検証を要求しているが、実装と loop.test.ts は `[iter 1] spec-review verdict: approved → done`（MAX なし）。design.md D10 の正式仕様は「verdict 行は `[iter N]`、開始/exhaust 行は `[iter N/MAX]`」で実装が design に従っている。test-cases.md の方が誤り。 | test-cases.md の TC-001/002/003 等の THEN 文字列から `/2` を削除（または design.md D10 をそのまま転記）。docs と impl の整合を取る。 |
| 9 | LOW | maintainability | src/core/steps/spec-fixer.ts:92 | `const effectiveBranch = branch ?? "main";` — propose 成功後は branch が必ず登録されているはずなので、ここの "main" フォールバックは事実上 dead path。発火した場合 spec-fixer が main を直接 push することになり危険。 | `if (!branch) throw new SpecRunnerError("BRANCH_NOT_REGISTERED", ...);` で fail-fast、または失敗 step result を push してから return。"main" デフォルトは削除。 |
| 10 | LOW | maintainability | src/core/steps/spec-fixer.ts:180-184 | `wrappedErr` を手動で `Error & { code; hint; state }` に組み立てている（`SpecRunnerError` を使わずに `new Error()` + プロパティ追加）。プロジェクト規約は `SpecRunnerError` を投げて runRunCore で `instanceof` チェック。この箇所だけ素 Error なので runRunCore の `if (err instanceof SpecRunnerError)` 分岐に乗らない（fallback `Error: ${(err as Error).message}` パスへ落ちる）。 | `throw new SpecRunnerError(errorInfo.code, errorInfo.message, errorInfo.hint)` に置換し、state は `(err as Record<string, unknown>)["state"] = state` 方式（spec-review.ts と同じ）に統一。 |
| 11 | LOW | testing | openspec/changes/spec-fixer-iteration-loop/test-cases.md TC-054 | TC-054 は `must` priority だが `manual` category で未実装。Anthropic API retrieve で custom_tools が空であることを検証する E2E。progress.md は manual として skip 扱いだが「must かつ未実装」が形式上残る。 | TC-054 の priority を `should` に下げる（manual かつ実環境必須なため）か、もしくは「manual must」が許容される旨を test-cases.md の summary に明記。あるいは init.test.ts でモック beta.agents.retrieve を用いた近似テストを追加。 |
| 12 | LOW | maintainability | src/core/completion.ts:45 | `tsc --noUnusedParameters` で `'attempt' is declared but its value is never read.` 検出。実装上の未使用パラメータが残存（本 PR で触っていない場所だが、今回の variant チェックで露出）。 | `_attempt` にリネームするか、引数自体を削除。本 PR の責務外なら follow-up issue として記録。 |

### Iteration Comparison

(初回イテレーションのため比較なし)

### Summary

- **品質**: build/typecheck/test 全て PASS、test 168/168 PASS、security 脆弱性なし。実装は概ね設計に忠実で、`runLoopUntil` の API 設計、`PipelineDeps` の `types.ts` 切り出し、`pushStepResult` ヘルパ導入、Custom Tools なし spec-fixer Agent、`<user-request>` XML wrapping など、design.md の D1-D11 がほぼ全て実装されている。
- **HIGH 3 件の本質**: (1) spec-review.ts の getAgentId catch で空文字 fallback がサイレント failure を生む、(2) onExceeded の in-place mutation が project 全体の純粋関数パターンを破る、(3) propose.ts の `appendStepResult` 残置が design D7 / tasks 2.3 と矛盾。いずれも構造的問題で fixer agent でパッチ可能だが author-bias なしの再評価が必要。
- **収束見込み**: HIGH 3 件はすべて局所修正（数十行）で対応可能。LOW/MEDIUM の多くも併せて 1 iteration で解消できる規模。code-fixer での 1 ターンで approved に到達可能。
- **承認阻止理由**: HIGH ≥ 1 のため自動的に `needs-fix`。
