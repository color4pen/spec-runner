# Spec: test-materialize の自己 red 確認

## Requirements

### Requirement: test-materialize prompt は新規テストの実行と fail 観測を義務化する

test-materialize の system prompt（`TEST_MATERIALIZE_SYSTEM_PROMPT`）の `## Method` 節は、新規に書いた各テストを
完了報告の **前に** 実行し、fail（red）することを観測してから完了する旨を MUST 記述する。fail しなかった新挙動
テストは「何も見張っていないテスト」であり、書き直してから再実行する旨を MUST 含める。実行は新規テストファイル
単位でまとめてよい旨、実行方法はプロジェクトの既存テストコマンドへのファイル指定など agent の裁量であり新しい
設定・CLI 機構を導入しない旨を示す。当該記述は既存 5 節骨格（Question / Contract / Method / Evidence /
Completion）の内側に置かれ、新規の h2 見出しを追加 SHALL NOT する。

#### Scenario: prompt に実行と red 観測の指示が含まれる

**Given** `TEST_MATERIALIZE_SYSTEM_PROMPT` を文字列として取得する
**When** `## Method` 節を検査する
**Then** 新規テストを完了報告の前に実行し fail（red）を観測してから完了する旨と、fail しなかった新挙動テストは
「何も見張っていないテスト」なので書き直して再実行する旨が含まれ、実行方法が agent の裁量である旨が読み取れ、
Question / Contract / Method / Evidence / Completion の 5 節と順序が維持され、Method 節内に新規 h2 見出しが無い

### Requirement: test-materialize prompt は expected-red / expected-green の期待分類と一致確認を規定する

test-materialize の system prompt の `## Method` 節は、各テスト（または describe 単位）を `expected-red` /
`expected-green` の 2 分類のいずれかに割り当てる旨を MUST 記述する。`expected-red` は新挙動を検証するテストで
base（現在の worktree）で fail が正常・green が欠陥であること、`expected-green` は既存挙動の保持確認テストおよび
既存テストへのトレーサビリティコメント追記で base で green が正常であることを示す。prompt は、期待と観測の不一致
（`expected-red` が green / `expected-green` が red）を完了不可とし、修正または再分類の根拠を Evidence に記す旨を
MUST 含める。当該記述は `## Method` 節の内側に置かれ、新規の h2 見出しを追加 SHALL NOT する。

#### Scenario: prompt に期待分類と一致確認の指示が含まれる

**Given** `TEST_MATERIALIZE_SYSTEM_PROMPT` を文字列として取得する
**When** `## Method` 節を検査する
**Then** `expected-red`（新挙動・base で fail が正常・green は欠陥）と `expected-green`（既存挙動保持確認および
トレーサビリティコメント追記・base で green が正常）の 2 分類のリテラルが含まれ、期待と観測の不一致は完了不可で
修正または再分類の根拠を Evidence に記す旨が読み取れ、5 節骨格と順序が維持され、Method 節内に新規 h2 見出しが無い

### Requirement: test-materialize prompt の Evidence 要求は実行観測記録を義務化する

test-materialize の system prompt の `## Evidence` 節の step 固有 evidence 要求は、新規テストの実行観測記録を MUST
含める: 実行したコマンド、対象テストファイル、観測結果（fail / pass の件数）、各テスト（または describe 単位）の
期待分類（`expected-red` / `expected-green`）。当該記述は既存の evidence 要求（変換 TC ID の列挙等）を保持したまま
`## Evidence` 節の内側に追記され、新規の h2 見出しを追加 SHALL NOT する。test-materialize は pipeline-parse される
専用 result file を持たないため、記録先は完了報告（Evidence）であり、prompt は存在しない "result file" を記録先と
名指し SHALL NOT する。

#### Scenario: Evidence 節に観測記録の指示が含まれる

**Given** `TEST_MATERIALIZE_SYSTEM_PROMPT` を文字列として取得する
**When** `## Evidence` 節を検査する
**Then** 実行したコマンド・対象テストファイル・観測結果（fail / pass の件数）・各テストの期待分類
（`expected-red` / `expected-green`）を記録する旨が含まれ、既存の「変換した TC ID の一覧を記録する」等の evidence
要求も残っており、5 節骨格と順序が維持されている

### Requirement: 既存の test-materialize prompt 契約が回帰しない

本変更は test-materialize prompt の既存契約（manual / gate TC の実体化スキップ、既存テスト充足時のトレーサビリティ
コメント手順、5 節骨格と順序、リポジトリ固有テストパス不参照）を改変 SHALL NOT する。追記はすべて `## Method` /
`## Evidence` 節の内側に置かれ、既存の契約テストが無改変で green を維持する MUST。

#### Scenario: 既存の manual / gate / traceability / skeleton 契約が無改変で green

**Given** 既存の `test-materialize-prompt-contract.test.ts` / `test-materialize-manual-scope-contract.test.ts` /
`test-materialize-gate-scope-contract.test.ts`
**When** 本変更後にこれらを実行する
**Then** いずれのテストも無改変のまま green であり、5 節骨格・順序・トレーサビリティコメント手順・manual/gate
スキップ・リポジトリ固有パス不参照の各契約が維持されている
