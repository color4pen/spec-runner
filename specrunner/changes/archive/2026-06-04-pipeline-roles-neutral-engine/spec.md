# Spec: 工程の役割と phase を記述子に一級化し、resume とエンジンの収束意味論をそこから導出する

## Requirements

### Requirement: PipelineDescriptor は工程の役割と phase を一級フィールドとして持つ

`PipelineDescriptor` は、登録された各 step に対する役割（creator / reviewer / fixer / gate）と phase（spec / impl）を一級フィールドとして保持 SHALL する。各 phase には role=creator の step が厳密に 1 つ、role=reviewer の step が厳密に 1 つ存在 MUST する。役割 / phase は記述子にのみ保持し、`JobState` には保持しない。

#### Scenario: standard 記述子が全 step の役割と phase を宣言する

**Given** STANDARD_DESCRIPTOR
**When** 各 step の役割 / phase フィールドを参照する
**Then** design=creator/spec、spec-review=reviewer/spec、spec-fixer=fixer/spec、test-case-gen=gate/impl、implementer=creator/impl、verification=gate/impl、build-fixer=fixer/impl、code-review=reviewer/impl、code-fixer=fixer/impl、conformance=gate/impl、adr-gen=gate/impl、pr-create=gate/impl が宣言されている

#### Scenario: 各 phase に creator と reviewer がちょうど 1 つ

**Given** STANDARD_DESCRIPTOR
**When** phase ごとに role=creator / role=reviewer の step を数える
**Then** spec phase は creator=design・reviewer=spec-review が各 1 つ、impl phase は creator=implementer・reviewer=code-review が各 1 つである

### Requirement: resume の役割導出は記述子から行い standard 決め打ちと standard import を持たない

`resolve-step` は再開工程の解決に必要な役割情報（phase 判定 / reviewer 判定 / fixer↔loop ペア / phase×role→step マッピング）を、引数で受け取った `PipelineDescriptor` から導出 SHALL する。`resolve-step` は具体 Step クラスの import、`STANDARD_LOOP_FIXER_PAIRS` の import、役割導出のための step 名リテラルを持た MUST NOT ない。

#### Scenario: standard 記述子での再開ルーティングが従来と一致する

**Given** STANDARD_DESCRIPTOR と resumePoint.step="spec-review"・iterationsExhausted=3
**When** `--from` 未指定で再開工程を解決する
**Then** review 枯渇として spec-fixer に解決する

#### Scenario: --from の legacy alias が phase に応じて記述子から解決する

**Given** STANDARD_DESCRIPTOR と resumePoint.step="implementer"
**When** `--from creator` で再開工程を解決する
**Then** impl phase の creator である implementer に解決する

#### Scenario: fixer-empty 検出が記述子の loopFixerPairs reverse から解決する

**Given** STANDARD_DESCRIPTOR、resumePoint.step="code-fixer"、steps[code-fixer] が空、steps[code-review] の末尾 verdict が needs-fix
**When** `--from` 未指定で再開工程を解決する
**Then** ペアの loop 工程 code-review に解決する

#### Scenario: resolve-step が standard 固有の import / リテラルを含まない

**Given** `resolve-step` のソース
**When** import 文と役割導出ロジックを確認する
**Then** 具体 Step クラスの import・`STANDARD_LOOP_FIXER_PAIRS` の import・役割導出のための step 名リテラルが存在しない

### Requirement: 非標準記述子で再開が正しい工程に解決する

`resolve-step` は記述子に存在する工程にのみ再開を解決 SHALL する。記述子に該当する (phase, role) の工程が存在しない alias 再開要求に対しては、対象と理由を明示した error を投げ MUST る。

#### Scenario: design-only の crash 再開が design に解決する

**Given** DESIGN_ONLY_DESCRIPTOR と resumePoint.step="design"・iterationsExhausted=0
**When** `--from` 未指定で再開工程を解決する
**Then** design に解決する

#### Scenario: design-only で creator 再開が design に解決する

**Given** DESIGN_ONLY_DESCRIPTOR と resumePoint.step="design"
**When** `--from creator` で再開工程を解決する
**Then** design に解決する

#### Scenario: design-only で存在しない役割への alias 再開はエラーになる

**Given** DESIGN_ONLY_DESCRIPTOR（reviewer / fixer 工程を持たない）
**When** `--from critic` で再開工程を解決する
**Then** reviewer 工程が無い旨の error を投げる

### Requirement: Pipeline 本体は standard 固有の直書きを持たず収束意味論を記述子駆動にする

`Pipeline` 本体は、まとめ表示の対象工程・loop の既定値・例外時の再開既定工程を、記述子 / 実行時引数から得 SHALL る。`Pipeline` 本体は standard 固有の step 名直書き（`SPEC_REVIEW` 等）を持た MUST NOT ない。exhaustion 経路と fixer bypass は `loopNames` / `loopFixerPairs` から導出される一般則として動作 SHALL する。

#### Scenario: まとめ表示が記述子の summaryStep から駆動される

**Given** summaryStep="spec-review" の記述子で構築した Pipeline
**When** pipeline が終了し summary を出力する
**Then** `pipeline:summary` が spec-review の反復数と最終 verdict で emit される

#### Scenario: summaryStep 未設定の記述子は summary を emit しない

**Given** summaryStep 未設定の記述子（design-only 相当）で構築した Pipeline
**When** pipeline が終了する
**Then** `pipeline:summary` は emit されない

#### Scenario: fixer bypass が reviewer↔fixer ペアから一般的に動作する

**Given** loopFixerPairs に reviewer↔fixer ペアを持つ記述子
**When** reviewer が maxIterations に達し、かつ paired fixer も maxIterations に達する
**Then** review がもう 1 回だけ再実行される（"あと 1 回" 救済）

#### Scenario: paired fixer を持たない loop 工程は救済なく打ち切られる

**Given** loopFixerPairs にペアを持たない loop 工程（conformance 相当）
**When** その工程が maxIterations 連続で前進しない
**Then** 救済なく maxIterations 回ちょうどで `*_RETRIES_EXHAUSTED` 打ち切りになる

### Requirement: standard pipeline の挙動が画面出力・打ち切り・救済・遷移で不変

本変更後も standard pipeline は、画面出力をバイト単位で同一に、打ち切り（`*_RETRIES_EXHAUSTED`）・fixer bypass・escalation・遷移の挙動を意味的に同一に保つ MUST。

#### Scenario: iter 進捗のバイト単位出力が保存される

**Given** standard 相当の構成で spec-review が approved する
**When** pipeline を実行する
**Then** `[iter 1/<max>] starting spec-review` と `Pipeline finished: spec-review iterations=1` が従来と同一文字列で出力される

#### Scenario: review 枯渇の打ち切りコードが保存される

**Given** spec-review が maxIterations 連続で needs-fix
**When** pipeline を実行する
**Then** error.code が `SPEC_REVIEW_RETRIES_EXHAUSTED` になり status が awaiting-resume になる

### Requirement: 既存 state ファイルが本変更後の再開で壊れない

`JobState` スキーマは変更 MUST NOT しない。`pipelineId` を持たない在来 state は `"standard"` 記述子に解決され、その役割 / phase 値が従来の決め打ちと一致するため、稼働中ジョブを含む既存 state の再開ルーティングは不変 SHALL である。

#### Scenario: pipelineId 欠落の state が standard として再開解決する

**Given** pipelineId を持たない（在来）job state
**When** 記述子を解決して再開工程を求める
**Then** standard 記述子から、本変更前と同一の工程に解決する

#### Scenario: in-flight 状態の state が再開で壊れない

**Given** 旧 code が書いた running / awaiting-resume の state（resumePoint を含む）
**When** 新 code で再開工程を解決する
**Then** state の migration なしで、本変更前と同一の再開工程に解決する
