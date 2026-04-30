# Review Feedback: review-exit-contract — Iteration 1

## Code Review Result

- **verdict**: needs-fix
- **score**: 7.20 / 10.0 (pass threshold: 7.0)
- **iteration**: 1 / 2
- **trend**: — (initial)
- **agents**: code-reviewer (orchestrator-integrated, subagent dispatch unavailable in env), pattern-reviewer (enabled), security-reviewer (skipped — `enabled-absent` per pipeline-context.md)
- **blocking_findings**: CRITICAL: 0, HIGH: 1

> Note: 本 iteration は `code-review` skill の Task ツール（subagent dispatch）が当環境で利用不能だったため、orchestrator が code-reviewer / pattern-reviewer の 2 観点を統合的に評価した。security-reviewer は pipeline-context.md `enabled` に含まれず skip。

## Scores

| Category | Score (1-10) | Weight | Weighted |
|----------|-------------|--------|----------|
| correctness | 6 | 0.30 | 1.80 |
| security | 8 | 0.25 | 2.00 |
| architecture | 8 | 0.15 | 1.20 |
| performance | 8 | 0.10 | 0.80 |
| maintainability | 7 | 0.10 | 0.70 |
| testing | 7 | 0.10 | 0.70 |
| **Total** | | | **7.20** |

### スコアリング基準

| Score | 意味 |
|-------|------|
| 1-3 | 重大な問題あり。本番に出せない |
| 4-5 | 動くが品質不足。レビューで必ず指摘される |
| 6 | 最低限の品質。改善余地が多い |
| 7 | 良好。プロダクション品質（承認閾値） |
| 8 | 優良。丁寧な実装 |
| 9-10 | 卓越。模範的なコード |

> 補足: pass_threshold 7.0 を加重合計は超えているが、HIGH severity finding が 1 件存在するため verdict は `needs-fix`（review-standards.md の承認阻止条件: CRITICAL ≥ 1 または HIGH ≥ 1）。

## Verification Summary

| Phase | Result | Detail |
|-------|--------|--------|
| Build | PASS | `tsc --outDir dist` 成功 (Step 5b 確認済み) |
| Type Check | PASS | `bun run typecheck` 0 errors |
| Lint | SKIP | プロジェクトに lint script 未設定（package.json 参照） |
| Tests | PASS | `bun run test` (vitest) 529 / 529 passed, 58 files |
| Security | PASS | scope-out（security-reviewer not enabled） |

## Consolidated Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | correctness | src/core/step/executor.ts:709-714 | `iteration = existingResults.length` だが、コメントは "number of existing results + 1" と宣言。実際の挙動は **N-1**（agent が実際に書こうとした iteration より 1 少ない）。iteration 1 で fail したケースでは、`length=0` のため hint は `spec-review-result-000.md` を表示する — 本 request が直そうとしていた症状 2（hint と実態の divergence）が executor 側で再発している。`computeSpecReviewIteration` / `computeCodeReviewIteration` が `length + 1` を採用している事実とも矛盾。 | `const iteration = existingResults.length + 1;` に修正。または `step.resultFilePath` から逆算して agent が書くはずだった iteration をそのまま使う実装に変える（DRY 化）。後者なら計算ロジックが Step 内に閉じる。 |
| 2 | MEDIUM | correctness | src/core/step/code-review.ts:100 | `branch: state.branch ?? deps.slug` — slug は branch ではない（例: slug=`review-exit-contract`、branch=`change/review-exit-contract`）。`state.branch` が null のとき `buildGitPushInstruction` に slug を渡してしまい、agent に存在しない branch への push を指示する。`spec-review.ts:80` は `state.branch ?? undefined` で正しい既定動作を取っているため対称性も崩れている。 | `state.branch ?? undefined` に統一。`buildCodeReviewInitialMessage` 側で `branch` が undefined の場合の fallback（spec-review と同じ「After writing... commit and push to the branch before ending your session.」相当文）を持つか、もしくは `state.branch` の事前 guard（branchNotSetError 等）に依存する設計を明示。 |
| 3 | MEDIUM | testing | tests/unit/step/review-exit-contract.test.ts (TC-008/TC-009) | round-trip invariant test は `resultFilePath` ↔ `buildMessage` の 2 軸のみを比較しており、第 3 軸である **executor の error-hint iteration 計算**を検証していない。Finding #1 の off-by-one が当該 test で catch されない。spec.md の Requirement「3 layer divergence の解消」に対し、executor 層のテストカバレッジが不足。 | executor の `getRawFile` 失敗パスをモックし、`specReviewResultNotFoundError` / `codeReviewResultNotFoundError` に渡される iteration が agent が書こうとした iteration（= `resultFilePath` の suffix と同じ）と一致することを assert する unit test を追加。最小例: `existingResults.length=0` のとき hint に `-001.md` が現れる、`length=1` のとき `-002.md` が現れる。 |
| 4 | LOW | consistency | src/core/step/code-review.ts:100 vs src/core/step/spec-review.ts:80 | 同等の意味をもつコードで `?? deps.slug`（code-review）と `?? undefined`（spec-review）が散らばっている。grep / 後任 reader が「なぜ両者で違うのか」を判断できない。 | Finding #2 の修正で自然解消。両方を `?? undefined` に揃え、`state.branch === null` 時の挙動を一箇所のドキュメント（または事前 guard）に集約。 |
| 5 | LOW | maintainability | src/core/step/executor.ts:709 | コメント "Compute iteration for error hint: number of existing results + 1" が実装と矛盾（"+1" が無い）。Finding #1 が解消されればコメントが正解になる、または逆にコメントを実装に合わせる必要がある。 | Finding #1 を「`+ 1` を追加」で修正すれば自動解消。コメント単独の修正は本質を見逃すので非推奨。 |
| 6 | LOW | testing | openspec/changes/review-exit-contract/test-cases.md (TC-019/TC-020/TC-021/TC-022) | E2E 系（agent push 検証 / source code 不変検証 / dogfooding 完走）が manual / post-merge に deferred。本 request の根本目的（dogfooding-001 の再発防止）は dogfooding を通さない限り検証完了しない。code-review skill の verdict には影響しない（progress.md で意図的に deferred と記録あり）が、testing スコアに反映。 | （非ブロッカー）archive 後の dogfooding-002 で TC-019/TC-021 の通過を必ず確認し、その結果を request の follow-up または `learned-patterns` に記録する運用を tasks.md / progress.md で明文化する。 |

## Iteration Comparison

（iteration 1 のため Improvements / Regressions / Unchanged は無し）

## Score Progression

| Iteration | Total Score | Verdict | Key Changes |
|-----------|-----------|---------|-------------|
| 1 | 7.20 | needs-fix | initial review — HIGH 1 (executor off-by-one), MEDIUM 2 (branch fallback / round-trip test gap), LOW 3 |

## Convergence

- **trend**: — (initial)
- **recommendation**: needs-fix → code-fixer に Finding #1 / #2 / #3 を渡して iteration 2 へ

## Summary

本 change は dogfooding-001 で発生した「review 系 step の 3 層 divergence」（capability / prompt / error hint）を構造的に解消する spec-change で、ADR・delta spec・38 件の追加 unit test を含み骨格としてはクリーンに仕上がっている。spec-review の system prompt への commit/push/end_turn-delay 指示追加、code-review の `gitWrite: true` への切替、`codeReviewResultNotFoundError` の新設と iteration 引数化、implementer prompt の workflow context 追記はいずれも request.md / spec.md の MUST 要求と整合する。

しかし、**まさに本 request が直そうとした「hint の filename suffix 計算が agent が書く filename と divergence する」問題が executor 側に残存している（Finding #1）**。`executor.ts:711` で `iteration = existingResults.length` としているが、agent が書こうとした iteration は `length + 1`（`computeSpecReviewIteration` / `computeCodeReviewIteration` の値と一致させるべき）。コメント側は "+1" と書いてあるため、実装の単純なバグであり、修正は 1 行。ただし TC-008/009 の round-trip 検証が `resultFilePath` ↔ `buildMessage` の 2 軸に閉じており、executor の hint 経路を含まないため当該バグを catch できていない（Finding #3）。修正と同時に該当 unit test の追加が必須。

副次的に `code-review.ts:100` の `state.branch ?? deps.slug` フォールバックが意味的に誤っており、`spec-review.ts` 側の `?? undefined` と非対称（Finding #2 / #4）。`state.branch` が null のとき agent に slug 文字列を branch として push 指示してしまう risk があるため修正推奨。

verification は 529 / 529 PASS、typecheck clean、build PASS で品質ゲート自体は通過しているが、HIGH 1 件があるため verdict は **needs-fix**。code-fixer で Finding #1 の executor 修正と Finding #3 の executor unit test 追加（および Finding #2 の branch fallback 修正）を行えば、iteration 2 で approved 想定。
