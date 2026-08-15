# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 読んだファイル
- `request.md` — 背景・要件・現状コードの前提・受け入れ基準を通読
- `spec.md` — 全 Requirement / Scenario を通読
- `design.md` — D1〜D6 の全 Decision と Rationale、テスト更新対象の全列挙を通読
- `tasks.md` — T-01〜T-11 の全タスクを通読
- `test-cases.md` — TC-001〜TC-025 を通読

### 照合したソースファイル（現状コード）
- `src/core/pipeline/types.ts` — `STANDARD_TRANSITIONS` の既存 test-materialize 行（260, 261, 268, 269, 271, 273）、`FAST_TRANSITIONS`（test-materialize 不在を確認）
- `src/kernel/step-names.ts` — `AGENT_STEP_NAMES`（test-materialize を含む）、`STEP_NAMES.TEST_MATERIALIZE` 定数
- `src/core/pipeline/test-gen-exemption.ts` — `isTestGenExempt`・`specFixerForwardsToImplementer` の export と内容
- `src/core/pipeline/spec-observation.ts` — `specFixerObservationForward` の doc コメント（"directly to test-materialize" 表記あり、T-03 で更新対象）
- `src/core/step/bite-evidence/oids.ts` — `resolveBaseCandidateOids`（baseOid = TEST_MATERIALIZE commitOid）、`resolveEvidenceBaseRev`
- `src/core/step/bite-evidence/gate.ts` — step 3 の `baseOid` null → strategy-deferred、step 6 の `listCommitChangedFiles(baseOid)` を確認
- `src/core/archive/achieved-assurance.ts` — P2（baseOid null → early-return）、(a) `listCommitChangedFiles(baseOid)`、(b) blob freeze `diffPathsBetweenCommits`、(c) scenario binding の構造を通読
- `src/core/step/implementer.ts` — `testsMaterialized = Boolean(state.steps?.[TEST_MATERIALIZE]?.length)` の mode 分岐、`buildImplementerInitialMessage`・`buildImplementerRecoveryMessage` の分岐箇所
- `src/prompts/implementer-system.ts` — 既存の "test-materialize 済み / 未 materialize" 二分岐記述を確認
- `src/core/resume/resolve-step.ts` — `LEGACY_STEP_ALIASES = { "build-fixer": IMPLEMENTER }` のパターンを確認
- `src/core/runtime/managed.ts` — `listCommitChangedFiles`・`diffPathsBetweenCommits` が構造的 unavailable パターンで実装されていることを確認（typeof チェックは通過し、call が unavailable を返す）
- `src/state/schema/types.ts` — `_AgentStepExtraInArray`・`_AgentStepExtraInUnion` 双方向 compile guard を確認
- `src/core/step/write-scope.ts` — `GUARDED_WRITE_STEPS` に `"test-materialize"` を確認
- `src/core/step/staging-containment.ts` — doc comment に test-materialize を確認
- `src/prompts/pipeline-map.ts` — test-materialize 行の存在を確認
- `src/prompts/__tests__/prompt-skeleton-drift-guard.test.ts` — 現在 `ALL_14_AGENT_PROMPTS.length === 13`・`PRODUCER_AND_FIXER_PROMPTS.length === 7` であることを確認（TC-022 の 12・6 への更新と整合）
- `src/config/schema/types.ts` / `src/core/verification/test-coverage.ts` — test-materialize doc comment の残存を確認（下記 Findings 参照）

### 検証した要件・論点

**要件 1（遷移の置換）: D1**
- `SPEC_REVIEW approved → TEST_MATERIALIZE`（unconditional）を `→ IMPLEMENTER` に変更する設計は論理的に正しい
- `SPEC_REVIEW approved → IMPLEMENTER when isTestGenExempt`（line 260）は新しい unconditional 行に包摂されるため削除は正しい
- `specFixerForwardsToImplementer` は `specFixerObservationForward && isTestGenExempt` であり、line 271 が line 273（`→ IMPLEMENTER when specFixerObservationForward`）に包摂される論理を確認
- `FAST_TRANSITIONS` は test-materialize を含まないことを確認（無変更で正しい）
- `isTestGenExempt` の残存 2 箇所（design → spec-review、implementer → verification）を確認

**要件 2（implementer 単一 mode 化）: D2**
- `implementer.ts` の `testsMaterialized` 分岐は 4 箇所に残存（lines 304, 316, 328, 348, 367）、T-04 で全削除対象であることを確認
- `implementer-system.ts` の "test-materialize 済み / 未 materialize" 二分岐記述は実在し、T-04 で単一責務記述への置換が必要なことを確認
- TC-008 の THEN が「実体化責務を含む」AND「implement-only mode の分岐記述を含まない」の両方を pin していることを確認 → 正しい双方向 pin

**要件 3（file-set 同定の EB-native 化）: D3**
- `diffPathsBetweenCommits` の production caller が `achieved-assurance.ts` のみであることを grep で確認（8 ファイルに言及があるが tests / port interface / runtime impl を除くと 1 caller）
- managed runtime は `listCommitChangedFiles`・`diffPathsBetweenCommits` を typeof チェック通過型の unavailable 実装で保持していることを確認。新 primitive `listChangedFilesBetweenCommits` も同パターンで実装される設計（T-05）は整合
- `gate.ts` の step 順再編（D3 新順序）はコード読解で追跡可能

**要件 4（testDerivation 意味論再定義）: D4**
- 現在の achieved-assurance.ts は `if (freezeIntact && scenarioFreezeIntact) { achieved["testDerivation"] = "frozen"; }` — 変更後は `scenarioFreezeIntact` のみ条件になる
- D4 の "type gate は testDerivation には適用しない" は現状コードにも同様（(d) type gate は biteEvidence のみ）
- `STANDARD_PROFILE.assurance.testDerivation = "frozen"` の floor 値は D4 で明示的に据え置き

**要件 5（削除と互換）: D5**
- `LEGACY_STEP_ALIASES = { "build-fixer": IMPLEMENTER }` のパターンを確認。`"test-materialize": IMPLEMENTER` を同位置に追加する設計は整合
- `state.step` hard-crash fallback（priority 4）が alias 非適用なのは build-fixer と同一パターンであることを確認

**要件 6（exemption 縮退）: D6**
- compile guard（`_AgentStepExtraInArray` / `_AgentStepExtraInUnion`）の双方向強制を確認
- `AGENT_STEP_NAMES` と `AgentStepName` を同一変更で除去する T-01 の方針は正しい

**セキュリティ**
- 新しいトラストバウンダリは追加されない（OID は git 操作・events journal 由来の信頼済みソース）
- `listChangedFilesBetweenCommits(evidenceBaseRev, headOid, cwd)` に渡る OID はシステム由来（`resolveEvidenceBaseRev` / `captureHeadSha`）であり、ユーザー入力の直接流入なし
- prompt 変更（mode 分岐削除）は injection ベクタを導入しない
- CLI ツールであり Web / ネットワーク露出面なし。OWASP Top 10 の適用領域外

## 検証できなかった項目

- `src/state/schema/types.ts` の `_AgentStepExtraInArray`・`_AgentStepExtraInUnion` が実際に `"test-materialize"` を含む型推論をしていること（型レベルの動作。`tsc` が緑になれば確認できるが実行不可）
- managed runtime の `readFileAtCommit` が testDerivation-only floor で動作すること（実行環境外）
- `tc-source-contract.ts` の consumer 列挙の完全な内容（grep で存在を確認したが全文を読んでいない）
- `src/prompts/rules.ts` の責任範囲表の内容（test-materialize 行の参照を確認したが内容読み取り略）

## Findings 詳細

### Finding-1: TC-015 が testDerivation の materializedTestFiles 独立性を明示的に pin していない（LOW / fixable）

**場所**: `test-cases.md` TC-015、`spec.md` Requirement "testDerivation は scenario 凍結として判定される"

**内容**: TC-015 の THEN 節は "baseOid や test blob の不変性は要求されない" と明示しており、blob freeze 廃止は正しく pin されている。しかし Given の "forward-type job" 条件では、実装が D2 に従い test ファイルを materialize していれば EB↔HEAD diff は非空になる。これにより、`achieved-assurance.ts` の restructuring で もし materializedTestFiles 空チェックの early-return が scenario binding より前に配置されていても、TC-015 のフィクスチャが非空 materializedTestFiles を使う限りテストが誤って通過する可能性がある。

D4 の設計意図（"testDerivation の判定を scenario revision binding のみに縮退する"）では、materializedTestFiles が空の場合でも scenario binding が intact なら testDerivation = "frozen" であるべきだが、この独立性を直接 pin するテストケースが存在しない。

**根拠**: D3 は "biteEvidence が floor 制約されるときのみ EB ref を解決" と指定しており、materializedTestFiles の列挙が biteEvidence ブロック内に移動することを意図している。しかし T-07 の記述はこの条件分岐の配置を明示していない。

**推奨対応**: TC-015 のサブケースとして、"EB↔HEAD diff にテストパターンに合致するファイルが存在しない（materializedTestFiles 空）が scenario binding は intact な場合も testDerivation = frozen" のフィクスチャを追加するか、spec.md の Given に "materializedTestFiles の有無によらず" の明示を加える。実用上は D2 により forward-type job が常にテストファイルを materialize するため影響は限定的。

### Finding-2: tasks.md の doc scrub 列挙に 2 ファイルが不在（LOW / fixable）

**場所**: `tasks.md` T-02、`src/state/schema/types.ts` line 226、`src/config/schema/types.ts` line 249

**内容**:
- `src/state/schema/types.ts` line 226: `commitOid` の doc が "test-materialize" を名指し
- `src/config/schema/types.ts` line 249: `staging-containment` doc が "test-materialize" を列挙

T-02 の doc scrub 対象リスト（staging-containment.ts / output-contract.ts / runtime-strategy.ts / templates / tc-source-contract / pipeline-map / rules）にこれら 2 ファイルが含まれていない。機能への影響はない（doc comment のみ）。

**判断参考**: 設計 D5 は `verification/test-coverage.ts` の test-materialize 言及を意図的に残す判断をしており、doc scrub の網羅を要求していない。`state/schema/types.ts` は compile guard を含む重要ファイルなので誤解を招く doc が残ると将来の読者のコストになる。

**推奨対応**: T-02 の削除リストに `state/schema/types.ts` line 226 と `config/schema/types.ts` line 249 の doc 更新を追記する。または T-11 の "doc の意図的な #-issue 参照を除く" 条件に沿ってこれらを意図的残存として明示する。

---

**Finding 以外の観察（action 不要）**:

- `specFixerObservationForward` の doc "spec-fixer should forward directly to test-materialize" は T-03 で更新対象として明示されており問題なし
- `src/core/verification/test-coverage.ts` の test-materialize 言及は D5 rationale で意図的に残す設計判断が明示されており問題なし
- `FAST_TRANSITIONS` は test-materialize 非依存（無変更で正しい、D1 で確認済み）
- `state.step` hard-crash path の alias 非適用は build-fixer と同一の既存挙動として D5 で明示されており問題なし
- TC-022 のカウント（13→12、7→6）は現在のテストファイルの実測値と整合
