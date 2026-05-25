# Test Cases: cost-efficiency-pipeline

## 凡例

- **Priority**: must / should / could
- **Source**: 導出元 (request.md 受け入れ基準 / tasks.md タスク番号 / design.md 決定番号)

---

## Category: Path Utilities

### TC-01 draftUsageJsonPath が正しいパスを返す

- **Priority**: must
- **Source**: tasks.md#T-01

```
GIVEN: slug = "foo"
WHEN: draftUsageJsonPath("foo") を呼ぶ
THEN: "specrunner/drafts/foo/usage.json" を返す
```

### TC-02 usageJsonPath が正しいパスを返す

- **Priority**: must
- **Source**: tasks.md#T-01

```
GIVEN: slug = "foo"
WHEN: usageJsonPath("foo") を呼ぶ
THEN: "specrunner/changes/foo/usage.json" を返す
```

### TC-03 既存 export に影響がない

- **Priority**: must
- **Source**: tasks.md#T-01

```
GIVEN: paths.ts の既存 export (draftPath, changeFolderPath 等)
WHEN: draftUsageJsonPath / usageJsonPath を追加した後に bun run typecheck を実行する
THEN: typecheck が green で既存 export の型シグネチャが変わらない
```

---

## Category: Usage Store — readUsageFile

### TC-04 ファイルが存在しない場合に空構造を返す

- **Priority**: must
- **Source**: tasks.md#T-02, request.md#受け入れ基準

```
GIVEN: 指定パスに usage.json が存在しない
WHEN: readUsageFile(path) を呼ぶ
THEN: { commandInvocations: [] } を返す (例外を throw しない)
```

### TC-05 既存 usage.json を正しくパースして返す

- **Priority**: must
- **Source**: tasks.md#T-02

```
GIVEN: usage.json に commandInvocations が 1 entry 含まれている
WHEN: readUsageFile(path) を呼ぶ
THEN: entry が 1 件含まれる UsageFile を返す
```

---

## Category: Usage Store — appendInvocation

### TC-06 新規ファイルへの追記で 1 entry が書き込まれる

- **Priority**: must
- **Source**: tasks.md#T-02

```
GIVEN: usage.json が存在しない
WHEN: appendInvocation(path, entry) を 1 回呼ぶ
THEN: usage.json が作成され commandInvocations に entry が 1 件含まれる
```

### TC-07 2 回の追記で 2 entry が蓄積される (上書きされない)

- **Priority**: must
- **Source**: tasks.md#T-02, request.md#受け入れ基準

```
GIVEN: usage.json が存在しない
WHEN: appendInvocation を entry1, entry2 の順に 2 回呼ぶ
THEN: commandInvocations に entry1 と entry2 の 2 件が存在し、entry1 が失われていない
```

### TC-08 既存 entry を保持したまま新 entry が追加される

- **Priority**: must
- **Source**: tasks.md#T-02

```
GIVEN: usage.json に既存 entry が 3 件含まれている
WHEN: appendInvocation で新 entry を追加する
THEN: commandInvocations が 4 件になり既存 3 件が変更されていない
```

### TC-09 atomic write によりファイルが壊れない

- **Priority**: should
- **Source**: design.md#D2

```
GIVEN: usage.json が存在する
WHEN: appendInvocation を呼ぶ
THEN: atomicWriteJson を経由して書き込まれる (一時ファイル → rename パターン)
```

---

## Category: Usage Store — deriveFromJobState

### TC-10 各 step の全 attempt が entry 化される

- **Priority**: must
- **Source**: tasks.md#T-02

```
GIVEN: JobState に spec-review (1 attempt) / implementer (2 attempts) の steps がある
WHEN: deriveFromJobState(state) を呼ぶ
THEN: 3 件の CommandInvocation が返る (command = "job", stepName が各 step に対応)
```

### TC-11 modelUsage が undefined の StepRun は modelUsage: null で記録される

- **Priority**: must
- **Source**: tasks.md#T-02, request.md#要件4

```
GIVEN: JobState に modelUsage が undefined の StepRun がある
WHEN: deriveFromJobState(state) を呼ぶ
THEN: 該当 entry の modelUsage が null である (entry 自体は存在し stepName / timestamp / jobId は含む)
```

### TC-12 返される entries が timestamp 昇順でソートされている

- **Priority**: should
- **Source**: tasks.md#T-02

```
GIVEN: JobState に timestamp 順が混在する複数 StepRun がある
WHEN: deriveFromJobState(state) を呼ぶ
THEN: 返される entries が endedAt 昇順で並んでいる
```

### TC-13 steps が空の state は空配列を返す

- **Priority**: should
- **Source**: tasks.md#T-02

```
GIVEN: JobState.steps が空 ({})
WHEN: deriveFromJobState(state) を呼ぶ
THEN: 空の CommandInvocation[] が返る
```

---

## Category: OneShotQueryResult — modelUsage 抽出

### TC-14 SDK result に modelUsage がある場合に正しく抽出される

- **Priority**: must
- **Source**: tasks.md#T-03, design.md#D1

```
GIVEN: SDKResultSuccess.modelUsage に { "claude-opus-4-5": { inputTokens: 100, outputTokens: 50, cacheReadInputTokens: 80, cacheCreationInputTokens: 20 } } が含まれる
WHEN: queryOneShot() を呼ぶ
THEN: OneShotQueryResult.modelUsage が同じ構造で返る
```

### TC-15 SDK result に modelUsage が空の場合に undefined を返す

- **Priority**: must
- **Source**: tasks.md#T-03

```
GIVEN: SDKResultSuccess.modelUsage が空オブジェクト ({}) または不在
WHEN: queryOneShot() を呼ぶ
THEN: OneShotQueryResult.modelUsage が undefined である
```

### TC-16 既存の text / sessionId / stopReason が引き続き返される

- **Priority**: must
- **Source**: tasks.md#T-03

```
GIVEN: SDKResultSuccess に result / session_id / subtype が含まれる
WHEN: queryOneShot() を呼ぶ
THEN: OneShotQueryResult.text / sessionId / stopReason が正しく返る (modelUsage 追加の副作用なし)
```

---

## Category: Draft Tracking — request review

### TC-17 request review 実行後に drafts/<slug>/usage.json に entry が追記される

- **Priority**: must
- **Source**: request.md#受け入れ基準, tasks.md#T-04

```
GIVEN: slug = "my-feature" の draft が存在し usage.json は未作成
WHEN: specrunner request review my-feature を実行する
THEN: specrunner/drafts/my-feature/usage.json が作成され commandInvocations に command = "request-review" の entry が 1 件ある
```

### TC-18 同一 draft に対して 2 回 review すると 2 entry が蓄積される

- **Priority**: must
- **Source**: request.md#受け入れ基準, tasks.md#T-04

```
GIVEN: slug = "my-feature" の draft が存在する
WHEN: specrunner request review my-feature を 2 回実行する
THEN: drafts/my-feature/usage.json の commandInvocations に 2 件の "request-review" entry が存在し、1 件目が失われていない
```

### TC-19 entry に command / timestamp / modelUsage が含まれる

- **Priority**: must
- **Source**: tasks.md#T-04, design.md#D2

```
GIVEN: request review が正常完了した
WHEN: 生成された entry を検査する
THEN: command = "request-review"、timestamp が ISO 8601 形式、modelUsage が Record<string, ModelUsage> または null
```

### TC-20 file path で実行した場合に slug 抽出成功時は追記される

- **Priority**: should
- **Source**: tasks.md#T-04, design.md#D3

```
GIVEN: request review の引数が "specrunner/drafts/my-feature/request.md" (file path 形式)
WHEN: specrunner request review specrunner/drafts/my-feature/request.md を実行する
THEN: drafts/my-feature/usage.json に entry が追記される
```

### TC-21 slug 解決できない file path で実行した場合は silent skip される

- **Priority**: must
- **Source**: request.md#要件2, tasks.md#T-04

```
GIVEN: request review の引数が slug に対応しない任意の file path
WHEN: specrunner request review /tmp/other/request.md を実行する
THEN: usage.json への追記が silent skip され (warning ログのみ)、review の stdout 出力は通常通り表示される
```

### TC-22 usage tracking 失敗時に review の本体出力がブロックされない

- **Priority**: must
- **Source**: tasks.md#T-04, request.md#要件2

```
GIVEN: usage.json への書き込みが何らかのエラーで失敗する状況
WHEN: specrunner request review <slug> を実行する
THEN: review 結果が stdout に正常表示され、exit code が usage error に左右されない
```

---

## Category: Draft Tracking — request generate

### TC-23 request generate 実行後に drafts/<slug>/usage.json に entry が追記される

- **Priority**: must
- **Source**: request.md#受け入れ基準, tasks.md#T-04

```
GIVEN: 新規 slug の draft が未作成
WHEN: specrunner request generate "新機能の説明文" を実行する
THEN: specrunner/drafts/<slug>/usage.json が作成され commandInvocations に command = "request-generate" の entry が 1 件ある
```

### TC-24 generate で生成される entry に modelUsage が含まれる

- **Priority**: must
- **Source**: tasks.md#T-04

```
GIVEN: LLM 呼び出しが modelUsage を返す
WHEN: request generate が完了する
THEN: entry.modelUsage に model 別 token 数が記録されている
```

---

## Category: setupWorkspace — usage.json コピー

### TC-25 draft に usage.json がある場合 job start 後に change folder にコピーされる

- **Priority**: must
- **Source**: request.md#受け入れ基準, tasks.md#T-05

```
GIVEN: specrunner/drafts/<slug>/usage.json に 2 件の entry が存在する
WHEN: specrunner job start <slug> を実行する
THEN: specrunner/changes/<slug>/usage.json が作成され、draft の 2 件の entry がそのまま含まれている
```

### TC-26 draft に usage.json がない場合 job start が正常完了する (skip)

- **Priority**: must
- **Source**: tasks.md#T-05

```
GIVEN: specrunner/drafts/<slug>/usage.json が存在しない
WHEN: specrunner job start <slug> を実行する
THEN: エラーなく job が開始される (usage.json コピーが silent skip)
```

### TC-27 コピーされた usage.json が git staging に含まれる

- **Priority**: must
- **Source**: tasks.md#T-05

```
GIVEN: draft の usage.json が存在し job start が実行された
WHEN: setupWorkspace 後の git status を確認する
THEN: specrunner/changes/<slug>/usage.json が staged (git add 済)
```

### TC-28 local runtime と managed runtime の両方でコピーが行われる

- **Priority**: should
- **Source**: tasks.md#T-05, design.md#D4

```
GIVEN: local runtime / managed runtime それぞれで job start を実行する
WHEN: draft に usage.json が存在する
THEN: 両 runtime ともに changes/<slug>/usage.json が作成される
```

---

## Category: Finish Derive — pipeline usage

### TC-29 finish 後に changes/<slug>/usage.json に各 step の entry が追加される

- **Priority**: must
- **Source**: request.md#受け入れ基準, tasks.md#T-06

```
GIVEN: pipeline が spec-review / implementer / code-review の 3 step を完走した
WHEN: specrunner finish を実行する (Phase 1)
THEN: changes/<slug>/usage.json に 3 件以上の command = "job" の entry が追加されている (各 step が entry 化)
```

### TC-30 draft 段階の entries が保持されたまま pipeline entries が append される

- **Priority**: must
- **Source**: tasks.md#T-06

```
GIVEN: changes/<slug>/usage.json に request-review / request-generate の entry が既にある
WHEN: finish Phase 1 で pipeline usage を derive する
THEN: 既存の request-review / request-generate entries が失われず、pipeline の "job" entries が末尾に追加されている
```

### TC-31 archive 後に archive/<YYYY-MM-DD>-<slug>/usage.json が存在する

- **Priority**: must
- **Source**: request.md#受け入れ基準, tasks.md#T-06

```
GIVEN: finish が正常完了した
WHEN: archive ディレクトリを確認する
THEN: archive/<YYYY-MM-DD>-<slug>/usage.json が存在し (git mv で自動的に含まれる)、pipeline entries が記録されている
```

### TC-32 change folder が存在しない場合 (PR 既 merge 等) は skip される

- **Priority**: should
- **Source**: tasks.md#T-06

```
GIVEN: changes/<slug>/ が存在しない状態で finish を実行する
WHEN: deriveAndWriteUsage が呼ばれる
THEN: derive が skip され finish が中断されない
```

### TC-33 steps 記録がない state では usage derive が skip される

- **Priority**: should
- **Source**: tasks.md#T-06

```
GIVEN: state.steps が空の JobState に対して deriveAndWriteUsage を実行する
WHEN: entries が 0 件になる
THEN: usage.json への追記がなく finish が正常に続行する
```

### TC-34 derive 失敗時に finish が中断されない (best-effort)

- **Priority**: must
- **Source**: tasks.md#T-06, design.md#D5

```
GIVEN: usage.json 書き込みが例外で失敗する状況
WHEN: finish Phase 1 の deriveAndWriteUsage が失敗する
THEN: warning ログが出力され finish の後続処理 (archiveChangeFolder / commitArchive) が継続する
```

### TC-35 managed runtime で modelUsage undefined の step は modelUsage: null で記録される

- **Priority**: must
- **Source**: request.md#要件4, design.md#D5

```
GIVEN: managed runtime の StepRun で readSessionUsage() が undefined を返した
WHEN: deriveFromJobState で entry を生成する
THEN: entry.modelUsage が null (entry 自体は存在し jobId / stepName / timestamp が含まれる)
```

---

## Category: CLI — specrunner usage <slug>

### TC-36 slug 指定で total / step 別 / model 別 token 数が表示される

- **Priority**: must
- **Source**: request.md#受け入れ基準, tasks.md#T-07

```
GIVEN: archive/<date>-<slug>/usage.json に request-review 2 件 + job 3 件の entries がある
WHEN: specrunner usage <slug> を実行する
THEN: 各 entry の command / timestamp / model / inputTokens / outputTokens / cacheReadInputTokens / cacheCreationInputTokens が行ごとに表示され、末尾に model 別 total が表示される
```

### TC-37 active change folder の usage.json も表示対象になる

- **Priority**: must
- **Source**: tasks.md#T-07, design.md#D6

```
GIVEN: changes/<slug>/usage.json が存在し archive にはない
WHEN: specrunner usage <slug> を実行する
THEN: changes/<slug>/usage.json が読み込まれて表示される (archive 優先だが active も解決)
```

### TC-38 同一 slug が複数日付の archive に存在する場合は最新日付が優先される

- **Priority**: must
- **Source**: request.md#要件5, tasks.md#T-07

```
GIVEN: archive/2026-05-20-<slug>/ と archive/2026-05-25-<slug>/ の両方が存在する
WHEN: specrunner usage <slug> を実行する
THEN: 2026-05-25 の archive の usage.json が使用される
```

### TC-39 USD 換算が表示されない

- **Priority**: must
- **Source**: request.md#スコープ外

```
GIVEN: usage.json に modelUsage が記録されている
WHEN: specrunner usage <slug> を実行する
THEN: 出力に "$" 記号や金額が含まれず、token 数のみ表示される
```

---

## Category: CLI — specrunner usage (引数なし)

### TC-40 全 archive 横断のサマリが表示される

- **Priority**: must
- **Source**: request.md#受け入れ基準, tasks.md#T-07

```
GIVEN: archive/ に 3 slug の usage.json がある
WHEN: specrunner usage を引数なしで実行する
THEN: slug ごとの total token 数 (inputTokens / outputTokens / cacheRead / cacheCreate) が 1 行ずつ表示される
```

### TC-41 usage.json が存在しない archive は silent skip される

- **Priority**: must
- **Source**: request.md#受け入れ基準, tasks.md#T-07

```
GIVEN: archive/ に usage.json ありの slug 2 件と usage.json なしの slug 3 件がある
WHEN: specrunner usage を実行する
THEN: usage.json ありの 2 件のみ集計表示され、3 件がスキップされた旨のメッセージが末尾に表示される (error にならない)
```

### TC-42 archive が 0 件の場合でもエラーにならない

- **Priority**: should
- **Source**: tasks.md#T-07

```
GIVEN: archive/ ディレクトリが空またはディレクトリ自体がない
WHEN: specrunner usage を実行する
THEN: 空のサマリが表示され exit code 0 で終了する
```

### TC-43 サマリの末尾に grand total が表示される

- **Priority**: should
- **Source**: design.md#D6

```
GIVEN: archive/ に 3 slug の usage.json がある
WHEN: specrunner usage を実行する
THEN: 末尾に全 slug の合計 token 数が表示される
```

---

## Category: Step Model Config

### TC-44 config.steps.<step>.model が step 単位で解決される

- **Priority**: must
- **Source**: request.md#受け入れ基準, tasks.md#T-08

```
GIVEN: config.steps["spec-review"].model = "claude-sonnet-4-6" が設定されている
WHEN: getStepExecutionConfig(config, "spec-review", stepDefaults) を呼ぶ
THEN: 返される config.model が "claude-sonnet-4-6" である
```

### TC-45 config.steps.defaults.model が step-level 未設定の step に適用される

- **Priority**: must
- **Source**: tasks.md#T-08

```
GIVEN: config.steps.defaults.model = "claude-haiku-4-5" が設定され、
       implementer step の model 設定がない
WHEN: getStepExecutionConfig(config, "implementer", stepDefaults) を呼ぶ
THEN: 返される config.model が "claude-haiku-4-5" である
```

### TC-46 step-level 設定が defaults より優先される

- **Priority**: must
- **Source**: tasks.md#T-08

```
GIVEN: config.steps.defaults.model = "claude-haiku-4-5" かつ
       config.steps["code-review"].model = "claude-opus-4-6" が設定されている
WHEN: getStepExecutionConfig(config, "code-review", stepDefaults) を呼ぶ
THEN: 返される config.model が "claude-opus-4-6" である (step-level が優先)
```

---

## Category: Edge Cases / エラーハンドリング

### TC-47 commandInvocations の command フィールドが union type の値に限定される

- **Priority**: should
- **Source**: tasks.md#T-02, design.md#D2

```
GIVEN: CommandInvocation 型の定義
WHEN: bun run typecheck を実行する
THEN: command に "request-review" | "request-generate" | "job" 以外の値を代入するとコンパイルエラーになる
```

### TC-48 modelUsage の各フィールドが 4 種の token 数を持つ

- **Priority**: should
- **Source**: design.md#D1

```
GIVEN: ModelUsage 型の定義
WHEN: modelUsage のフィールドを確認する
THEN: inputTokens / outputTokens / cacheReadInputTokens / cacheCreationInputTokens の 4 フィールドを持つ
```

### TC-49 bun run typecheck && bun run test が green

- **Priority**: must
- **Source**: request.md#受け入れ基準

```
GIVEN: T-01 〜 T-09 の全実装が完了している
WHEN: bun run typecheck && bun run test を実行する
THEN: typecheck エラーなし / test failure なし
```

### TC-50 delta spec の 3 ファイルが存在する

- **Priority**: should
- **Source**: tasks.md#T-10

```
GIVEN: T-10 の実装が完了している
WHEN: specrunner/changes/cost-efficiency-pipeline/specs/ を確認する
THEN: cli-commands/spec.md / one-shot-query/spec.md / cli-finish-command/spec.md の 3 ファイルが存在し、各ファイルに requirement / scenario 形式の記述がある
```
