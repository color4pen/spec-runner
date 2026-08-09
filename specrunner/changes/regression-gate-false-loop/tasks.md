# Tasks: regression-gate を新規退行の検出に限定する

## T-01: LOW 除外を routing 層 1 箇所に集約し、code-fixer prompt の severity 再フィルタを撤去する

- [ ] `src/core/step/judge-verdict.ts` に severity policy 関数を新設する:
      `selectFixerTargetFindings(findings: Finding[]): Finding[]` = fixable かつ severity ≠ `"low"`
      （既存 `collectFixableFindings` を内部で流用してよい）。LOW 除外を表現する唯一の箇所とする。
- [ ] `src/core/step/routed-findings.ts:113`（Branch 3, active reviewer path）の
      `collectFixableFindings(allFindings)` を `selectFixerTargetFindings(allFindings)` に差し替える。
      import を `judge-verdict.js` から追加する。
- [ ] `src/core/step/code-fixer.ts` の standard path（`buildMessage` 内、`getLatestJudgeFindings(state, activeReviewer)`
      を使う分岐, `:241` 付近）で、code-fixer に見せる findings を `selectFixerTargetFindings` で絞る。
      継続 prompt（`buildContinuationMessage` への `findings` 引数）にも同じ絞り込み後の集合を渡す。
      null/undefined は空配列として扱う。
- [ ] `src/core/step/code-fixer.ts` の prompt 全 5 変種から `Ignore LOW severity findings` の行を削除する
      （`:151, :194, :221, :272, :293`）。周囲の番号付きリストの番号を繰り上げて整合させる。
      残す指示（`Fix all HIGH and CRITICAL ...` / `Fix MEDIUM ... only if they do not require design changes`）は変更しない。
- [ ] coordinator path（`collectParallelFixerFindings`）と conformance path（`getConformanceFixContext`）の
      finding 集合には severity 絞り込みを **適用しない**（design D2 の scope 限定）。これらの変種は
      `Ignore LOW` 行の削除のみ行う。
- [ ] legacy findingsPath フォールバックパス（`buildMessage` 末尾, `:282-300`）は、findings が
      非構造化ファイル経由のため `selectFixerTargetFindings`（`Finding[]` を受け取る純関数）の
      **適用対象外**とする。変更は `Ignore LOW severity findings` 行（`:293`）の削除のみ。
      このパスは旧形式 job の resume 専用で低頻度のため、LOW の明示除外なしの動作を許容する。

**Acceptance Criteria**:
- `selectFixerTargetFindings([{low,fixable},{high,fixable},{low,decision-needed}])` が `high,fixable` のみを返す。
- `grep -rn "Ignore LOW severity" src/` が 0 件。
- `collectRoutedFixerFindings`（Branch 3）が severity `low` の fixable finding を返さない。
- `typecheck` が通る。既存 `routed-findings.test.ts` が無改変で green。

## T-02: regression-gate の verdict 判定層で既知未修正 finding を fingerprint 照合により除外する

- [ ] `src/core/pipeline/findings-ledger.ts` に fingerprint ヘルパ
      `findingFingerprint(f: Finding): string` = `${f.file}|${f.line ?? ""}|${f.title}` を新設し
      export する（`dedupeFindings` の既存 key と同一。`dedupeFindings` もこのヘルパを使うよう置き換えて
      drift を防いでよい）。
- [ ] `src/core/pipeline/findings-ledger.ts` に純関数を新設する:
  - `computeRegressionLedger(reviewerChain: string[], state, canonScope?): Finding[]` —
    `collectSpecReviewLedger(state, canonScope)` と
    `collectFindingsLedger(reviewerChain, state, canonScope)` を `dedupeFindings` で合成した
    ledger を返す（`regression-gate.ts` の skipWhen/buildMessage と同じ合成。共有により drift を防ぐ。
    可能なら `regression-gate.ts` の 2 箇所もこの関数を呼ぶよう置き換える）。
    **シグネチャ注意**: `deriveImplReviewerChain` を内部で呼ばず、呼び出し元から reviewerChain を
    受け取る。理由: `findings-ledger.ts` が `reviewer-chain.ts` を import すると
    `findings-ledger.ts` → `reviewer-chain.ts` → `regression-gate.ts` → `findings-ledger.ts` の
    間接循環が成立するため。
  - `excludeKnownUnfixedRegressions(gateFindings: Finding[], ledger: Finding[]): Finding[]` —
    `ledger` のうち severity `"low"` のエントリの fingerprint 集合を作り、`gateFindings` から
    fingerprint が一致するものを落として返す（純関数、severity ではなく fingerprint で照合する）。
- [ ] `src/core/step/step-completion.ts` の `deriveStepCompletion`（isJudgeStep 分岐, `:195-211`）で、
      `step.name === REGRESSION_GATE_STEP_NAME` のときのみ、`verdictFn` 呼び出し前に verdict 入力を整形する:
      `const reviewerChain = deriveImplReviewerChain(state)` を先に実行し、
      `verdictFindings = excludeKnownUnfixedRegressions(undecidedFindings, computeRegressionLedger(reviewerChain, state, canonScope))`。
      `verdict = verdictFn(verdictFindings, tr.ok, tr.evidence, canonScope)` とする。
      `lastUndecidedFindings` は従来通り整形前の `undecidedFindings` を保持する（escalationReason 用）。
      それ以外の judge step（regression-gate 以外）は整形せず従来通り。
- [ ] `REGRESSION_GATE_STEP_NAME` を `regression-gate.js` から、`computeRegressionLedger` /
      `excludeKnownUnfixedRegressions` を `findings-ledger.js` から、`deriveImplReviewerChain` を
      `reviewer-chain.js` から `step-completion.ts` に import する
      （import cycle が無いことを確認: `findings-ledger.ts` は `reviewer-chain.ts` を参照しない。
      `findings-ledger.ts` / `regression-gate.ts` は `step-completion.ts` を参照しない）。
- [ ] `deriveRegressionGateVerdict`（`judge-verdict.ts:210-224`）のシグネチャ・実装は変更しない。

**Acceptance Criteria**:
- `excludeKnownUnfixedRegressions([{high,fixable, file:A,line:1,title:T}], [{low,fixable, file:A,line:1,title:T}])` が `[]` を返す。
- `excludeKnownUnfixedRegressions([{high,fixable, file:B,...}], [{low,fixable, file:A,...}])` が入力をそのまま返す。
- `computeRegressionLedger` が `regression-gate.ts` の skipWhen/buildMessage と同一の ledger（同じ dedupe 結果）を返す。
- `typecheck` が通る。既存 `judge-verdict.test.ts` / `step-completion-missing-file-finding.test.ts` が無改変で green。

## T-03: regression-gate の ledger 説明を実装の実態に一致させる

- [ ] `src/prompts/regression-gate-system.ts:25` の入力説明「code-fixer が修正した fixable findings の完全リスト」を
      「reviewer が指摘した fixable findings 全件（修正済みとは限らない）」の趣旨に修正する。
- [ ] 同ファイルで「修正した findings」を前提にした表現（Question `:21` の「過去に修正された findings」、
      Method `:43` の「修正が消えた」等）を、「reviewer が指摘した fixable finding が最終コードにも残存しているか
      （＝退行していないか）を検証する」実態に沿った表現へ揃える。gate の Method の手順自体は変えない。
- [ ] `src/core/step/regression-gate.ts:58 buildLedgerBlock` の
      `"The following findings were fixed during this job. Verify each one is still fixed in the current code."` を、
      実態（reviewer が指摘した fixable findings。全てが修正済みとは限らない。各エントリが最終コードに
      残存しているか検証せよ）に沿った文言へ修正する。empty-ledger notice（`:56`）は変更しない。

**Acceptance Criteria**:
- `src/prompts/regression-gate-system.ts` に「code-fixer が修正した」「修正した fixable findings の完全リスト」という記述が残っていない。
- ledger 説明が「reviewer が指摘した fixable findings（修正済みとは限らない）」の趣旨になっている。
- 既存の `regression-gate-step.test.ts`（buildMessage の finding title/file 包含・empty notice）が無改変で green。

## T-04: 判定ロジックの単体テストを追加する（再現・新規退行・routing の歯）

- [ ] `src/core/step/__tests__/judge-verdict.test.ts` もしくは新規テストファイルに、判定ロジック
      （`excludeKnownUnfixedRegressions` + `deriveRegressionGateVerdict` の合成）の単体テストを追加する:
  - 再現テスト: ledger に low fixable エントリ L がある状態で、gate が L と同一 fingerprint の
    退行 finding（high/fixable）を報告 → `excludeKnownUnfixedRegressions` で除外され
    `deriveRegressionGateVerdict(...) === "approved"`（gate ↔ fixer ループが起きない）。
  - 新規退行テスト: 既知未修正集合に一致しない fixable finding → 除外されず
    `deriveRegressionGateVerdict(...) === "needs-fix"`（要件 4 の歯）。
  - 修正済み退行テスト: ledger に medium fixable エントリ M、gate が M と同一 fingerprint の退行を報告
    → 除外されず `needs-fix`。
- [ ] `selectFixerTargetFindings` の単体テストを追加する: low fixable を除外し high/medium fixable を保持、
      非 fixable を保持しない（T-01 routing の歯）。
- [ ] `computeRegressionLedger` / `excludeKnownUnfixedRegressions` は純関数として fixture 不要の
      assert ベースで固定する（framework 追加なし、vitest の既存構成を使う）。

**Acceptance Criteria**:
- 追加テストが 3 つの判定シナリオ（再現・新規退行・修正済み退行）と routing の歯を固定している。
- `typecheck && test` が green。
- design.md の「期待値変更した既存テスト = 0 件」と実際の diff（既存テストは無改変）が一致している。
