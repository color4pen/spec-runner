# Design: 成果物の lineage と工程ごとの cost 帰属の可視化（記述子化 R5）

## Context

記述子化 R1〜R4 により、pipeline は一級の記述子を持ち、各 step は `reads()` / `writes()` で inputs / outputs を `IoRef[]`（`src/core/port/step-types.ts`）として宣言している。R5 はこの宣言を観測に接続する。

現状の関連構造:

- **journal と projection の分離**: ジョブ状態は `events.jsonl`（append-only journal、`src/store/event-journal.ts`）に記録され、`fold()` が `state.json`（projection）を再構成する。journal の record は tagged union `EventRecord = StepAttemptRecord | TransitionRecord | InterruptionRecord`。`fold()` は未知の `type` を黙って無視する。
- **cost**: agent step 完了時に `StepExecutor.finalizeStep`（`src/core/step/executor.ts`）が `changes/<slug>/usage.json` へ `CommandInvocation`（`stepName` + `modelUsage`）を append する。`src/core/usage/pricing.ts` が model 別 token を USD に換算する。`specrunner usage` 系は archive 横断 / invocation 単位の集計を提供する。
- **StepName**: `src/kernel/step-names.ts` の whitelist 配列から導出される closed union（`src/state/schema.ts` line 18）。ただし `validateJobState` / `fold()` は runtime では step を `string` として扱い、任意名を既に受理している。`toStepName()`（`src/core/step/step-names.ts`）のみが whitelist 外で throw する。
- **version**: `JobState.version` は `1` 固定。`validateJobState` は `version !== 1` を reject し、`buildInitialJobState` は `1` を書く。旧 archive はすべて version 1。旧 `events.jsonl` には `{"type":"history",...}`（現行の `"transition"` の旧名）record が存在する。
- **artifact hash の seam**: `RuntimeStrategy`（`src/core/port/runtime-strategy.ts`）は `captureHeadSha` / `validateStepInputs` / `verifyFindingRefs` を持ち、いずれも managed runtime では null / no-op に縮退する。content hash 計算（I/O）はこの seam の追加が自然。
- **`job show`**: `src/cli/job-show.ts` は key-field（Job ID / Status / Branch / Step / Created / Updated / Log）のみ表示する。

役割分担（finding #3 への明示）: `job show` は単一 job 視点の lineage + step 別 cost summary を表示する。`specrunner usage <slug>` は invocation 単位の詳細、`specrunner usage` は archive 横断集計を提供する。本変更は後者 2 つの出力を変更しない。

## Goals / Non-Goals

**Goals**:

- step 完了時に「宣言 outputs ← 宣言 inputs」の対応を content hash 付きで journal に記録する（lineage）。
- `job show` で lineage（artifact の生成元 step と入力）と step 別 cost を表示する。
- `StepName` を `string` へ拡張し、任意工程名の記録を読めるようにする（whitelist 検証は標準記述子側に残す）。
- `JobState.version` を上げ、旧 version の `state.json` / `events.jsonl` を読み込み時に後方互換で受理する。

**Non-Goals**:

- methodology-packaging（H1）・並列分岐（H2）。
- `usage.json` のフォーマット変更。
- lineage に基づく実行最適化 / cache / short-circuit（観測のみ）。requirement 5 の明示判断: 全工程が gitWrite のため cache の適用対象が無く、誤判定で branch / 記録が乖離するため導入しない。
- lineage を `state.json`（projection）へ materialize すること。

## Decisions

### D1: lineage は journal の新 record type として記録し、projection を増やさない

`events.jsonl` の `EventRecord` union に `LineageRecord` を追加する。

```
LineageRecord {
  type: "lineage";
  step: string;            // producer step 名
  ts: string;              // ISO8601（step の completedAt）
  outputs: ArtifactRef[];  // step.writes() 由来
  inputs: ArtifactRef[];   // step.reads() 由来
}
ArtifactRef {
  path: string;            // worktree-relative（IoRef.path）
  hash: string | null;     // "sha256:<hex>" content hash、取得不能時は null
  required?: boolean;      // inputs のみ（IoRef.required）
}
```

`fold()` は `type: "lineage"` を `FoldResult.lineage: LineageRecord[]` に集約する。`state.json`（`NormalizedJobState` / projection）には lineage を一切 materialize しない。`job show` は journal を直接読む経路（D5）で lineage を取得する。

**Rationale**: architect 判断「lineage は journal（append-only）側に記録し、projection の責務を増やさない」に直結する。lineage は本質的に append-only な事実列であり、projection に持たせると再構成・移行・サイズ管理の責務が増える。journal は既に content-addressable な事実列の置き場として確立している。

**Alternatives considered**:
- *StepRun に `artifacts` field を追加*（projection を増やす案、finding #1 の対案）: 却下。`state.json` の再構成・移行・サイズの責務が増え、architect 判断に反する。
- *lineage を独立ファイル `lineage.jsonl` に分離*: 却下。journal と同じ append-only 性質・同じ commit 単位で十分であり、ファイルを増やすと minimal-deps / 単一 journal の利点を損なう。

### D2: state version の bump はリーダ/ライタ契約のシグナルであり、移行は後方互換 read shim（finding #1 への明示回答）

`JobState.version` を `1` → `2` に上げる。移行は **構造フィールドの変換を伴わない identity 変換**であり、version bump の意味は「この state は lineage を journal に記録し、かつ任意工程名を受理する reader/writer が生成した」というシグナルである。

具体的な「移行」の実体は read 経路の後方互換 shim:

- `validateJobState` は `version` が `1` または `2` を受理し、`1` を `2` に正規化する（フィールド変換なし）。`2` 以外/未対応は従来どおり reject。
- `buildInitialJobState` は `version: 2` を書く。
- `events.jsonl` 側は lineage record の不在・旧 record-type 名（例 `"history"`）に対して例外を投げず読める（D3）。

**Rationale**: finding #1 の指摘「lineage が journal 専有なら state.json の実質変更が無く migration が identity になる。version bump の根拠が不明」に対し、立場を 1 つに固定する。本変更は state.json の*フィールド*は変えないが、reader/writer の*契約*（任意工程名の受理、lineage record の理解）を変える。version はその契約世代を表す。移行の実作業はフィールド書き換えではなく「旧 version を拒否しない read shim」であり、acceptance「旧 version の state が移行で読める」を満たす seam を確立する。これにより次回の非 identity 変更が安価になる。

**Alternatives considered**:
- *version=1 のまま据え置き、lineage は journal record の有無で判定*: 却下。requirement 4 が version bump と移行を明示要求しており、また「lineage-aware か否か」を journal の中身に結合させると判定が脆くなる。
- *用語*: 本変更は「新コードが旧フォーマットを読む」ため **後方互換（backward compatibility）** である（finding #2: request の「前方互換」表記は不正確。設計では後方互換で統一）。

### D3: `StepName` を `string` へ拡張し、whitelist は標準記述子検証に残す

- `src/state/schema.ts` の `export type StepName = ...` を `string` に拡張する。
- `STEP_NAMES` / `AGENT_STEP_NAMES` / `CLI_STEP_NAMES` 配列と AgentStepName 互換の compile guard は維持する（標準記述子の単一真実）。
- 読み出し経路で whitelist throw を除去する: `toStepName()` を「標準記述子検証用の assertion」と「読み出し用の素通し」に分離する。executor の timeout 経路（`resumePoint.step` 設定）など読み出し/記録側は素通しに切り替え、任意工程名で throw しない。
- 標準 pipeline 記述子の step 名検証（`isStandardStepName()` 相当）は whitelist を維持する。

**Rationale**: requirement 3「型安全な whitelist は標準記述子側の検証に残す」に一致。runtime は既に任意名を受理しているため、変更の中心は型 alias と読み出し経路の throw 除去であり、影響範囲は小さい。

**Alternatives considered**:
- *whitelist を完全撤廃*: 却下。標準 pipeline の記述子整合性チェック（compile guard / 検証）を失う。

### D4: content hash 計算は `RuntimeStrategy` の seam として追加する

`RuntimeStrategy` に artifact digest seam を追加する:

```
digestArtifacts(refs: { path: string }[], cwd: string, branch: string | null): Promise<ArtifactRef[]>
```

- **LocalRuntime**: 各 ref の `path.join(cwd, ref.path)` を読み、`sha256` を `"sha256:<hex>"` 形式で返す。不在/読めない場合は `hash: null`。
- **ManagedRuntime**: paths は保持し `hash: null` を返す（`captureHeadSha` が null を返すのと同じ縮退方針）。

**Rationale**: content hash は I/O であり pure な `reads()`/`writes()` 内では計算できない。既存の step artifact lifecycle seam（`captureHeadSha` / `prepareStepArtifacts` / `validateStepInputs`）と同じ層に置くのが一貫する。managed では local file が無いため null 縮退とし、lineage の path 情報のみ残す。

**Alternatives considered**:
- *executor が直接 `fs` で hash*: 却下。managed runtime では cwd に local file が無く、runtime 分岐が executor に漏れる。
- *git object hash（blob sha）を流用*: 却下。未 commit の output や managed の縮退を一様に扱えず、content addressing の意味（内容ハッシュ）を seam で統一する方が単純。

### D5: lineage 記録は `finalizeStep`、表示は journal 直読で行う

- **記録**: `StepExecutor.finalizeStep` の成功経路で、`step.reads(state, deps)` / `step.writes(state, deps)` を集め、`deps.runtimeStrategy.digestArtifacts` で hash を得て `LineageRecord` を構築し、journal へ append する（`JobStateStore` に `appendLineage` を追加。`appendInterruption` と同じく `state.json` を更新しない append-only）。失敗は best-effort で握り潰し step 完了を妨げない（usage.json append と同じ方針）。
- **表示**: `job show` は対象の change dir（active → archive の順、`usage-show` の `resolveUsagePath` と同じ解決方針）を特定し、`events.jsonl` から lineage を読み（journal 直読、projection を経由しない）、`usage.json` から step 別 cost を集計して追加セクションを描画する。既存 key-field 行は不変。

**Rationale**: `finalizeStep` は step.reads/writes と完了タイミングを持つ唯一の合流点であり、usage.json append も既にここで行われている。表示を journal 直読にすることで D1（projection を増やさない）と整合する。

**Alternatives considered**:
- *lineage を `NormalizedJobState` に載せて `load()` 経由で表示*: 却下。load の hot path と projection 型に lineage が漏れ、D1 に反する。

### D6: `job show` の出力は追加のみ（既存出力の非回帰）

既存 key-field 行（Job ID / Status / Branch / Step / Created / Updated / Log）を byte 単位で不変に保ち、その後に lineage / cost セクションを追加する。lineage / cost が空のときはセクションを空表示または省略する。`ps` / `usage` 等の他コマンド出力は一切変更しない。

**Rationale**: acceptance「既存の標準 pipeline の挙動・画面出力が変わらない」を、`job show` への追加と両立させる解釈。回帰対象は他コマンドおよび既存行であり、`job show` の lineage/cost セクションは本変更の意図そのもの。snapshot test の更新は `job show` のみに限定する。

## Risks / Trade-offs

- [Risk] 旧 `events.jsonl` の record-type 名（`"history"`）が現行 `fold()` で無視され、旧 archive の history が空になる → 移行 acceptance「events.jsonl が移行で読める」を満たすため、実装は実 archive サンプルで「例外なく読める」ことを検証し、必要なら `fold()` に旧 record-type alias を加える。lineage 不在は正常。
- [Risk] `StepName` を `string` に広げると、誤った step 名の混入を型で検出できなくなる → 標準記述子側の whitelist 検証と compile guard を維持して標準 pipeline の整合性は担保する。
- [Risk] content hash 計算が大きな source file で I/O コスト増 → best-effort・step 完了をブロックしない設計とし、digest は宣言済みの reads/writes に限定する（全工程ファイルの走査はしない）。
- [Risk] managed runtime では hash が null となり lineage の content addressing が成立しない → 仕様として許容（paths のみ記録）。acceptance は local 標準 pipeline を対象とする。
- [Trade-off] version bump の移行が identity のため「形だけ」に見える → D2 で reader/writer 契約のシグナルとして意味付けし、移行 seam を確立する。

## Open Questions

- lineage record の append 単位を step ごと 1 件（outputs/inputs をまとめる）とするか、artifact ごと複数件とするか。本設計は step ごと 1 件を採用（journal 行数を抑え、producer 視点で読みやすい）。artifact 件数が多い step（implementer）で行が長くなる場合の表示丸めは実装時に判断する。
- `job show` の cost セクションを token のみ表示か USD まで表示か。本設計は `pricing.ts` 既存実装に合わせ token + USD（未知 model は `$?`）を採用する。

## Migration Plan

- **適用**: 新コードは `version: 2` を書き、`validateJobState` は `1`/`2` を受理する。デプロイ後の新規 job は `2`、既存 active / archive は読み込み時に `2` として受理される（フィールド変換なし）。
- **検証**: 既存 archive の `state.json` + `events.jsonl` サンプル（旧 record-type を含むもの）を read して例外が出ないこと、version が `2` になることをテストで固定する。
- **rollback**: 万一旧コードに戻す場合、旧コードは `version: 2` を reject する。これは前方互換の非対象（Non-Goal）であり、本変更は後方互換（新→旧読み）のみを保証する。version bump 自体が後方非互換のシグナルである点を ADR に記録する。
