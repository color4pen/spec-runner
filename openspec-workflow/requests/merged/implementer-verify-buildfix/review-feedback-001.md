## Code Review Result

**Verdict**: needs-fix
**Score**: 7.20 / 10.0 (pass threshold: 7.0)
**Iteration**: 1/2
**Trend**: — (initial iteration)

承認阻止条件: HIGH 1 件存在のため verdict は automatically `needs-fix`（review-standards.md）。Total スコアは pass threshold を超えているが、HIGH の解消が必要。

### Scores

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| correctness | 6 | 0.30 | 1.80 |
| security | 8 | 0.25 | 2.00 |
| architecture | 8 | 0.15 | 1.20 |
| performance | 7 | 0.10 | 0.70 |
| maintainability | 7 | 0.10 | 0.70 |
| testing | 8 | 0.10 | 0.80 |
| **Total** | | | **7.20** |

### Verification Summary

| Phase | Result | Details |
|-------|--------|---------|
| Build | PASS | tsc emit OK |
| Type Check | PASS | 0 errors |
| Lint | SKIP | no lint script in package.json |
| Tests | PASS | 365/365 passed (47 test files) |
| Security | PASS | bun audit: 0 vulnerabilities; no leaked secrets |

**Overall**: READY
**test_count**: 365 (passed: 365, failed: 0)

### Consolidated Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | HIGH | correctness | src/core/step/build-fixer.ts:55-70 + src/core/step/executor.ts:541 | `BuildFixerStep.buildMessage` mutates `state.status = "failed"` and `state.error` when verification 結果が不在の場合に。`Step.buildMessage` インターフェース（types.ts:53）は "Pure function — no I/O allowed" を宣言しており、契約違反。さらに executor は `buildMessage` 後に `state.status` を確認しないため、Anthropic session を作成してメッセージを送信した後、line 724 で `store.update(state, { status: "success" })` が失敗ステータスを上書きする。結果として `BUILD_FIXER_NO_VERIFICATION_RESULT` エラーは silent に飲まれ、verification 不在のまま build-fixer session が無駄に消費される。`tests/unit/step/build-fixer.test.ts:131-138` は state.error が設定されることのみ確認しており、pipeline halt は検証していない。 | (a) `BuildFixerStep.buildMessage` で state を変更せず、verification 不在時は throw するか sentinel string を返す。(b) `runPollingStyleStep` で `buildMessage` 直後に `state.status === "failed"` をチェックし、失敗時は session を作らず `attachStateAndRethrow` する。(c) 統合テストで「verification 不在 → pipeline halt（session create が呼ばれない）」を検証する。最も簡潔な fix は (a) で `BUILD_FIXER_NO_VERIFICATION_RESULT` を throw する純粋関数化。 |
| 2 | MEDIUM | consistency | src/core/pipeline/types.ts:37 vs src/core/verification/runner.ts:220 | `LOOP_ERROR_CODES["verification"].hint` が `verification-result-<NNN>.md` を案内するが、`runVerification` は `openspec/changes/<slug>/verification-result.md`（連番なし、毎回上書き）に書き出す。hint message が実在しないファイル名を指す。spec-review iter 2 の MEDIUM #1 として既に指摘されていたが未対応で持ち越し。build-fixer cycle で iteration 履歴も失われる。 | 統一する。推奨: (a) `runVerification` を iteration 連番付きファイル（`verification-result-001.md` 等）に変更し、build-fixer が前回失敗ログを参照できるようにする。または (b) hint を `verification-result.md`（連番なし）に修正し、上書き仕様を verification-runner spec に明示する。 |
| 3 | MEDIUM | correctness | src/core/verification/runner.ts:95 | `writeVerificationResult` が `const iterNum = 1` をハードコード。3 回 build-fixer が走っても title は常に "iter 1" と表示される。さらにファイル名も連番化されていないため、value 自体がコメント通り "placeholder" のまま使われていない。 | iteration 番号を caller（VerificationStep.run）から渡す。state.steps?.["verification"]?.length + 1 で計算可能。ファイル名連番化（Finding #2）と一緒に修正するのが自然。 |
| 4 | MEDIUM | maintainability | src/core/step/executor.ts:733-741 | `getTimeoutMs` に `if (stepName === "spec-review")` / `if (stepName === "spec-fixer")` の hardcode が残存。`tests/grep-no-step-name-hardcode.test.ts` の正規表現は `step.name === "..."` パターンのみマッチするため検出不可。新規 step（implementer / build-fixer）は silent に 600_000 ms default にフォールバック。progress.md に「implementer 1回目 timeout」と記録されており、step 別タイムアウト設定が機能要件として必要。 | (a) `LOOP_ERROR_CODES` と同様に `STEP_TIMEOUTS: Record<string, number>` lookup table を `pipeline/types.ts` に追加し、`getAgentId` 経由で config からも参照可能にする。(b) もしくは AgentStep に `timeoutMs?: number` フィールドを追加して step が自分で宣言する。(c) grep test を `(stepName|step\.name) === "<step-name>"` で hardcode 全般を catch するよう拡張。 |
| 5 | MEDIUM | security | src/core/verification/runner.ts:153-193 + package.json | self-hosted の package.json に `security` script が存在しないため、security phase は silent に `status: "skipped"` で記録されるが、verdict は `passed` のまま。「5 phase 検証」を謳うシステムにおいて security 検証が実行されていない事実が verification-result.md の細部を読まないと判らない。verification phase の verdict 集計ロジック（line 196-210）は「all skipped → failed」のみカバーで、partial skip は警告すらない。 | (a) phase 単位で「required vs optional」を `phases.ts` で宣言し、required phase の skip を verdict failed に算入する。(b) もしくは verdict を `passed` のまま許容するが、verification-result.md の Verdict セクション直下に "Skipped phases: security" の警告サマリを必須出力する。最低限 (b) は実装すべき。 |
| 6 | LOW | performance | src/core/verification/runner.ts:60-68 | `spawnScript` の stdout/stderr 蓄積に size limit がない。長時間ループする build script で OOM の可能性。 | 上限（例: 1MB）を設けて超過時は head/tail を残してトリミング。既存 PR の主スコープ外なので follow-up でも可。 |
| 7 | LOW | maintainability | src/core/step/executor.ts:680-691 | `specReviewResultNotFoundError` を polling-style 全 step で throw しているが、エラーコードは `SPEC_REVIEW_RESULT_NOT_FOUND`（spec-review 専用名）。implementer / build-fixer は `resultFilePath` が常に null なので現状は dead code だが、将来の step 追加時に誤解を招く。 | エラーコードを generic な `STEP_RESULT_FILE_NOT_FOUND` にリネーム、または step 名を payload に含める。dead code 除去でも可。 |
| 8 | LOW | maintainability | src/core/step/executor.ts:670-678 | iteration 計算と `buildFindingsPath` 利用が `spec-review` 前提のまま polling-style 全 step に流用されている。`step.resultFilePath()` の戻り値を信用せず executor 側で path を再構築している（DRY 違反 + step 抽象の漏れ）。 | `step.resultFilePath()` の戻り値を直接 fetch path に使う。spec-review 専用の `buildFindingsPath` 依存を断つ。 |
| 9 | LOW | architecture | src/core/pipeline/pipeline.ts:284-295 | `getStepOutcome` の completionVerdict fallback ロジック（spec-fixer は "approved" legacy default、propose は "success" 特殊分岐）が暗黙。新規 step が verdict を返さない場合の挙動が「completionVerdict 未設定」と「completionVerdict 設定済み」で枝分かれする。 | spec-fixer にも `completionVerdict: "approved"` を明示宣言し、legacy fallback を削除。propose にも `completionVerdict: "success"` を宣言し、`stepName === "propose"` 分岐を削除。 |
| 10 | LOW | testing | tests/unit/step/build-fixer.test.ts:125-147 | TC-016 が「state.error が設定される」ことのみ検証。Finding #1 の HIGH バグの存在を許す程度の薄い検証。pipeline halt（session create がスキップされる、status: success が overwrite されない）のシナリオが欠落。 | 統合テストで「verification 不在 → buildMessage 後 session create されず pipeline 停止」を検証。fix 後の regression 防止になる。 |
| 11 | LOW | consistency | acceptance criteria | 13.2 / 13.3 / 13.5 / 13.6 が未実施（progress.md に「ADR は Step 7a で実施」と記録）。本 PR スコープ内ではなく workflow 後段で対応予定だが、追跡可能性のため記録。 | 別 step で完了確認。本レビューは 13.1 (regression 0) と 13.4 (module-analysis) のみ確認済み。 |

### Iteration Comparison

初回 iteration のため Improvements / Regressions / Unchanged Issues なし。

ただし spec-review iter 2 の Findings との関係は以下:

- **iter 2 MEDIUM #1**（hint 命名揺れ）→ 本レビューの Finding #2 として実装段階で再浮上。spec 段階で MEDIUM 留めにしたが、コード化により hint message が実在しないファイル名を指す具体的な不整合になった。
- **iter 2 LOW #2**（build-fixer prompt の "failed phase のみ" 絞り込み）→ 未対応で持ち越し（本レビューでは別軸の Finding として独立指摘せず）。
- **iter 2 LOW #3**（registry.list() 順序）→ 未対応で持ち越し（本レビューでは指摘なし — 本 PR の動作に直接影響しないため）。

### Summary

- **総合所見**: アーキテクチャ refactor（kind discriminator、NULL_PARSE_RESULT、LOOP_ERROR_CODES、PHASE_SCRIPTS の単一定義パターン）は spec-review iter 2 の改善が忠実に実装され、構造的にも整合している。`bun:* / Bun.*` 禁止の grep test、step 名 hardcode 禁止の grep test など regression 防止のための test 自体も充実。
- **主要な指摘事項のハイライト**: HIGH 1 件は `BuildFixerStep.buildMessage` の state mutation + executor の状態未確認による silent error swallow。`Step.buildMessage` の Pure function 契約違反であり、production で verification 結果不在シナリオに遭遇すると Anthropic session を無駄に消費した上に "success" 報告される実害がある。MEDIUM 4 件は実装段階で spec の曖昧さがコードに固着した結果（hint 命名揺れ、iteration 番号 hardcode、step 別 timeout 未対応、security phase silent skip）。
- **収束トレンド**: 初回 iteration のため判定不可。HIGH を fix した上で iteration 2 を待つ。
