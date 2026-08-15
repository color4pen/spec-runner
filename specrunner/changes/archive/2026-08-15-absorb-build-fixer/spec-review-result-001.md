# Spec Review Result: absorb-build-fixer

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### コード照合（request.md「現状コードの前提」を実コードで確認）

1. `src/core/pipeline/types.ts:290-293` — `VERIFICATION failed → BUILD_FIXER`、`BUILD_FIXER success → VERIFICATION` の存在 ✓
2. `src/core/pipeline/types.ts:347-350` — FAST 経路の同型遷移 ✓
3. `src/core/pipeline/types.ts:195-199` — `VERIFICATION_RETRIES_EXHAUSTED` ループ上限定義 ✓
4. `src/core/step/build-fixer.ts` — step 定義、`BUILD_FIXER_SYSTEM_PROMPT` 使用、`enrichContext` / `buildFailureSection` の実装 ✓
5. `src/prompts/build-fixer-system.ts` — 「機械的修正のみ・設計判断禁止」制約プロンプトの存在 ✓
6. `src/core/step/step-context-builder.ts:96` — `FIXER_STEP_NAMES.has(step.name)` による `resumeSessionId` 制御 ✓
7. `src/core/step/fixer-helpers.ts` — `FIXER_STEP_NAMES` に `BUILD_FIXER` が含まれること、`getPreviousSessionId` / `isFixerContinuation` の実装 ✓
8. `src/core/pipeline/reverification.ts` — `IMPL_CODE_MUTATOR_STEPS` に `BUILD_FIXER` が含まれること ✓
9. `src/core/resume/resolve-step.ts` — `resumePoint.step` の `allowed` 検証なし（`"build-fixer"` が `toStepName` にそのまま渡される）。D4 legacy alias が必須であることを確認 ✓
10. `src/core/pipeline/registry.ts` — `STANDARD_DESCRIPTOR.loopFixerPairs[VERIFICATION] = BUILD_FIXER`、`FAST_DESCRIPTOR.loopFixerPairs[VERIFICATION] = BUILD_FIXER` ✓
11. `src/core/step/implementer.ts` — conformance 再入ロジック（`getConformanceFixContext`）の存在。`verificationFailedLast` は未実装（T-01 で追加） ✓

### pipeline.ts 機構の詳細分析

12. `isFixer` 判定（pipeline.ts:252）: `Object.values(loopFixerPairs).includes(currentStep)` — D1 後は implementer が常に `isFixer=true` となり、初回 creator 実行時も `enterFixerStep` でカウンタ +1 される ✓
13. `newEpisode` リセット（pipeline.ts:522）: `bite-evidence → verification` では `newEpisode = (bite-evidence !== implementer) = true` → リセット発火。D2 の「初回 off-by-one 相殺」が STANDARD 非 exempt で機能することを確認 ✓
14. `newEpisode` 非リセット（pipeline.ts:522）: `implementer → verification`（verificationFailedLast 経路）では `newEpisode = (implementer !== implementer) = false` → リセット不発。回復サイクル毎に予算が積み上がり `VERIFICATION_RETRIES_EXHAUSTED` が発火する ✓
15. "Unpaired step → fixer episode reset"（pipeline.ts:539-544）: `design → implementer`、`conformance → implementer` では currentStep が `loopFixerPairs` キーでないため発火 → `resetFixerStep(implementer).resetLoopStep(verification)` → 初回/conformance 再入で fresh 予算 ✓
16. "Fixer exhaustion check"（pipeline.ts:573-584）: D1 後は `fixerNames` に `implementer` が入るため `verification → implementer` 遷移でも fixer exhaustion チェックが走る。リセット後 `getFixerIter(implementer) = 0` → 初回通過 ✓
17. "Approved verdict overturned by fixer budget"（pipeline.ts:431-495）: D1 後は `fixerNamesForReroute` に `implementer` が入る。全遷移表で `outcome="approved" → implementer` への遷移が存在しないため実際には発火しない ✓
18. `conformance approved → verification` の `newEpisode=true`（D1 後）: `newEpisode = (conformance !== implementer) = true` → リセット発火。conformance 再検証が fresh 予算で開始される（TC-007 の機構根拠） ✓

### spec.md vs request.md 受け入れ基準の対応確認

19. AC1「verification 失敗 → implementer 遷移（通常・chore）」← spec.md Requirement 1、Scenario 2 件 ✓
20. AC2「継続 session + 失敗内容 message」← spec.md Requirement 2、Scenario 1 件 ✓
21. AC3「sessionId 不在 → fresh fallback」← spec.md Requirement 3、Scenario 1 件 ✓
22. AC4「制約文言なし」← spec.md Requirement 4、Scenario 1 件 ✓
23. AC5「ループ上限維持（exhaustion 発火）」← spec.md Requirement 5（conformance 再検証 Scenario 含む）✓
24. AC6「既存 state 互換（fold / resume）」← spec.md Requirement 6、Scenario 2 件 ✓
25. AC7「遷移表テスト更新全列挙」← design.md テーブル A/B/C/D/E で全列挙・根拠付き ✓

### test-cases.md の構造確認

26. 20 TC のうち spec.md Scenario 対応（TC-001〜TC-009）と設計補完（TC-010〜TC-019）の分類が明確 ✓
27. TC-016（bite-evidence バイパス）が spec.md 由来でなく design.md D2 由来として明記 ✓
28. TC-020（typecheck && test green）が gate TC として明記 ✓

### design.md テスト更新全列挙テーブルの個別確認

29. `tests/anthropic-step-model-refresh.test.ts` が `BuildFixerStep` を import していることを実コードで確認（UPD 対象 ✓）
30. `tests/unit/core/pipeline/pipeline.loop-iter-stdout.test.ts` が文字列リテラルのみの自己完結フィクスチャで build-fixer を使用（NC 根拠確認 ✓）
31. `src/core/lifecycle/__tests__/exit-guard.test.ts` が `step: "build-fixer"` を state 文字列として使用するのみ（NC 根拠確認 ✓）
32. `kernel/step-names.ts` の `AgentStepName` bidirectional sync guard（schema/types.ts:47-49）が `BUILD_FIXER` 削除に対してコンパイルエラーを出すことを確認（typecheck で網羅される）✓

### FAST 経路の個別確認

33. `FAST_TRANSITIONS` の `IMPLEMENTER success → VERIFICATION`（単一行）が既存で存在 → D2 の追加行は FAST に不要（tasks.md T-01 の記述と一致）✓
34. `FAST_DESCRIPTOR.steps` に bite-evidence が含まれない ✓

### セキュリティ評価

35. `verificationContent`（verification-result.md の内容）は CLI ツール出力であり外部制御外。```ブロックで絶縁されており既存 build-fixer と同等リスク ✓
36. `resumeSessionId` は state から取得する内部 ID。外部入力でない ✓
37. legacy alias `"build-fixer" → IMPLEMENTER` は CLI 実行権限が前提。新たな攻撃面なし ✓
38. `GUARDED_WRITE_STEPS` に implementer が既存エントリとして含まれており、write-scope 機構は変更不要 ✓

### Risk 評価

39. R2（SDK session 再開不能）: build-fixer の既存挙動と同等範囲で本変更での新規回帰なし ✓
40. R3（enrichContext stale 結果）: `verificationFailedLast` 真の時のみ注入され、best-effort try/catch で不在時 no-op ✓

---

## 検証できなかった項目

1. **`bun run typecheck && bun run test` の実際の実行** — spec-review step は source code read-only。typecheck 成否はシンボル削除の網羅に依存
2. **`pipeline.reverification.test.ts` TC-003/TC-004 の全 assertion** — build-fixer を fixer として使う assertion の詳細を実行確認していない。design テーブルの UPD 指示が正確かは実装後に確認
3. **`resolvePairedReviewForFixer` が implementer の paired reviewer を `verification` と返すこと** — `pairedReviewers.length === 1` の単純ケースなので機構上正しいが、実際の呼び出しパスでの動作は実行確認が必要

---

## Findings 詳細

### Finding 1: STANDARD 非 exempt 初回 off-by-one — chore / FAST で回復試行が 1 回少なくなる

**severity**: medium  
**resolution**: decision-needed  
**file**: specrunner/changes/absorb-build-fixer/design.md

`loopFixerPairs[VERIFICATION] = IMPLEMENTER` により implementer が `isFixer=true` となり、初回 creator 実行でも `enterFixerStep` でカウンタが +1 される。

- **STANDARD 非 exempt**: bite-evidence → verification の `newEpisode=true` リセットが +1 を打ち消す → build-fixer 時代と bit-exact ✓
- **STANDARD exempt / FAST**: bite-evidence を経由しないため +1 が残り、exhaust が 1 回早まる

design.md が Risk R1 として明示し「歯は発火し続けるため許容」と記載済み。TC-006 exhaustion テストも「発火」固定で回数非依存の方針。

**options**:
- **Accept (推奨)**: design.md R1 の通り許容。TC-006 が「発火する」を固定すれば十分
- **Fix**: FAST/exempt 経路でも fixer カウンタのリセット機構を追加（コード複雑度 vs. 試行回数 exact 一致のトレードオフ）

---

### Finding 2: D1 後に "Approved verdict overturned" ブロックが implementer を対象とするが設計文書未記載

**severity**: low  
**resolution**: fixable  
**file**: specrunner/changes/absorb-build-fixer/design.md

D1 後、`Object.values(loopFixerPairs)` に `implementer` が入るため、pipeline.ts の T-03 ブロック（行 431-495）の `fixerNamesForReroute` にも `implementer` が含まれる。

全遷移表（STANDARD / FAST）に `outcome="approved" → implementer` への遷移が存在しないため、このブロックは implementer に対して実際には発火しない。しかし design.md がこの副作用に触れていないため、実装者が混乱する可能性がある。

**options**:
- **Add note (推奨)**: design.md D1 に「"Approved verdict overturned" ブロックの対象になるが、approved→implementer 遷移が存在しないため実質 no-op」と一文追記
- **Skip**: typecheck + 既存テストで間接的に担保されるため追記不要とみなす

---

### Finding 3: T-05 legacy alias の `from` 経路での適用順序が tasks.md で明示されていない

**severity**: low  
**resolution**: fixable  
**file**: specrunner/changes/absorb-build-fixer/tasks.md

resolve-step.ts の `from` 処理では alias を `allowed.has()` の**前**に適用する必要がある（`mapMemberToCoordinator` と同じ位置）。design.md は「同じ場所・同じパターン」と記述しているが、tasks.md T-05 の AC に適用順序の明記がない。

TC-009 が `resolveResumeStep("build-fixer", ...) → "implementer"` を単体テストで固定するため、実装ミスはテストで検出される。

**options**:
- **Add note to T-05**: 「LEGACY_STEP_ALIASES の適用は `allowed.has()` 検証より前（`mapMemberToCoordinator` と同じ位置）」と一文追記
- **Accept**: TC-009 で検出されるため追記不要

---

### Finding 4: IMPL_CODE_MUTATOR_STEPS から BUILD_FIXER 削除後、legacy state の `reverificationNeeded` 評価が変わる

**severity**: low  
**resolution**: decision-needed  
**file**: specrunner/changes/absorb-build-fixer/design.md

`IMPL_CODE_MUTATOR_STEPS` から `BUILD_FIXER` を削除すると、旧 job state で「build-fixer が最後のコード変更者」のケースを `codeChangedSinceLastVerification` が検出できなくなる。

実運用上このシナリオは発生困難（build-fixer は常に verification 成功後に次ステップへ進み、halt する場合は D4 legacy alias → implementer が代わりに実行される）。design.md の "Migration Plan" はこの特定ケースに触れていない。

**options**:
- **Accept (推奨)**: 実運用上発生困難であり、legacy alias + 後続 implementer 実行で自然に解決される
- **Add note**: design.md D4 の互換説明に当該ケースの分析を追記
