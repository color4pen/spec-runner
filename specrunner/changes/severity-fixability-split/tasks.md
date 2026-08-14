# Tasks: severity と fixability の分離 — LOW も fixable なら直す

> 実装者向けメモ: verdict 導出（`deriveJudgeVerdict` / `deriveSpecReviewVerdict` /
> `deriveRegressionGateVerdict`）のロジックは変更しない。触るのは「どの finding を fixer に渡すか」
> と「no-op を許容するか」の層のみ。更新すべき既存テストは design.md「Existing Test Update Ledger」
> が唯一の正典。列挙外のテストは無変更で green を保つこと。

## T-01: routing 層の LOW 除外を外す（selectFixerTargetFindings）

- [ ] `src/core/step/judge-verdict.ts` の `selectFixerTargetFindings` から
      `.filter((f) => f.severity !== "low")` を除去し、`collectFixableFindings(findings)` を返すようにする
- [ ] 同関数の doc コメント（「fixable findings with severity != low」「LOW severity findings are
      excluded」旨）を「fixable 全 severity を返す。routing 層が fixer 対象選択の唯一の判定点」に更新
- [ ] `src/core/step/code-fixer.ts:239-242` の「LOW findings are excluded」コメントを実態
      （fixable 全件を返す）に合わせて更新。`selectFixerTargetFindings` 呼び出しは維持
- [ ] `src/core/step/routed-findings.ts:107-113` Branch 3 の「Apply severity policy (LOW excluded)」
      コメントを更新。`selectFixerTargetFindings` 呼び出しは維持

**Acceptance Criteria**:
- `selectFixerTargetFindings` は low を含む全 fixable を返し、non-fixable は除外する
- code-fixer / routed-findings の呼び出し構造は不変（routing 層一本化を維持）
- `typecheck` が通る

## T-02: regression-gate を ledger 全件検証に戻す（excludeKnownUnfixedRegressions 廃止）

- [ ] `src/core/pipeline/findings-ledger.ts` の `excludeKnownUnfixedRegressions` 関数を削除
- [ ] `src/core/step/step-completion.ts:209-217` の regression-gate 用分岐から
      `excludeKnownUnfixedRegressions` 適用を除去し、`verdictFindings = undecidedFindings` とする
      （regression-gate も他 judge step と同じ入力を使う）
- [ ] `src/core/step/step-completion.ts:249-260` の regression-gate 永続化整列ブロック
      （`excludeKnownUnfixedRegressions` で persistToolResult.findings を絞る箇所）を削除
- [ ] 上記で未使用になった import（`excludeKnownUnfixedRegressions` / `computeRegressionLedger` /
      `deriveImplReviewerChain` / `REGRESSION_GATE_STEP_NAME`）を step-completion.ts から除去。
      typecheck で未使用判定を確認してから削除する
- [ ] `src/core/step/judge-verdict.ts` の `deriveRegressionGateVerdict` の doc コメント（呼び出し側が
      excludeKnownUnfixedRegressions を先に適用する前提、という記述）を「ledger 全件を受け取り、残存する
      fixable は真の退行なので needs-fix。severity による除外はしない」に更新。関数ロジックは不変

**Acceptance Criteria**:
- `excludeKnownUnfixedRegressions` はコードベースから消え、参照が残らない
- regression-gate は ledger 全件（low を含む）を verdict 入力とし、任意の fixable 退行で needs-fix になる
- `deriveRegressionGateVerdict` の判定挙動は不変（任意 fixable → needs-fix）
- `typecheck` が通る

## T-03: code-fixer step message を severity 不問の修正義務に統一

- [ ] `src/core/step/code-fixer.ts` buildMessage の全 5 分岐（conformance:149-151 / coordinator 集約:191-195 /
      coordinator fallback:216-222 / 標準 embedded:270-274 / 標準 findingsPath fallback:289-295）の
      「Fix all HIGH and CRITICAL ... (mandatory)」「Fix MEDIUM ... only if they do not require design changes」
      を、「listed findings をすべて severity を問わず必須で修正する」旨の指示に置き換える
- [ ] 新文言に英語の安定 pin 文字列 `regardless of severity` を含める
- [ ] write-scope ガード行（`Do NOT add new features or make specification changes` /
      `Do NOT modify the review-feedback file itself` 等）と commit/push 指示行は保持する

**Acceptance Criteria**:
- 全 5 分岐の prompt が severity 階層化文言（"Fix all HIGH and CRITICAL severity findings" 等）を含まない
- 全 5 分岐の prompt が `regardless of severity` を含む
- LOW fixable finding を埋め込んだ標準経路の prompt に当該 LOW finding が現れる
- `typecheck` が通る

## T-04: code-fixer system prompt の severity 再フィルタ（「LOW は無視」）を除去

- [ ] `src/prompts/code-fixer-system.ts:40` の「Fix カラムが存在しない（旧 format）: severity に基づいて
      判断する（HIGH は必須、MEDIUM は設計変更不要の範囲、LOW は無視）」を、severity で選別しない指示
      （提示された finding はすべて最小修正で解消する）に置き換える
- [ ] line 38「Fix: yes の finding: すべて修正する（severity に関わらず）」は正しいため保持する
- [ ] spec-fixer system prompt（`src/prompts/spec-fixer-system.ts`）は severity 文言を持たないため無変更で
      あることを確認（requirement 4 の spec-fixer 側規律維持）

**Acceptance Criteria**:
- `CODE_FIXER_SYSTEM_PROMPT` に low severity を無視・除外する指示が残っていない
- spec-fixer system prompt は無変更
- `typecheck` が通る

## T-05: fixer no-op 容認特例を除去（approved 経路 no-op も escalate）

- [ ] `src/core/pipeline/reviewer-chain.ts` の `codeReviewFindingsRoutingActive` 関数を削除
- [ ] `src/core/step/no-op-detect.ts` の `detectNoOp` から `findingsRoutingApproved` パラメータと、
      `sourceFiles.length === 0` かつ `findingsRoutingApproved === true` で `undefined` を返す抑止分岐を削除。
      `findingTargetPaths` / `pipelineManagedPaths` 免除ロジックは保持する
- [ ] `src/core/step/executor.ts` の `codeReviewFindingsRoutingActive` import（line 19）と、`detectNoOp`
      呼び出しの `findingsRoutingApproved: …`（line 482 付近）を削除
- [ ] `deriveImplFixerChain` 等、no-op 抑止以外で `codeReviewFindingsRoutingActive` に依存していないことを
      確認（他参照が無いことを確認してから削除）

**Acceptance Criteria**:
- `codeReviewFindingsRoutingActive` と `findingsRoutingApproved` はコードベースから消え、参照が残らない
- approved findings-routing 経路で code-fixer が source も finding-named path も変更しない no-op は verdict を
  needs-fix に override する
- findingTargetPaths / pipelineManagedPaths 免除は不変（doc-only 修正は仕事として数え、escalate しない）
- needs-fix path no-op の #734 escalate 挙動は不変
- `typecheck` が通る

## T-06: 既存テストの更新（design.md「Existing Test Update Ledger」に従う）

- [ ] `src/core/step/__tests__/regression-gate-false-loop.test.ts`: TC-008 / TC-005 を LOW 包含前提に更新。
      TC-009 / TC-010 / TC-001 / TC-002 を削除。TC-003 / TC-004 は削除（退行→needs-fix は
      judge-verdict.test.ts でカバー）。`excludeKnownUnfixedRegressions` の import を除去。TC-011 は無変更
- [ ] `tests/unit/step/fixer-findings.test.ts`: TC-FF-C-005 を「LOW も MEDIUM も埋め込まれる」前提に更新
      （`[LOW]` と LOW title を `toContain`、`not.toContain` を反転）
- [ ] `tests/unit/step/code-fixer.test.ts`: describe「prompt severity contract …」TC-001〜005 を新文言
      （`regardless of severity` を `toContain`、旧 `Fix all HIGH and CRITICAL severity findings` assert を除去）に更新
- [ ] `src/core/step/__tests__/executor-no-op.test.ts`: 「Req 1」「TC-008(findingsRoutingApproved suppression)」を
      `needs-fix` 期待に更新。他（TC-001〜007/009/010/012、Req2/3/4）は無変更
- [ ] `src/core/step/__tests__/no-op-detect-exemption.test.ts`: 「TC-011: approved findings-routing … suppression
      preserved」を削除。他の `detectNoOp` 呼び出しから `findingsRoutingApproved:` 引数行を除去
- [ ] `src/core/pipeline/__tests__/reviewer-chain.test.ts`: describe「codeReviewFindingsRoutingActive」を削除、
      import から `codeReviewFindingsRoutingActive` を除去
- [ ] 上記以外のテスト（design.md で「不変」と明記した参照含む）は変更しない

**Acceptance Criteria**:
- design.md「Existing Test Update Ledger」で「更新」とした項目のみが変更され、「不変」とした項目は無変更
- 削除・更新後のテストファイルが型・参照エラーなくコンパイルできる
- `typecheck && test` が green
