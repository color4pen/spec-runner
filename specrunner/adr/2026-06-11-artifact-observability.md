# 成果物の lineage を journal 専有で記録し、JobState.version を 2 に上げ、StepName を string に拡張する

**Date**: 2026-06-11
**Status**: accepted

## Context

記述子化 R1〜R4（pipeline-identity / pipeline-descriptor / pipeline-roles-neutral-engine / step-io-contracts、2026-06-04 archive 済み）により、各 step は `reads()` / `writes()` で入出力を `IoRef[]` として宣言している。R5 はこの宣言を観測に接続する: 成果物の lineage（どの artifact がどの step のどの入力から生まれたか）と工程ごとの cost 帰属を `job show` で可視化する。

本変更が決断した設計上の争点は次の 4 点である。

1. **lineage の格納先**: journal（`events.jsonl`）に appendするか、projection（`state.json`）に materialize するか。
2. **`JobState.version` の扱い**: 構造フィールドの実質変更を伴わない変更で version を上げる意味と、移行（migration）の実体は何か。
3. **`StepName` の型契約**: 読み出し経路の任意工程名受理と、標準 pipeline の whitelist 検証をどう分離するか。
4. **content hash 計算の置き場**: `RuntimeStrategy` seam に追加するか、executor が直接 I/O するか。

## Decision

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

`fold()` は `type: "lineage"` を `FoldResult.lineage: LineageRecord[]` に集約する。`state.json`（projection）には lineage を一切 materialize しない。`job show` は journal を直接読む経路で lineage を取得する。

lineage は本質的に append-only な事実列であり、projection に持たせると再構成・移行・サイズ管理の責務が増える。journal は既に content-addressable な事実列の置き場として確立しており、`fold()` は未知 record type を黙って無視するため後方互換も自動的に成立する。

### D2: state version を 1 → 2 に上げる。移行は reader/writer 契約シグナルの identity shim

`JobState.version` を `1` → `2` に上げる。本変更は `state.json` の**フィールド構造**を変えないが、reader/writer の**契約**（任意工程名の受理、lineage record の理解）を変える。version はその契約世代を表す。

移行の実体は read 経路の後方互換 shim:

- `validateJobState` は `version` が `1` または `2` を受理し、`1` を `2` に正規化する（フィールド変換なし）。
- `buildInitialJobState` は `version: 2` を書く。
- `events.jsonl` 側は lineage record の不在・旧 record-type 名（例 `"history"`）に対して例外を投げず読める。

本変更は「新コードが旧フォーマットを読む」**後方互換（backward compatibility）** である（request 内の「前方互換」表記は不正確）。旧コードに戻す場合、旧コードは `version: 2` を reject する——これは前方互換の**非対象**であり、version bump 自体が後方非互換のシグナルである。

### D3: `StepName` を `string` へ拡張し、whitelist は標準記述子検証に残す

- `src/state/schema.ts` の `StepName` type alias を `string` に拡張する。
- `STEP_NAMES` / `AGENT_STEP_NAMES` / `CLI_STEP_NAMES` 配列と compile guard は維持する（標準記述子の単一真実）。
- 読み出し経路（`toStepName()` の読み出し用分岐、executor の timeout 経路等）は任意工程名で throw しない素通しに切り替える。
- 標準 pipeline 記述子の step 名検証（`isStandardStepName()` 相当）は whitelist を維持する。

runtime は既に任意名を受理しているため、変更の中心は型 alias と読み出し経路の throw 除去であり、影響範囲は小さい。

### D4: content hash 計算は `RuntimeStrategy` の seam として追加する

`RuntimeStrategy` に artifact digest seam を追加する:

```ts
digestArtifacts(refs: { path: string }[], cwd: string, branch: string | null): Promise<ArtifactRef[]>
```

- **LocalRuntime**: 各 ref の `path.join(cwd, ref.path)` を読み `sha256` を `"sha256:<hex>"` 形式で返す。不在・読めない場合は `hash: null`。
- **ManagedRuntime**: paths を保持し `hash: null` を返す（`captureHeadSha` が null を返すのと同じ縮退方針）。

content hash は I/O であり pure な `reads()` / `writes()` 内では計算できない。既存の step artifact lifecycle seam（`captureHeadSha` / `prepareStepArtifacts` / `validateStepInputs`）と同じ層に置くことで、runtime 分岐が executor に漏れることを防ぐ。

### D5: lineage 記録は `finalizeStep`（best-effort）、表示は journal 直読

- **記録**: `StepExecutor.finalizeStep` の成功経路で `step.reads(state, deps)` / `step.writes(state, deps)` を集め、`deps.runtimeStrategy.digestArtifacts` で hash を得て `LineageRecord` を構築し、journal へ append する（`appendLineage`）。失敗は best-effort で握り潰し、step 完了を妨げない（usage.json append と同じ方針）。
- **表示**: `job show` は change dir を特定し、`events.jsonl` から lineage を直読し、`usage.json` から step 別 cost を集計して追加セクションを描画する。既存 key-field 行は不変。

### D6: `job show` の出力は追加のみ

既存 key-field 行（Job ID / Status / Branch / Step / Created / Updated / Log）を byte 単位で不変に保ち、その後に lineage / cost セクションを追加する。lineage / cost が空のときはセクションを空表示または省略する。他コマンド（`ps` / `usage` 等）の出力は一切変更しない。

## Alternatives Considered

### Alt-D1: StepRun に `artifacts` field を追加（projection を増やす案）

- **Pros**: `job show` が `load()` 経由で lineage を得られ、journal 直読のコードパスが不要になる。
- **Cons**: `state.json` の再構成・移行・サイズ管理の責務が増える。projection の hot path と型に lineage が漏れる。
- **Why not**: architect 判断「lineage は journal 側に記録し、projection の責務を増やさない」に反する。

### Alt-D1b: lineage を独立ファイル `lineage.jsonl` に分離

- **Pros**: journal と lineage を別ファイルで管理できる。
- **Cons**: ファイルを増やすと minimal-deps / 単一 journal の利点を損なう。journal と同じ append-only 性質・同じ commit 単位で十分。
- **Why not**: ファイル増加のコストに対するメリットが無い。

### Alt-D2: version=1 のまま据え置き、lineage は journal record の有無で判定

- **Pros**: 移行 shim が不要になる。
- **Cons**: requirement 4 が version bump と移行を明示要求している。「lineage-aware か否か」を journal の中身に結合させると判定が脆くなる。
- **Why not**: version はリーダ/ライタ契約世代を表すべきであり、将来の非 identity 変更の seam を確立する価値がある。

### Alt-D3: whitelist を完全撤廃

- **Pros**: 型定義がシンプルになる。
- **Cons**: 標準 pipeline の記述子整合性チェック（compile guard / 検証）を失う。
- **Why not**: `string` への拡張は読み出し経路の受理のみを対象とし、標準記述子の検証は whitelist を維持すれば両立する。

### Alt-D4: executor が直接 `fs` で hash を計算する

- **Pros**: 実装が最小。`RuntimeStrategy` に seam を追加しない。
- **Cons**: managed runtime では cwd に local file が無く、executor 直 `fs` は managed で必ず失敗する。runtime 分岐が executor に漏れる。
- **Why not**: `RuntimeStrategy` seam に置けば各 runtime が自分の artifact の在処を知っており、`prepareStepArtifacts` / `validateStepInputs` と対称になる（D4）。

### Alt-D4b: git object hash（blob sha）を流用

- **Pros**: 未 commit ファイルでも git が管理するオブジェクトとして一貫して扱える。
- **Cons**: 未 commit の output や managed の縮退を一様に扱えず、content addressing の意味（内容ハッシュ）を seam で統一する方が単純。
- **Why not**: `sha256` content hash の方が commit 状態に依存せず、不在を `null` で一様に表現できる。

## Consequences

### Positive

- step の入出力宣言（R4）が観測に接続され、「どの artifact がどの step から生まれたか」が `job show` で確認できるようになる。
- lineage を journal 専有にすることで、projection の型・サイズ・移行責務が増えない。
- version 2 の導入により、将来の非 identity 変更に対する移行 seam が確立される。
- `StepName` を string に広げることで、任意工程名を持つカスタム pipeline の記録も読み出しできる。

### Negative

- `RuntimeStrategy` interface に `digestArtifacts` が追加され、実装クラス（`LocalRuntime` / `ManagedRuntime`）に実装コストが発生する。
- managed runtime では hash が `null` となり、content addressing が成立しない（paths のみ記録）。
- `StepName` を `string` に広げると、誤った step 名の混入を型で検出できなくなる（標準記述子の compile guard で補完）。
- version 2 を書いた state は旧コード（version=1 のみ受理）で読めない。これは仕様上の後方非互換シグナルである。

### Known Debt / Deferred

- managed runtime での content hash（git blob sha 等による代替）は対象外。managed では paths のみ記録する仕様として許容する。
- `job show` が worktree 内のアクティブ実行 job に対して lineage を表示できない（`resolveChangeDir` は `repoRoot` のみ検索）。アーカイブ後の閲覧が主用途のため許容。
- `job show` の lineage / cost セクションのテストカバレッジ（TC-001 / TC-005 / TC-006）は部分的。`finalizeStep → appendLineage` 経路と `job show` 出力セクションの統合テストは将来追加する。
- content hash 計算が大きな source file で I/O コスト増になる可能性 → best-effort・step 完了をブロックしない設計とし、宣言済み reads/writes に限定することで緩和。

## References

- Request: `specrunner/changes/artifact-observability/request.md`
- Design: `specrunner/changes/artifact-observability/design.md`
- Spec: `specrunner/changes/artifact-observability/spec.md`
- Related: `specrunner/adr/2026-06-04-step-io-contracts.md`（reads/writes 宣言の基盤）
- Related: `specrunner/adr/2026-06-01-runtime-strategy-artifact-lifecycle.md`（RuntimeStrategy seam の先行委譲）
- Related: `specrunner/adr/2026-05-25-usage-json-cost-tracking.md`（usage.json によるコスト記録）
- Implementation: `src/state/artifact-types.ts`・`src/state/schema.ts`・`src/store/event-journal.ts`・`src/store/job-state-store.ts`・`src/core/port/runtime-strategy.ts`・`src/core/runtime/local.ts`・`src/core/runtime/managed.ts`・`src/core/step/executor.ts`・`src/core/step/step-names.ts`・`src/cli/job-show.ts`
