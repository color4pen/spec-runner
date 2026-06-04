# Spec: JobState に pipeline 同一性（pipelineId）を記録する

## Requirements

### Requirement: JobState は pipeline 同一性を optional フィールドとして保持する

`JobState` は、そのジョブがどの pipeline 定義で実行されたかを示す optional な `pipelineId` フィールド（`string`）を保持できる SHALL。このフィールドが欠落している state も有効な state として扱われ MUST。

#### Scenario: pipelineId を持つ state を round-trip しても値が保たれる

**Given** `pipelineId: "standard"` を持つ新規 `JobState`
**When** その state を永続化し、再度読み込む
**Then** 読み込まれた state の `pipelineId` は `"standard"` である

#### Scenario: pipelineId を持たない state も有効として読める

**Given** `pipelineId` フィールドを含まない既存 state ファイル（legacy）
**When** `validateJobState` でその state を検証・読み込みする
**Then** エラーにならず、検証は成功する
**And** state の他のフィールド（`jobId` / `status` / `steps` 等）は従来通り保持される

### Requirement: 新規ジョブ起動時に現行 pipeline 識別子を記録する

新規ジョブの作成時、system は現行の pipeline 識別子 `"standard"` を `pipelineId` に記録する SHALL。pipeline 識別子の canonical 値は単一の定数として一元管理され MUST。

#### Scenario: 新規ジョブの state に pipelineId が記録される

**Given** 新しいジョブを起動する
**When** ジョブの初期 state が作成・永続化される
**Then** 永続化された state の `pipelineId` は `"standard"` である

#### Scenario: pipeline を組み立てる command が識別子を明示的に渡す

**Given** 標準 pipeline でジョブを起動する run command
**When** command が初期 state を作成する
**Then** 作成された state の `pipelineId` は現行 pipeline 識別子（`"standard"`）になる

### Requirement: pipelineId 欠落時の解決値は "standard" に一意化される

system は、`pipelineId` が欠落した state に対する解決値を `"standard"` として一意に定義する SHALL。解決は単一のヘルパ経由で行われ、消費側が個別に既定値を持たない MUST。

#### Scenario: pipelineId を持たない state は "standard" に解決される

**Given** `pipelineId` を持たない state
**When** pipeline 識別子の解決ヘルパにその state を渡す
**Then** 戻り値は `"standard"` である

#### Scenario: pipelineId を持つ state はその値に解決される

**Given** `pipelineId: "standard"` を持つ state
**When** pipeline 識別子の解決ヘルパにその state を渡す
**Then** 戻り値は `"standard"`（記録された値）である

### Requirement: pipelineId の導入は実行・再開・画面出力の挙動を変えない

`pipelineId` の追加・記録・解決は、pipeline の実行・再開・画面出力の挙動を変更しない SHALL。本変更では pipeline 再構築・遷移・stdout 出力のいずれも `pipelineId` を分岐条件として参照しない MUST。

#### Scenario: 画面出力スナップショットが不変

**Given** pipeline を実行する
**When** stdout / stderr の進捗出力（`[iter N/M]` 等）を採取する
**Then** 採取結果は本変更前とバイト単位で一致する

#### Scenario: pipelineId を持たない state からの再開が従来通り動作する

**Given** `pipelineId` を持たない（legacy）かつ再開可能な state
**When** そのジョブを resume する
**Then** 従来と同一の pipeline が再構築され、同一の開始 step から再開される
