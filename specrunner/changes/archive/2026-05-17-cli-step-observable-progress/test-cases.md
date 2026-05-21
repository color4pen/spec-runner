# Test Cases: cli-step-observable-progress

## Meta

- **source**: request.md / design.md / tasks.md
- **date**: 2026-05-17

---

## Category A: Bug-fix — loopNames 全体の iter 表示

### TC-A01: spec-review の iter 開始表示が出る（既存挙動維持）

- **Priority**: must
- **Source**: request.md 要件 1 / acceptance criteria / tasks 5.1

**GIVEN** Pipeline の loopNames に `spec-review` が含まれる  
**WHEN** spec-review が iteration 1 で実行される  
**THEN** stdout に `[iter 1/M] starting spec-review` が含まれる

---

### TC-A02: verification の iter 開始表示が出る（bug-fix）

- **Priority**: must
- **Source**: request.md 要件 1 / acceptance criteria / tasks 5.2

**GIVEN** Pipeline の loopNames に `verification` が含まれる  
**WHEN** verification が iteration 1 で実行される  
**THEN** stdout に `[iter 1/M] starting verification` が含まれる

---

### TC-A03: code-review の iter 開始表示が出る（bug-fix）

- **Priority**: must
- **Source**: request.md 要件 1 / acceptance criteria / tasks 5.3

**GIVEN** Pipeline の loopNames に `code-review` が含まれる  
**WHEN** code-review が iteration 1 で実行される  
**THEN** stdout に `[iter 1/M] starting code-review` が含まれる

---

### TC-A04: spec-review approved 時の verdict 表示が currentStep 名で出る

- **Priority**: must
- **Source**: request.md 要件 1 / design D2 / tasks 5.4

**GIVEN** Pipeline の loopNames に `spec-review` が含まれる  
**WHEN** spec-review が `approved` を返す  
**THEN** stdout に `spec-review verdict: approved → done` が含まれる  
**AND** `this.loopName verdict: ...` などのリテラルは含まれない

---

### TC-A05: verification needs-fix 時の verdict 表示が currentStep 名で出る

- **Priority**: must
- **Source**: request.md 要件 1 / design D2 / tasks 5.4

**GIVEN** Pipeline の loopNames に `verification` が含まれ、loopFixerPairs に `verification → build-fixer` が設定されている  
**WHEN** verification が `needs-fix` を返す  
**THEN** stdout に `verification verdict: needs-fix → spawning fixer` が含まれる

---

### TC-A06: code-review escalation 時の verdict 表示が currentStep 名で出る

- **Priority**: must
- **Source**: request.md 要件 1 / design D2

**GIVEN** Pipeline の loopNames に `code-review` が含まれる  
**WHEN** code-review が `escalation` を返す  
**THEN** stdout に `code-review verdict: escalation → halt` が含まれる

---

## Category B: 非 loopNames CliStep の [step] 表示

### TC-B01: dsv 入場時に [step] 表示が出る

- **Priority**: must
- **Source**: request.md 要件 2 / acceptance criteria / tasks 6.1

**GIVEN** `delta-spec-validation` が `kind: "cli"` かつ loopNames に含まれない  
**WHEN** pipeline が dsv を実行する直前  
**THEN** stdout に `[step] delta-spec-validation` が含まれる

---

### TC-B02: dsv が approved を返したとき完了表示が出る

- **Priority**: must
- **Source**: request.md 要件 2 / acceptance criteria / tasks 6.2

**GIVEN** `delta-spec-validation` が `kind: "cli"` かつ loopNames に含まれない  
**WHEN** dsv が `verdict: "approved"` を返す  
**THEN** stdout に `[step] delta-spec-validation: approved` が含まれる

---

### TC-B03: dsv が needs-fix を返したとき完了表示が出る

- **Priority**: must
- **Source**: request.md 要件 2 / design D4

**GIVEN** `delta-spec-validation` が `kind: "cli"` かつ loopNames に含まれない  
**WHEN** dsv が `verdict: "needs-fix"` を返す  
**THEN** stdout に `[step] delta-spec-validation: needs-fix` が含まれる

---

### TC-B04: pr-create 入場時に [step] 表示が出る

- **Priority**: must
- **Source**: request.md 要件 2 / acceptance criteria / tasks 6.3

**GIVEN** `pr-create` が `kind: "cli"` かつ loopNames に含まれない  
**WHEN** pipeline が pr-create を実行する直前  
**THEN** stdout に `[step] pr-create` が含まれる

---

### TC-B05: pr-create 成功時に完了表示が出る

- **Priority**: must
- **Source**: request.md 要件 2 / acceptance criteria / tasks 6.4

**GIVEN** `pr-create` が `kind: "cli"` かつ loopNames に含まれない  
**WHEN** pr-create が `verdict: "success"` を返す  
**THEN** stdout に `[step] pr-create: success` が含まれる

---

### TC-B06: pr-create 失敗時に error verdict の完了表示が出る

- **Priority**: must
- **Source**: request.md 要件 2 / design D4

**GIVEN** `pr-create` が `kind: "cli"` かつ loopNames に含まれない  
**WHEN** pr-create が `verdict: "error"` を返す  
**THEN** stdout に `[step] pr-create: error` が含まれる

---

### TC-B07: parseResult が verdict: null を返す CliStep は完了表示が出ない

- **Priority**: must
- **Source**: request.md 要件 2 / design D4 / tasks 6.5

**GIVEN** 非 loopNames の CliStep で `parseResult()` が `{ verdict: null }` を返す  
**WHEN** その step が実行完了する  
**THEN** stdout に `[step] <step-name>:` を含む行が存在しない  
**AND** 入場表示 `[step] <step-name>` は出力されている

---

### TC-B08: verification（loopNames 含 CliStep）は [step] 表示が出ない

- **Priority**: must
- **Source**: request.md 要件 2 / acceptance criteria / tasks 6.6

**GIVEN** `verification` が `kind: "cli"` かつ loopNames に含まれる  
**WHEN** verification が実行される  
**THEN** stdout に `[step] verification` が含まれない  
**AND** stdout に `[iter N/M] starting verification` が含まれる（loop 表示が優先）

---

### TC-B09: design（AgentStep 非 loopNames）は [step] 表示が出ない

- **Priority**: must
- **Source**: request.md 要件 2 / スコープ外 / tasks 6.7

**GIVEN** `design` が `kind: "agent"` かつ loopNames に含まれない  
**WHEN** design が実行される  
**THEN** stdout に `[step] design` が含まれない

---

## Category C: retries exhausted 表示への step 名追加

### TC-C01: conventional exhaustion（L304）に exhaust した step 名が含まれる

- **Priority**: must
- **Source**: request.md 要件 3 / design D3 / tasks 2.1

**GIVEN** loop step が `maxIterations` 回に達した（conventional exhaustion パス）  
**WHEN** retries exhausted のメッセージが stdout に出力される  
**THEN** stdout に `retries exhausted on <loop-step-name>, escalating` が含まれる  
**AND** `retries exhausted, escalating`（step 名なし）は含まれない

---

### TC-C02: fixer exhaustion（L330）に exhaust した step 名が含まれる

- **Priority**: must
- **Source**: request.md 要件 3 / design D3 / tasks 2.2

**GIVEN** fixer が最大 retry に達した（fixer exhaustion パス、`exhaustedLoopName` 使用）  
**WHEN** retries exhausted のメッセージが stdout に出力される  
**THEN** stdout に `retries exhausted on <exhaustedLoopName>, escalating` が含まれる  
**AND** `currentStep`（= fixer の step 名）ではなく元の loop step 名が出力されている

---

### TC-C03: spec-review が exhaust したとき TC-029 の fixture が一致する

- **Priority**: must
- **Source**: request.md 要件 3-b / tasks 4.1 / 4.2 / 4.3

**GIVEN** `tests/cli-stdout-snapshot.test.ts:298`（TC-029）が spec-review の exhaust シナリオを検証している  
**WHEN** retries exhausted メッセージの変更後にテストを実行する  
**THEN** TC-029 の期待値 `[iter N/M] retries exhausted on spec-review, escalating` が stdout と一致する  
**AND** `tests/pipeline-integration.test.ts:531`（TC-016）の fixture も更新済みで pass する  
**AND** `tests/core/pipeline/pipeline.test.ts:432` の fixture も更新済みで pass する

---

## Category D: 最終サマリの primary loop 維持

### TC-D01: Pipeline finished サマリが primary loopName で出力される

- **Priority**: must
- **Source**: request.md 要件 1（スコープ外 / L304 / L330 維持） / design D2 / acceptance criteria

**GIVEN** Pipeline が正常完了する  
**WHEN** 最終サマリが stdout に出力される  
**THEN** stdout に `Pipeline finished: spec-review iterations=N, final verdict=V` が含まれる  
**AND** `Pipeline finished: verification ...` / `Pipeline finished: code-review ...` のような非 primary 名は含まれない

---

### TC-D02: prevLoopStep の代入が primary loop のみを参照する

- **Priority**: should
- **Source**: request.md 要件 1（L361 変更不要の確認） / tasks 1.4

**GIVEN** Pipeline に複数の loopNames step が設定されている  
**WHEN** primary loopName (spec-review) が実行される  
**THEN** `prevLoopStep` が spec-review の currentStep 値を持つ（history メッセージに影響しない）  
**AND** 他の loopNames step（verification / code-review）実行後は `prevLoopStep` が変化しない

---

## Category E: 出力フォーマット二重出力防止

### TC-E01: loopNames に含まれる step が [step] と [iter N/M] を二重出力しない

- **Priority**: must
- **Source**: request.md 設計判断 2 / design D5

**GIVEN** `verification` が loopNames に含まれる CliStep である  
**WHEN** verification が実行される  
**THEN** stdout に `[iter N/M] starting verification` が含まれる  
**AND** stdout に `[step] verification` が含まれない（二重出力なし）

---

### TC-E02: 非 loopNames CliStep が [iter N/M] 表示を出さない

- **Priority**: should
- **Source**: request.md 設計判断 2 / design D5

**GIVEN** `delta-spec-validation` が非 loopNames の CliStep である  
**WHEN** dsv が実行される  
**THEN** stdout に `[iter N/M] starting delta-spec-validation` が含まれない  
**AND** stdout に `[step] delta-spec-validation` が含まれる

---

## Category F: Spec Authority 更新

### TC-F01: spec.md の iter 表示 Requirement が loopNames 全体に拡大されている

- **Priority**: must
- **Source**: request.md 要件 5 / acceptance criteria / tasks 7.1

**GIVEN** `specrunner/specs/pipeline-orchestrator/spec.md` を参照する  
**WHEN** 「Pipeline Emits Iteration Progress to Stdout」の Requirement を確認する  
**THEN** `[iter <N>/<max>] starting <currentStep>` フォーマットが記載されている  
**AND** primary loopName のみへの制限が削除されている  
**AND** `retries exhausted on <exhaustedStep>, escalating` フォーマットが記載されている

---

### TC-F02: spec.md に非 loopNames CliStep の [step] 表示 Requirement が追加されている

- **Priority**: must
- **Source**: request.md 要件 5 / acceptance criteria / tasks 7.2

**GIVEN** `specrunner/specs/pipeline-orchestrator/spec.md` を参照する  
**WHEN** 「Pipeline Emits Step Progress for Non-Loop CliSteps」の Requirement を確認する  
**THEN** CliStep 非 loopNames の入場時 `[step] <step-name>` 出力が記載されている  
**AND** verdict non-null 時の完了表示 `[step] <step-name>: <verdict>` が記載されている  
**AND** loopNames 含 CliStep および AgentStep は対象外であることが明記されている

---

## Category G: Regression

### TC-G01: 既存 TC-068（stdout iter format）が regression しない

- **Priority**: must
- **Source**: request.md 要件 4 / acceptance criteria

**GIVEN** `tests/core/pipeline/pipeline.test.ts` の TC-068 が存在する  
**WHEN** `bun run test` を実行する  
**THEN** TC-068 が pass する  
**AND** `[iter N/M]` フォーマット検証が壊れていない

---

### TC-G02: `bun run typecheck && bun run test` が全て green になる

- **Priority**: must
- **Source**: request.md acceptance criteria

**GIVEN** 全ての変更が完了している  
**WHEN** `bun run typecheck && bun run test` を実行する  
**THEN** 型エラーが 0 件  
**AND** テストが全て pass する（新規 11 件 + 既存 regression 0 件）

---

### TC-G03: 新規テストファイル loop-iter-stdout の 5 件が pass する

- **Priority**: must
- **Source**: request.md 要件 4 / acceptance criteria / tasks 5.1-5.5

**GIVEN** `tests/unit/core/pipeline/pipeline.loop-iter-stdout.test.ts` が存在する  
**WHEN** `bun run test` を実行する  
**THEN** TC-A01 相当（spec-review iter）/ TC-A02 相当（verification iter）/ TC-A03 相当（code-review iter）/ TC-A04 相当（verdict 表示）/ TC-G01 の参照コメント の 5 テストが全て pass する

---

### TC-G04: 新規テストファイル cli-step-output の 7 件が pass する

- **Priority**: must
- **Source**: request.md 要件 4 / acceptance criteria / tasks 6.1-6.7

**GIVEN** `tests/unit/core/pipeline/pipeline.cli-step-output.test.ts` が存在する  
**WHEN** `bun run test` を実行する  
**THEN** TC-B01〜B09 相当の 7 テスト（dsv 入場・完了、pr-create 入場・完了、verdict null、verification 除外、design 除外）が全て pass する
