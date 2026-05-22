# step-execution-architecture Specification (delta)

## Requirements

### Requirement: AgentStep は followUpPrompt を宣言する

`AgentStep` interface SHALL `followUpPrompt?: string` field を持つ。この field は作業 turn 完了後に同一 session で投げる follow プロンプトの文面を宣言する。

`followUpPrompt` が未指定 (undefined / 省略) の step は従来通り作業 turn のみで実行される。既存の step 実装は `followUpPrompt` を省略しているため、後方互換性が保たれる。

`followUpPrompt` は step 非依存の汎用 field であり、任意の AgentStep が primitive 側の追加改修なしで設定できる。

#### Scenario: followUpPrompt が AgentStep interface に存在する

- **WHEN** `AgentStep` interface の型定義を inspect する
- **THEN** `followUpPrompt?: string` field が存在する
- **AND** field は optional である

#### Scenario: followUpPrompt 未指定の step は後方互換

- **GIVEN** `followUpPrompt` を省略した既存の AgentStep 実装 (spec-review, implementer, etc.)
- **WHEN** その step を StepExecutor で実行する
- **THEN** 作業 turn のみ実行され、従来と同一の挙動である
- **AND** AgentRunContext.followUpPrompt は undefined である

### Requirement: StepExecutor は followUpPrompt を AgentRunContext に転記する

`StepExecutor.runAgentStep` SHALL `AgentStep.followUpPrompt` を `AgentRunContext.followUpPrompt` に転記する。転記は `needsProjectContext` → `projectContext` と同型の executor 転記パターンに従う。

`StepExecutor` は `followUpPrompt` の解釈や実行を行わない。転記のみを責務とし、2 段実行の制御は adapter に委ねる。

executor / finalizeStep の既存ロジックは無改修とする。`runner.run(ctx)` が内部 2 turn でも executor からは 1 回の await で 1 つの `AgentRunResult` を受け取る。

#### Scenario: executor が followUpPrompt を ctx に転記する

- **GIVEN** `step.followUpPrompt` が `"rules.md を読み直して修正してください"` である
- **WHEN** `StepExecutor.runAgentStep(step, state, deps)` が `AgentRunContext` を構築する
- **THEN** `ctx.followUpPrompt` は `"rules.md を読み直して修正してください"` である

#### Scenario: executor が followUpPrompt 未指定時に undefined を渡す

- **GIVEN** `step.followUpPrompt` が undefined である
- **WHEN** `StepExecutor.runAgentStep(step, state, deps)` が `AgentRunContext` を構築する
- **THEN** `ctx.followUpPrompt` は undefined である

#### Scenario: executor と finalizeStep が無改修である

- **WHEN** `StepExecutor.runAgentStep` のソースを inspect する
- **THEN** `runner.run(ctx)` は 1 回呼ばれる
- **AND** `finalizeStep` は `followUpPrompt` を参照しない
- **AND** pipeline の step 遷移 / state machine / FIXER_STEP_NAMES に変更はない

### Requirement: DesignStep は delta spec format self-fix の followUpPrompt を宣言する

`DesignStep` (`src/core/step/design.ts`) SHALL `followUpPrompt` を設定し、作業 turn 完了後に rules.md を読み直して delta spec の format 違反を self-fix するよう agent に指示する。

follow プロンプトは以下の action を指示する:
- rules.md を Read tool で読む
- delta spec 記法の規律 (セクションヘッダー形式 / Requirement header / Scenario 存在 / SHALL/MUST 含有 / コードブロック禁止域 / Removed・Renamed リスト形式) を確認する
- 書いた delta spec ファイルを Read し、違反箇所があれば修正する
- 違反がなければ変更せず end_turn する

follow プロンプトの文面には `slug` を実行時に埋め込む (rules.md の path に必要)。buildMessage の pure function 制約と異なり、followUpPrompt は step 定義時に静的な文字列テンプレートとして宣言し、slug 埋め込みは adapter 側で行う、または step 定義時に slug 非依存な path 表記 (相対パス等) を使用する。

#### Scenario: DesignStep に followUpPrompt が設定されている

- **GIVEN** `DesignStep` instance を inspect する
- **WHEN** `step.followUpPrompt` を確認する
- **THEN** 非 undefined の string が設定されている
- **AND** 文字列に `rules.md` への Read 指示が含まれる
- **AND** 文字列に delta spec 記法の具体的な規律が含まれる

#### Scenario: followUpPrompt は self-fix action を指示する

- **GIVEN** DesignStep の followUpPrompt 文面
- **WHEN** 文面を inspect する
- **THEN** 「rules.md を Read tool で読め」という action 指示が含まれる
- **AND** 「delta spec の format 違反を修正しろ」という action 指示が含まれる
- **AND** 「違反がなければ変更せず end_turn」という条件付き終了指示が含まれる
- **AND** 「違反しているか判定せよ」という検出ゲート的な表現は含まれない
