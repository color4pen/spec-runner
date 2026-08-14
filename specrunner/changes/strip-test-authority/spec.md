# Spec: テスト証拠と工程順序の分離(第1弾)

## Requirements

### Requirement: test-materialize prompt は red 観測の強制を課さず実行と観測記録のみを義務化する

test-materialize の system prompt は、新規テストの実行義務と観測記録(実行したコマンド・対象テストファイル・fail/pass 件数・expected-red / expected-green の期待分類)を MUST として保持する一方、「base で red を観測するまで完了不可」「green だったら書き直して再実行する」に相当する命令を SHALL NOT 含む。初回 message も red を確認して完了する旨を含まない。

#### Scenario: red 強制の命令が prompt から消える

**Given** `TEST_MATERIALIZE_SYSTEM_PROMPT` を文字列として取得する
**When** `## Method` 節を検査する
**Then** 「書き直して」「何も見張っていないテスト」「green は欠陥」「完了不可」に相当する語が含まれない

#### Scenario: 実行義務と観測記録要求は残る

**Given** `TEST_MATERIALIZE_SYSTEM_PROMPT` を文字列として取得する
**When** `## Method` 節と `## Evidence` 節を検査する
**Then** 新規テストを完了報告の前に実行する旨、実行方法が agent の裁量である旨、および実行したコマンド・対象テストファイル・観測結果(fail/pass 件数)・期待分類(expected-red / expected-green)の記録要求が含まれる

### Requirement: expected-red が green だった場合は書き直しでなく理由の記録を指示する

test-materialize prompt は、expected-red と分類したテストを base で実行して green を観測した場合の指示として、テストの書き直しではなく、観測事実(green)と考えられる理由(既存実装が要求を満たしている / 分類誤り / 見張れていない疑い等)を Evidence に記録し判断を下流 review に委ねることを MUST とする。

#### Scenario: green 観測時の指示が理由の記録である

**Given** `TEST_MATERIALIZE_SYSTEM_PROMPT` の `## Method` 節を取得する
**When** expected-red が green だった場合の指示を検査する
**Then** 観測事実と理由を記録する旨が含まれ、テストを書き直す旨は含まれない

### Requirement: implementer は materialize 済みテスト存在時に canon 整合を指示しテスト変更を禁止しない

implementer の user message は、test-materialize の実行歴が state に存在する場合に、「test-cases.md と spec を canon(正)としてテストと実装の両方を整合させ、テストを変更した場合は変更点と理由を完了報告に明示する」ことを MUST とする。この message は「production code only」「テストの新規作成・変更禁止」に相当する指示を SHALL NOT 含む。test-materialize 実行歴が無い場合(fast pipeline)の message は無変更で TDD 指示を保持する。

#### Scenario: materialize 済みでテスト変更禁止が消える

**Given** state に test-materialize の run が 1 件以上記録されている
**When** `ImplementerStep.buildMessage` が user message を生成する
**Then** message は「do not create or modify test files」に相当する指示を含まず、canon(test-cases.md)を正としてテストと実装の両方を整合させる旨と、テスト変更時に理由を報告する旨を含む

#### Scenario: fast pipeline の TDD message は無変更

**Given** state に test-materialize の run が 1 件も無い
**When** `ImplementerStep.buildMessage` が user message を生成する
**Then** message は従来どおり TDD 指示を含む

### Requirement: bite-evidence は base に過去の implementer commit が混入した場合 fail でなく理由付き deferral を返す

bite-evidence gate は、base(最新 test-materialize run)の run より前に開始された implementer run で commitOid を持つものが state に存在する場合、base-red → candidate-green の判定を行わず、baseline 構築不能を理由に明示した deferral を返す MUST。この deferral は既存 strategy-deferred と同じ合流先(verification)へ遷移し、hollow 誤判定による failed(→ escalate)を SHALL NOT 生じさせる。base の run より前の implementer commit が存在しない(初回一巡)場合の判定挙動は無変更とする。

#### Scenario: 再走で base に実装が混入したとき deferral になる

**Given** state が再走形状(implementer-1 → test-materialize-2 = base → implementer-2 = candidate)を持ち、implementer-1 の run が base の run より前に開始され commitOid を持つ
**And** base で materialize されたテストが green を返す
**When** `runBiteEvidenceGate` を実行する
**Then** verdict は "strategy-deferred" であり、reason が baseline 構築不能(base への実装混入)を示す
**And** `STANDARD_TRANSITIONS` は bite-evidence の "strategy-deferred" を verification へ遷移させる

#### Scenario: 初回一巡での base-green は従来どおり failed のまま

**Given** state が初回一巡形状(test-materialize = base の run より前に implementer run が無い)を持つ
**And** base で materialize されたテストが green を返す(genuine hollow)
**When** `runBiteEvidenceGate` を実行する
**Then** verdict は "failed" のまま(判定挙動は無変更)
