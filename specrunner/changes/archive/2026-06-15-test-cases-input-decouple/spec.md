# Spec: test-cases.md input decoupling と descriptor input-completeness preflight

## Requirements

### Requirement: code-review と custom reviewer は test-cases.md を soft input として扱う

`code-review` step と custom reviewer step の `test-cases.md` への `reads()` 宣言は `required: false`（soft）でなければならない（MUST）。`test-cases.md` が欠落していても、これらの step は起動前の必須入力検証（`STEP_INPUT_MISSING`）で停止してはならない（MUST NOT）。`test-cases.md` が存在する場合、`code-review` は従来どおり must-scenario 照合に使用しなければならない（MUST）。

#### Scenario: fast で test-cases.md 不在でも code-review が止まらない

**Given** producer（`test-case-gen`）を含まない descriptor（fast 相当）で `test-cases.md` が change folder に存在しない
**When** `code-review` step の必須入力が検証される
**Then** `test-cases.md` 欠落を理由とする `STEP_INPUT_MISSING` は発生せず、step は起動できる

#### Scenario: standard で test-cases.md が在れば must-scenario 照合に使う

**Given** `test-cases.md` が change folder に存在する
**When** `code-review` step の user message が組み立てられる
**Then** must-scenario 照合の指示が `test-cases.md` を参照し、standard の挙動は従来と不変である

#### Scenario: custom reviewer も test-cases.md 欠落で止まらない

**Given** custom reviewer を合成した descriptor で `test-cases.md` が存在しない
**When** custom reviewer step の必須入力が検証される
**Then** `test-cases.md` 欠落を理由とする `STEP_INPUT_MISSING` は発生しない

### Requirement: test-case-gen は test-cases.md の生成を自身で保証する

`test-case-gen` step は、セッション完了後に `test-cases.md` が未生成・空・未改変テンプレのいずれかである場合、自身の output 契約違反として `STEP_OUTPUT_MISSING`（相当）でパイプラインを停止しなければならない（MUST）。この保証は downstream の `code-review` の必須 read に依存してはならない（MUST NOT）。

#### Scenario: test-case-gen が完了したのに test-cases.md 未生成

**Given** `test-case-gen` のセッションが成功完了したが `test-cases.md` が生成されていない（または空・未改変テンプレのまま）
**When** output gate が `test-case-gen` の output 契約を検証する
**Then** `STEP_OUTPUT_MISSING`（相当）が発生し、パイプラインは停止する

### Requirement: descriptor input-completeness validator は純関数で violation を返す

`src/core/pipeline/` 配下に、descriptor の各 step の必須 read が「上流 step の writes」または「ambient 入力」で満たされるかを検査する純関数 validator が存在しなければならない（MUST）。この validator は `fs` / `child_process` を import してはならない（MUST NOT、B-5）。必須 read（`required !== false` かつ file）が満たされない場合、その step と path を violation として返さなければならない（MUST）。

#### Scenario: producer 不在の必須 read を violation として返す

**Given** ある step が `test-cases.md` を必須 read（`required` 既定）として宣言し、その descriptor の上流に `test-cases.md` を書く step も ambient 入力も存在しない
**When** `validateDescriptorInputCompleteness` が呼ばれる
**Then** 当該 step と `test-cases.md` を含む violation が返る

#### Scenario: 適用後の全 base descriptor が input-complete

**Given** consumer soft 化（D1）適用後の `PIPELINE_REGISTRY` の各 base descriptor（standard / design-only / fast）
**When** それぞれを `validateDescriptorInputCompleteness` に通す
**Then** violation は 0 件である

#### Scenario: loop-back の必須 read は paired reviewer の write で満たされる

**Given** fixer step が paired reviewer の result file（iteration 付き）を必須 read として宣言する descriptor
**When** validator が iteration suffix を正規化して上流 writes と突合する
**Then** 当該 loop-back read は violation にならない

### Requirement: validator は着手前 preflight で合成後 descriptor を検算する

`PipelineRunCommand.prepare` は、`composeReviewerDescriptor` で合成した実 descriptor に対して、`bootstrapJob` を呼ぶ前に `validateDescriptorInputCompleteness` を実行しなければならない（MUST）。violation が存在する場合は throw し、job state を作成してはならない（MUST NOT）。

#### Scenario: violation 検出時に bootstrapJob を呼ばない

**Given** 合成後 descriptor に input-completeness violation が存在する
**When** `prepare` が validator を実行する
**Then** `prepare` は violation 内容を含むエラーで throw し、`bootstrapJob` は呼ばれず job state は作られない

#### Scenario: 合成後 descriptor を検算するため custom reviewer の必須 read も対象になる

**Given** custom reviewer を含む合成後 descriptor
**When** `prepare` が validator を実行する
**Then** 検算対象は base ではなく合成後 descriptor であり、custom reviewer の必須 read も検査される
