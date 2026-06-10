# Tasks: 成果物の lineage と工程ごとの cost 帰属の可視化（記述子化 R5）

## T-01: `StepName` を `string` へ拡張し whitelist を標準記述子検証に残す（D3）

- [x] `src/state/schema.ts` の `export type StepName` を `string` に拡張する
- [x] `STEP_NAMES` / `AGENT_STEP_NAMES` / `CLI_STEP_NAMES`（`src/kernel/step-names.ts`）と AgentStepName 互換の compile guard は維持する
- [x] `src/core/step/step-names.ts` を整理する: 標準記述子検証用の `isStandardStepName()` 相当を用意し、`toStepName()` の whitelist throw に依存する読み出し/記録経路（例: `executor.ts` の timeout 経路の `resumePoint.step` 設定）を任意工程名で throw しない形に切り替える
- [x] `ResumePoint.step` など `StepName` 消費箇所が string 拡張後も型整合することを確認する

**Acceptance Criteria**:
- whitelist 外の工程名を含む `state.json` / `events.jsonl` の読み込みが例外を投げない
- 標準 pipeline 記述子の step 名検証は whitelist で従来どおり機能する
- `typecheck` が green

## T-02: `JobState.version` を 1→2 に上げ後方互換移行を実装する（D2）

- [x] `src/state/schema.ts`: `JobState.version` の literal を `2` にする
- [x] `validateJobState` を `version` が `1` または `2` を受理し `1`→`2` に正規化する（フィールド構造変換なし）形に変更する。`2` 以外/未対応は従来どおり reject
- [x] `src/store/job-state-store.ts` の `buildInitialJobState` が `version: 2` を書くようにする
- [x] `loadSplitLayout` の検証経路で version 正規化が validate 前または validate 内で行われ、旧 version が拒否されないことを確認する
- [x] 用語を後方互換（backward compatibility）で統一する（コメント / 記述）

**Acceptance Criteria**:
- 既存 archive の v1 `state.json` を読み込むと例外なく version `2` の state が得られる
- 新規 bootstrap した state の version が `2`
- 既存 state 読み込みの内容（lineage を除く）が従来と同一
- `typecheck && test` が green

## T-03: journal に lineage record type と content addressing を追加する（D1）

- [x] `src/store/event-journal.ts` に `LineageRecord` / `ArtifactRef` を定義し `EventRecord` union に追加する
- [x] `fold()` を `type: "lineage"` 対応にし、`FoldResult` に `lineage: LineageRecord[]` を追加する（`state.json` / `NormalizedJobState` には materialize しない）
- [x] `fold()` が旧 record-type 名（例 `"history"`）および lineage 不在の旧 `events.jsonl` を例外なく読めることを保証する（必要なら旧 record-type alias を追加）
- [x] `JobStateStore` に `appendLineage(record)` を追加する（`appendInterruption` と同様、`events.jsonl` のみ append し `state.json` を更新しない）

**Acceptance Criteria**:
- lineage record が append → `fold()` で `FoldResult.lineage` に round-trip する
- lineage 追記後も `state.json` に新フィールドが増えない
- 旧 record-type を含む既存 `events.jsonl` の `fold()` が例外を投げない
- `typecheck && test` が green

## T-04: `RuntimeStrategy.digestArtifacts` seam を追加する（D4）

- [x] `src/core/port/runtime-strategy.ts` に `digestArtifacts(refs, cwd, branch): Promise<ArtifactRef[]>` を追加する
- [x] LocalRuntime（`src/core/runtime/local.ts`）: 各 ref のファイル内容を `sha256` で `"sha256:<hex>"` 形式にして返す。不在/読めない場合は `hash: null`
- [x] ManagedRuntime（`src/core/runtime/managed.ts`）: paths を保持し `hash: null` を返す
- [x] content hash 用のハッシュ計算は raw bytes の sha256 とする（`src/core/agent/hash.ts` は object 用のため、file 内容用の最小ヘルパを用意 or `node:crypto` 直接利用）

**Acceptance Criteria**:
- LocalRuntime が同一内容に対し安定した sha256 を返す
- ManagedRuntime / ファイル不在で `hash: null` を返し例外を投げない
- `typecheck && test` が green

## T-05: `StepExecutor.finalizeStep` で lineage を記録する（D5）

- [x] `src/core/step/executor.ts` の `finalizeStep` 成功経路で `step.reads?.(state, deps)` / `step.writes?.(state, deps)` を収集する
- [x] `deps.runtimeStrategy.digestArtifacts` で outputs / inputs の hash を取得し `LineageRecord`（producer step ← inputs、output/input の path + hash）を構築する
- [x] `store.appendLineage` で journal へ追記する。記録は best-effort とし、hash 計算・追記の失敗が step 完了・遷移を妨げないようにする（usage.json append と同じ握り潰し方針）
- [x] agent step / CLI step の双方で動作することを確認する（writes() 未宣言 step はスキップ）

**Acceptance Criteria**:
- 標準 pipeline の step が正常完了すると `events.jsonl` に当該 step の lineage record が 1 件記録される（宣言 outputs←inputs と hash を含む）
- lineage 記録の失敗時も step の verdict 記録・遷移は成立する
- 既存の step 遷移・verdict・生成 artifact が lineage 導入前と同一（観測専用）
- `typecheck && test` が green

## T-06: `job show` に lineage と step 別 cost を表示する（D5 / D6）

- [x] `src/cli/job-show.ts` で対象 job の change dir（active → archive、`src/core/command/usage-show.ts` の `resolveUsagePath` と同じ解決方針）を特定する
- [x] `events.jsonl` から lineage を読み（journal 直読、projection を経由しない）、artifact の生成元 step と入力を示すセクションを追加描画する
- [x] `usage.json` を読み step 別に token を集計し、`src/core/usage/pricing.ts` の `computeCostUsd` / `formatUsd` で USD を併記する cost セクションを追加描画する
- [x] 既存 key-field 行（Job ID / Status / Branch / Step / Created / Updated / Log）を不変に保ち、lineage / cost が空のときはセクションを空表示または省略する
- [x] `job show` と `specrunner usage` の役割分担（単一 job summary vs invocation 詳細 / archive 横断）が出力上で混同しないようにする

**Acceptance Criteria**:
- lineage と step 別 `usage.json` を持つ job で `job show` が lineage と step 別 cost（token + USD）を表示する
- lineage を持たない旧 archive で既存行が不変・lineage/cost セクションが空または省略され exit 0
- `ps` / `usage` 等の他コマンド出力は不変
- `typecheck && test` が green

## T-07: テストと検証（実 archive サンプルでの後方互換確認を含む）

- [x] 単体: v1→v2 移行（`validateJobState`）、`fold()` の lineage 集約 + 旧 record-type 読み込み、`digestArtifacts`（local/managed/不在）、step 別 cost 集計、`job show` 描画
- [x] 統合: pipeline 実行で lineage が記録されること、`job show` 出力に lineage / cost が現れること
- [x] 既存 archive の `state.json` + `events.jsonl` サンプル（旧 record-type を含むもの）を読み込み、例外なく version `2` として読めることを固定する
- [x] `job show` の snapshot のみ更新し、他コマンドの snapshot が不変であることを確認する

**Acceptance Criteria**:
- `job show` で lineage と step 別 cost が表示される
- 任意工程名を含む記録が読める
- 旧 version の `state.json` / `events.jsonl` が移行で読める（既存 archive のサンプルで検証）
- 既存の標準 pipeline の挙動・画面出力（`job show` の追加セクションを除く）が変わらない
- `typecheck && test` が green
