# Tasks: テスト証拠と工程順序の分離(第1弾)

## T-01: test-materialize prompt から red 強制を撤回する

`src/prompts/test-materialize-system.ts` を編集し、red 観測の強制を削除する。実行義務と観測記録は維持する(design D1)。

- [ ] `## Method` 節(現 `:93` 付近)の expected-red 定義から「green は欠陥（何も見張っていないテスト）」の権威句を削除する。expected-red / expected-green の分類ラベルと目的の記述自体は残す。
- [ ] `## Method` 節(現 `:96` 付近)の「fail（red）することを観測してから完了する」を「実行し、観測結果(fail/pass 件数と期待分類)を記録してから完了する」に置換する。新規テストの実行義務・実行方法が agent の裁量である旨は残す。
- [ ] `## Method` 節(現 `:98` 付近)の「fail しなかった新挙動テスト…書き直してから再実行する。…完了不可とし、修正または再分類の根拠を Evidence に記す。」ブロックを、「expected-red が green だった場合は書き直さない。観測事実(green)と考えられる理由(既存実装が要求を満たしている / 分類誤り / 見張れていない疑い等)を Evidence に記録し、判断は下流の review に委ねる」に置換する。
- [ ] 初回 message(`buildTestMaterializeInitialMessage`、現 `:161` 付近)の「New tests MUST be run before completing — confirm they fail (red) as expected …」を、red 確認を課さず「新規テストを実行し観測結果(fail/pass と期待分類)を記録してから完了する」旨に中立化する。
- [ ] `## Evidence` 節の step 固有要求(実行したコマンド・対象テストファイル・観測結果 fail/pass 件数・期待分類)は無変更で残す。
- [ ] `## Method` / `## Evidence` に新規 h2 見出しを追加しない(5 節骨格 Question/Contract/Method/Evidence/Completion と順序を維持)。

**Acceptance Criteria**:
- `TEST_MATERIALIZE_SYSTEM_PROMPT` の `## Method` 節に「書き直して」「何も見張っていないテスト」「green は欠陥」「完了不可」に相当する語が含まれない。
- `## Method` 節に新規テスト実行の義務・agent 裁量・expected-red / expected-green ラベルが残る。`## Evidence` 節に実行したコマンド・対象テストファイル・観測結果・期待分類の記録要求が残る。
- expected-red が green の場合の指示が「理由の記録」であり「書き直し」を含まない。
- 5 節骨格と順序が維持され、初回 message が red 確認を課さない。

## T-02: T-01 に対応する prompt contract テストの期待値を更新する

`tests/unit/prompts/test-materialize-red-check-contract.test.ts` を design D5 の #1–#5 に従って更新する。列挙外のテストは触らない。

- [ ] TC-001「書き直して再実行する旨が含まれる」assertion を「含まれない」(`書き直して` / `何も見張っていないテスト` が `## Method` に不在)へ反転する。
- [ ] TC-002「expected-red は green が欠陥である旨」assertion を「含まれない」(`green は欠陥` / `欠陥` が不在)へ反転する。
- [ ] TC-002「不一致は完了不可とする旨」assertion を「含まれない」(`完了不可` / `不一致`+`完了` が不在)へ反転する。
- [ ] TC-002「修正または再分類の根拠を Evidence に記す旨」assertion を、green 観測時に「理由」を「記録 / Evidence」する指示が含まれる、という期待へ変更する。
- [ ] ファイル冒頭 docstring を、反転後の意味(工程順序由来の権威を撤回・観測記録は維持)へ更新する。
- [ ] 維持対象(TC-001 の完了報告 / 観測 / 裁量 / 5 節骨格、TC-002 の expected-red / expected-green ラベル・expected-green は green が正常、TC-003 全体、TC-004 全体、TC-005)は無変更で green のままにする。

**Acceptance Criteria**:
- 更新後の `test-materialize-red-check-contract.test.ts` が T-01 適用後の prompt に対して green。
- `test-materialize-prompt-contract.test.ts`(traceability / 5 節骨格)は無変更で green。

## T-03: implementer の materialize 済みモードを canon 整合に置換する

`src/core/step/implementer.ts` の `buildImplementerInitialMessage` の `testsMaterialized` true 分岐(現 `:82-105`)のみを書き換える(design D2)。

- [ ] 「Your role is to write ONLY the implementation (production) code to make those tests pass.」および手順 3 の「write production code only, do NOT create or modify test files」を削除する。
- [ ] 代わりに「test-cases.md と spec を canon(正)としてテストと実装の両方を整合させる。テストを変更した場合は、変更したテストとその理由を完了報告に明示する」旨の指示を置く。
- [ ] lockfile 同期指示(現 手順 5)・tasks.md checkbox 更新・end_turn の各手順は true 分岐に残す。
- [ ] default(TDD)分岐と分岐構造(`if (testsMaterialized) { ... }`)は無変更。新しい成果物ファイルは追加しない。

**Acceptance Criteria**:
- `buildImplementerInitialMessage({ testsMaterialized: true })` の message が「do not create or modify test files」に相当する文言を含まない。
- 同 message が canon(test-cases.md)整合とテスト変更理由の報告指示を含み、`(TDD: write tests first` を含まない。
- `testsMaterialized: false` / 未指定の message は従来どおり(TDD 指示・lockfile 指示を含む)で、両者が一致する。

## T-04: T-03 に対応する implementer message テストの期待値を更新する

`tests/unit/step/test-materialize-boundary.test.ts` を design D5 の #6–#8 に従って更新する。列挙外のテストは触らない。

- [ ] TC-TMB-05「message contains 'production' and NOT 'TDD'」を、true 分岐が canon 整合の文面(`test-cases.md` 参照 + テストと実装の両方を整合)を含み、`(TDD: write tests first` を含まない、という期待へ更新する。
- [ ] TC-TMB-05「message says not to create or modify test files」を、「do not create or modify test」を**含まない** + 「変更したテストと理由を報告」の指示を含む、へ反転する。
- [ ] TC-TMB-07 の `production` assertion を #6 と同じ canon 整合文面の assertion に更新する(state 経由で true 分岐を検出する挙動自体は維持、`(TDD: write tests first` 不在も維持)。
- [ ] TC-TMB-06(default 分岐 = TDD、false===undefined)、TC-TMB-01..04 / 08..19 / A1 / F1 は無変更で green のままにする。

**Acceptance Criteria**:
- 更新後の `test-materialize-boundary.test.ts` が T-03 適用後の message に対して green。
- `tests/prompts/implementer-system.test.ts` は無変更で green(system prompt は変更しないため)。

## T-05: bite-evidence の前提破れ検知を追加する

base に過去の implementer commit が混入した再走を検知し、fail でなく理由付き deferral を返す(design D3)。

- [ ] `src/core/step/bite-evidence/oids.ts` に純関数 `detectBaseImplementationContamination(state): string | null` を追加する。最新 test-materialize run(base)の `startedAt` より前に `startedAt` を持ち、かつ `commitOid` を持つ implementer run が存在すればその commitOid を返し、無ければ null を返す。`resolveBaseCandidateOids` の署名は変更しない(archive floor が共用)。
- [ ] `src/core/step/bite-evidence/gate.ts` の OID 解決直後(baseOid / candidateOid が共に非 null と確認した後、runtime capability check の前)に `detectBaseImplementationContamination` を呼ぶ。非 null が返れば `{ verdict: "strategy-deferred", records: [], reason: "baseline unbuildable: implementer commit <oid> predates the base test-materialize commit (implementation mixed into base) — red→green cannot be established" }` を返す。
- [ ] 新 verdict / 新 transition は追加しない(既存 `{ bite-evidence, strategy-deferred → verification }` を再利用)。

**Acceptance Criteria**:
- 再走形状(implementer-1 → test-materialize-2 = base → implementer-2、impl1 が base より前で commitOid を持つ)で base-green のとき、`runBiteEvidenceGate` が `verdict === "strategy-deferred"` を返し、`reason` が baseline 構築不能を示す。
- 初回一巡(base の run より前に implementer run が無い)で base-green のとき、verdict は従来どおり `"failed"`。
- `resolveBaseCandidateOids` の呼び出し側(`src/core/archive/achieved-assurance.ts`)は無変更で typecheck が通る。

## T-06: bite-evidence の検知に対する gate テストを追加する

`src/core/step/bite-evidence/__tests__/gate.test.ts` に design D5 の新規テストを追加する。

- [ ] run ごとに異なる `startedAt` を設定できるよう、既存 `makeStepRunWithOid` を拡張するか timestamp 指定可能な補助を用意する。
- [ ] 再走形状(`test-materialize:[mat1@t0, mat2@t2]`, `implementer:[impl1@t1, impl2@t3]`)+ base-green を返す fake runtime → `verdict === "strategy-deferred"` かつ `reason` が baseline 構築不能を示すことを固定する。
- [ ] `STANDARD_TRANSITIONS` に `{ step: bite-evidence, on: "strategy-deferred", to: verification }` が存在することを固定する(verification へ遷移する受け入れ基準)。
- [ ] 初回一巡形状(`test-materialize:[mat@t0]`, `implementer:[impl@t1]`、distinct timestamp)+ base-green(genuine hollow)→ `verdict === "failed"`(判定無変更)を固定する。
- [ ] 既存 TC-003/004/005/006/007/008/022/030/031/032 は無変更で green のままにする。

**Acceptance Criteria**:
- 追加した 2 テストが T-05 適用後の gate に対して green。
- 既存 gate テストが無変更で green。

## T-07: 全体検証

- [ ] `bun run typecheck` が green。
- [ ] `bun run test` が green(更新した既存テスト + 新規テスト + 列挙外の既存テスト全て)。

**Acceptance Criteria**:
- `typecheck && test` が green。
- design D5 の列挙外の既存テストがいずれも無変更で green。
