# Spec: 成果物の lineage と工程ごとの cost 帰属の可視化

## Requirements

### Requirement: 成果物の lineage を step 完了時に journal へ記録する

step が正常完了したとき、システムは「その step が宣言した outputs（`writes()`）」と「その step が宣言した inputs（`reads()`）」の対応関係を、各 artifact の content hash（内容ハッシュ）付きで `events.jsonl`（append-only journal）に 1 件の lineage record として MUST 記録する。lineage record は projection（`state.json`）には materialize しない。content hash が取得できない artifact（managed runtime / ファイル不在 / 任意入力の不在）については hash を `null` として記録する。

#### Scenario: 標準 step 完了で lineage record が追記される

**Given** local runtime で design step が `request.md` を入力に `design.md` / `spec.md` / `tasks.md` を出力して正常完了する
**When** StepExecutor が当該 step を finalize する
**Then** `specrunner/changes/<slug>/events.jsonl` に `type: "lineage"` の record が 1 件追記され、その record は producer step 名・各 output の path と sha256 content hash・各 input の path と sha256 content hash を含む

#### Scenario: content hash が取得できない artifact は null で記録される

**Given** ある step の宣言 output に対応するファイルが finalize 時点で存在しない、または managed runtime で実行されている
**When** lineage record を構築する
**Then** 当該 artifact の hash は `null` として記録され、step の完了・後続遷移は妨げられない

#### Scenario: lineage 記録の失敗は step 完了を妨げない

**Given** lineage record の hash 計算または追記が失敗する
**When** step が正常完了している
**Then** step の verdict 記録・状態遷移はそのまま成立し、lineage の欠落のみが生じる（best-effort）

### Requirement: lineage 記録は観測専用で実行に影響しない

lineage の記録・読み出しは、step の実行・pipeline の遷移・生成される artifact の内容を MUST 変更しない。lineage に基づく short-circuit / cache / 実行最適化は導入しない。

#### Scenario: 標準 pipeline の挙動が lineage 導入後も不変

**Given** 標準 pipeline の同一 request
**When** lineage 記録機能を有効にして実行する
**Then** step の遷移列・各 step の verdict・生成 artifact は lineage 導入前と同一である

### Requirement: `job show` で lineage と step 別 cost を表示する

`job show <slug|jobId>` は、当該 job の lineage（各 artifact の生成元 step と入力）と step ごとの cost（`usage.json` の step 別集計）を MUST 表示する。表示は追加セクションとして行い、既存の key-field 出力行（Job ID / Status / Branch / Step / Created / Updated / Log）は変更しない。lineage / cost のデータが存在しない場合、追加セクションは空表示または省略され、既存行は不変である。

#### Scenario: lineage と cost を持つ job の表示

**Given** lineage record と step 別 `usage.json` を持つ job
**When** `job show <slug>` を実行する
**Then** 既存の key-field 行に加えて、artifact の生成元 step と入力を示す lineage セクションと、step ごとの token / USD cost を示す cost セクションが表示される

#### Scenario: lineage を持たない旧 job の表示

**Given** lineage record を持たない archive 済みの旧 job
**When** `job show <slug>` を実行する
**Then** 既存の key-field 行は従来どおり表示され、lineage / cost セクションは空または省略され、コマンドは exit 0 で完了する

### Requirement: 任意工程名を含む記録を読める

システムは、標準 pipeline の whitelist に含まれない任意工程名を持つ step 記録（`state.json` の `step`、`events.jsonl` の step-attempt / lineage record）を、読み込み時に例外を投げずに MUST 受理する。標準記述子（標準 pipeline 定義）の step 名検証は引き続き whitelist で行う。

#### Scenario: 非標準工程名の記録が読める

**Given** `events.jsonl` に whitelist 外の工程名（例: `custom-stage`）を持つ step-attempt record が含まれる
**When** その job state を読み込む
**Then** 読み込みは例外なく完了し、当該工程名がそのまま保持される

#### Scenario: 標準記述子の検証は whitelist を維持

**Given** 標準 pipeline 記述子の step 名検証
**When** whitelist 外の工程名が標準記述子に現れる
**Then** 標準記述子側の検証は従来どおり当該名を不正として扱う（読み出し経路の受理とは独立）

### Requirement: 旧 version の state を読み込み時に移行する

`JobState.version` を上げたうえで、システムは旧 version の `state.json` を読み込み時に新 version へ MUST 移行する（後方互換: 新コードが旧フォーマットを読む）。移行はフィールドの構造変換を伴わない identity 変換であり、旧 version を拒否せず新 version として受理する。`events.jsonl` の旧 record（lineage record を含まない、および旧 record-type 名を持つもの）も例外なく読める。

#### Scenario: 旧 version の archive サンプルが移行で読める

**Given** 旧 version の `state.json` と `events.jsonl` を持つ既存 archive
**When** その job state を読み込む
**Then** 読み込みは例外なく完了し、得られる state の version は新 version であり、lineage を持たないことを除き従来どおりの内容を保持する

#### Scenario: 新規 job は新 version で書かれる

**Given** 新規 job の bootstrap
**When** 初期 state を永続化する
**Then** `state.json` の version は新 version である
