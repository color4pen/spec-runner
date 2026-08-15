# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### コードアサーション検証（Code Assertion Fact-Check）

「現状コードの前提」に記載された全アサーションを実際のコードで照合した。

| アサーション | ファイル:行 | 確認結果 |
|---|---|---|
| `SPEC_REVIEW approved → TEST_MATERIALIZE`（unconditional） | `src/core/pipeline/types.ts:261` | ✓ 確認 |
| `TEST_MATERIALIZE success → IMPLEMENTER` | `src/core/pipeline/types.ts:268` | ✓ 確認 |
| `TEST_MATERIALIZE error → escalate` | `src/core/pipeline/types.ts:269` | ✓ 確認 |
| `SPEC_REVIEW approved → IMPLEMENTER when isTestGenExempt`（exempt bypass） | `src/core/pipeline/types.ts:260` | ✓ 確認 |
| `resolveBaseCandidateOids` の baseOid = test-materialize の commitOid | `src/core/step/bite-evidence/oids.ts:35-41` | ✓ 確認 |
| gate step 3: baseOid === null → strategy-deferred | `src/core/step/bite-evidence/gate.ts:114-122` | ✓ 確認 |
| gate step 6: `listCommitChangedFiles(baseOid)` で file-set 同定 | `src/core/step/bite-evidence/gate.ts:150-152` | ✓ 確認 |
| archive floor P2: baseOid === null → return early | `src/core/archive/achieved-assurance.ts:222-235` | ✓ 確認 |
| archive floor (b): `diffPathsBetweenCommits(baseOid, finalHeadOid)` | `src/core/archive/achieved-assurance.ts:300` | ✓ 確認 |
| `testsMaterialized = Boolean(state.steps?.[TEST_MATERIALIZE]?.length)` | `src/core/step/implementer.ts:304` | ✓ 確認 |
| implementer mode 分岐（implement-only / TDD） | `src/core/step/implementer.ts:84-128` | ✓ 確認 |
| `isTestGenExempt` が SPEC_REVIEW→IMPLEMENTER と IMPLEMENTER→VERIFICATION を制御 | `src/core/pipeline/test-gen-exemption.ts:29-31` | ✓ 確認 |
| `LEGACY_STEP_ALIASES` に `build-fixer → implementer` のみ存在（test-materialize はまだない） | `src/core/resume/resolve-step.ts:17-19` | ✓ 確認 |
| `GUARDED_WRITE_STEPS` に `"test-materialize"` が含まれる | `src/core/step/write-scope.ts:34-38` | ✓ 確認 |
| `AGENT_STEP_NAMES` に `"test-materialize"` が含まれる | `src/kernel/step-names.ts:19` | ✓ 確認 |
| `STEP_NAMES.TEST_MATERIALIZE` 定義 | `src/kernel/step-names.ts:47` | ✓ 確認 |
| `STANDARD_DESCRIPTOR.steps` に `TestMaterializeStep` が含まれる | `src/core/pipeline/registry.ts:45` | ✓ 確認 |
| `SPEC_FIXER approved → TEST_MATERIALIZE when specFixerObservationForward` | `src/core/pipeline/types.ts:273` | ✓ 確認 |
| `TestMaterializeStep.outputContracts()` = test-coverage contract | `src/core/step/test-materialize.ts:87-99` | ✓ 確認 |

### 影響範囲の確認

- `src/core/step/bite-evidence/gate.ts`: baseOid 依存の deferral パス（step 3）が gate とテストファイル選定の両方でブロックポイントになっていることを確認
- `src/core/archive/achieved-assurance.ts`: P2 の `baseOid` null チェックが biteEvidence/testDerivation 両次元の共通ゲートになっていること、blob freeze (b) が `baseOid` を anchor にしていることを確認
- `src/core/step/implementer.ts`: `testsMaterialized` 分岐が buildImplementerInitialMessage に存在し、standard pipeline では "テストを変更せず実装のみ" と指示していることを確認
- `src/prompts/implementer-system.ts`: system prompt (line 46) に `test-materialize 済み（standard pipeline）の場合` / `未 materialize（fast pipeline 等）の場合` の2分岐記述が存在することを確認（requirement 2 のスコープ内）
- `src/core/pipeline/__tests__/test-gen-exemption.test.ts`: TC-007 が `SPEC_REVIEW approved → TEST_MATERIALIZE` を非免除 type の期待値として固定していることを確認（design 列挙対象）
- `src/prompts/__tests__/tc-source-contract.test.ts` および `prompt-skeleton-drift-guard.test.ts`: `TEST_MATERIALIZE_SYSTEM_PROMPT` を import・参照しており、削除後に更新必須であることを確認

### 遷移ロジックの確認

`specFixerForwardsToImplementer = specFixerObservationForward AND isTestGenExempt` の合成を確認。現在 non-exempt type の spec-fixer observation forward path は TEST_MATERIALIZE へ（types.ts:273）、exempt type は IMPLEMENTER へ（types.ts:271）ルーティングされる。test-materialize 廃止後は両経路が IMPLEMENTER に収束するため、`specFixerForwardsToImplementer` 述語が論理的に冗長化する。

### `isTestGenExempt` の控除対象確認

現在 `isTestGenExempt` は:
1. `DESIGN success → SPEC_REVIEW`（test-case-gen バイパス）
2. `SPEC_REVIEW approved → IMPLEMENTER`（test-materialize バイパス）
3. `IMPLEMENTER success → VERIFICATION`（bite-evidence バイパス）

の3箇所を制御。要件6の縮退（2箇所）は、(2) が test-materialize 削除で unconditional になることで自然に実現する。

## 検証できなかった項目

- `#985`, `#989` 等の具体的 issue 事例は本リポジトリの issue tracker から確認していない（コードには直接影響なし）
- 実際の job 実行 state の折り畳み（fold）挙動: test-materialize 実行歴を含む既存 state.json の読み込みテストは既存ユニットテストの範囲で確認

## Findings 詳細

### Finding 1: test-materialize の output-contract "test-coverage" が acceptance criteria で未明示

`TestMaterializeStep.outputContracts()` が返す `"test-coverage"` 契約（test-materialize.ts:87-99）は、step 廃止後に消滅する。verification phase の `runTestCoveragePhase` は独立して TC カバレッジを検証するため、機能的な回帰はない。ただし、implementer に同等の output-contract を追加するかどうかは設計判断であり、acceptance criteria に明示がない。design phase でこの判断を明記することを推奨する。

### Finding 2: `specFixerForwardsToImplementer` 述語の論理的冗長化と TC-006 の更新

test-materialize 廃止後、`specFixerForwardsToImplementer`（specFixerObservationForward AND isTestGenExempt）は冗長化する。test-gen-exemption.test.ts の TC-006 はこの述語を直接テストしており、design の列挙対象に明示的に含める必要がある。acceptance criteria の「design で全列挙」カバレッジ内だが、述語削除の判断を design で明示することを推奨する。

### Finding 3: testDerivation の blob freeze anchor の設計分岐

現在の blob freeze (b): `diffPathsBetweenCommits(baseOid, finalHeadOid, materializedTestFiles)` の baseOid = test-materialize commit が消滅する。request が提示する選択肢（scenario 凍結のみへの縮退 / 廃止等）のいずれを選ぶかで archive floor の assurance 要件が変わる。requirement 4 と acceptance criteria が明示的にこれを design 判断に委ねているため、blocking ではないが、design output の testDerivation 再定義が後続の test fixture 設計の前提になることに留意する。
