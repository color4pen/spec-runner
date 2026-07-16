# cross-boundary-invariants レビュー結果 001

- **verdict**: approved
- **reviewer**: cross-boundary-invariants
- **iteration**: 1
- **対象変更**: test-materialize-boundary

---

## 観点サマリ

diff が**変更していない**コードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。実装そのものは正しくテストも green のまま、既存機構との相互作用にだけ欠陥が宿るクラスのバグを対象とする。

---

## 検証した主要不変条件

### INV-01: reverification 判定述語（`codeChangedSinceLastVerification`）— ✅ 維持

`src/core/pipeline/reverification.ts` の `IMPL_CODE_MUTATOR_STEPS` は `[implementer, build-fixer, code-fixer]` のまま。`test-materialize` はここに追加されていない。test-materialize コミット（base OID = test ファイルのみ）は「実装コードの変更」には該当しないため、reverification chokepoint が誤発火しない。

`mTime > vTime`（mutator 最終実行 > verification 最終実行）の比較ロジックは test-materialize を素通りし、conformance 後の再検証判定が本変更前と同一の挙動を維持する。

### INV-02: FAST pipeline の TDD 挙動保存— ✅ 維持

`ImplementerStep.buildMessage` の `testsMaterialized` フラグは `Boolean(state.steps?.["test-materialize"]?.length)` で判定。FAST pipeline では test-case-gen も test-materialize も実行されないため `state.steps["test-materialize"]` が空 → `testsMaterialized = false` → TDD モード継続。FAST_DESCRIPTOR には test-materialize が存在せず、FAST_TRANSITIONS も無変更。

### INV-03: 遷移テーブルの one-path-to-test-materialize 不変条件 — ✅ 維持

`to === "test-materialize"` の遷移は `test-case-gen on:success` の 1 本のみ（`types.ts:236`）。needs-fix 系（conformance→needs-fix:implementer、verification failed→build-fixer、code-review needs-fix→code-fixer）はいずれも test-materialize を指さない。テスト TC-TMB-18 で固定済み。

### INV-04: ループ枯渇処理（`handleExhausted`）との相互作用 — ✅ 問題なし

test-materialize は `loopNames` に含まれず `LOOP_ERROR_CODES` にエントリなし。error→escalate の直接遷移のみが存在し、retry なしで escalation する。pipeline.ts の `handleExhausted` は `loopNames.includes(step)` を条件にするため test-materialize には適用されない。

### INV-05: 型システム同期（AgentStepName / AGENT_STEP_NAMES）— ✅ 維持

`src/kernel/agent-definition.ts:26` の `AgentStepName` union に `"test-materialize"` を追加、`src/kernel/step-names.ts:19` の `AGENT_STEP_NAMES` 配列にも追加。双方向コンパイル時ガード（`state/schema.ts`）が整合性を担保する。

### INV-06: 「各 phase に creator 1 つ・reviewer 1 つ」不変条件 — ✅ 維持

test-materialize は `{role:"gate", phase:"impl"}` で登録（registry.ts:73）。impl phase の creator は implementer のまま唯一、reviewer は code-review のまま唯一。TC-002 でテスト固定済み。

### INV-07: conformance 再入時の `testsMaterialized` 判定 — ✅ 正しく動作

conformance→needs-fix:implementer 経由で implementer が再実行されるとき、`state.steps["test-materialize"]` に既に記録が存在するため `testsMaterialized = true` となる。conformance 再入パス（`conformanceFindings !== null`）でも `testsMaterialized` を `buildImplementerInitialMessage` に渡している（implementer.ts:207）ため、実装専用モードが正しく維持される。

### INV-08: output contract (`test-coverage`) の managed runtime 互換 — ✅ 維持

`ManagedRuntime.validateStepOutputs` の `test-coverage` ブランチ（managed.ts:459-464）は violation を出さずスキップ。`digestArtifacts` が managed で `hash:null` を返すのと同方針（best-effort）。local runtime のみが contract を権威的に評価する。

### INV-09: descriptor-input-completeness の FAST 互換 — ✅ 維持

`ImplementerStep.reads()` に追加した `{path: test-cases.md, required:false}` は FAST pipeline では "available" set に存在しないが、`required:false` のためバリデータが skip する（`descriptor-input-completeness.ts:172` の既存ロジック）。FAST の input-completeness 違反なし。

### INV-10: 遷移テーブル行数の整合 — ✅ 正しい

STANDARD_TRANSITIONS: test-case-gen→test-materialize（変更）+ test-materialize→implementer（新規）+ test-materialize→escalate（新規）で net +2 行。38→40 行。TC-030 でテスト固定済み（pipeline.transitions.test.ts:272-276）。

---

## 所見（非ブロッキング）

### OBS-01: test-coverage output contract は positive-only（design 受け入れ済みリスク）

`test-materialize` の `outputContracts()` は「各 must TC に assertion 付きテストが存在する」（正検証）のみを契約する。「実装コードが書かれていない」（負検証）を機械的に enforce しない。base OID の "test のみ" 不変条件は system prompt と T-07 のテストハーネス（tree diff 検証）で担保される。`design.md Risks` に明記の設計受け入れ済みリスク。

### OBS-02: assertion check は FILE 単位（既存の verification 挙動と同等）

`evaluateTestCoverage` の assertion 検証（Step 4b）は「TC-ID を含む file に `expect(` / `assert(` が存在するか」をファイル単位で判定する。同一ファイル内の無関係な assertion がカウントされる粗粒度判定。これは既存の verification フェーズで同一関数を使用している pre-existing の意味論的制約であり、本変更で新たに持ち込まれたものではない。

### OBS-03: conformance 再入パスで `placement` が渡されない（既存の非対称性）

`ImplementerStep.buildMessage` の conformance 経路（implementer.ts:201-216）では `placement` が `buildImplementerInitialMessage` に渡されない。本変更以前から存在する非対称性であり、今回の `testsMaterialized` 追加で影響範囲は変わらない。

---

## まとめ

全主要不変条件は維持されている。所見 3 件はいずれも設計受け入れ済みのリスク・既存挙動の継承・または影響なしの非対称性であり、ブロッキング欠陥はない。

- **verdict**: approved
