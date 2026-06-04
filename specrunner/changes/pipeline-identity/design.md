# Design: JobState に pipeline 同一性（pipelineId）を記録する

## Context

spec-runner の pipeline 定義（工程の並び・遷移・繰り返し組）はソース固定で 1 種類のみ存在する。`createStandardPipeline`（`src/core/pipeline/run.ts`）が `STANDARD_TRANSITIONS` / `STANDARD_LOOP_NAMES` / `STANDARD_LOOP_FIXER_PAIRS` を組み立て、`run` も `resume` も無条件にこの 1 つを再構築して実行する。

`JobState`（`src/state/schema.ts`）は「どの pipeline 定義で実行したか」を記録していない。将来複数の pipeline 定義を扱えるようにすると、再開時にどの定義で再構築すべきかを state ファイルから復元できない。

その土台として、ジョブと pipeline 定義の対応を `JobState` に記録する。本変更はその最小の一歩であり、フィールドの追加と起動時の記録までに限定し、挙動は変えない。

現状の制約・既存パターン:

- `JobState` の永続化は `JobStateStore`（`src/store/job-state-store.ts`）が単一の権威。新規ジョブは `JobStateStore.create()` が初期 state を構築し atomic write する。`create()` は `PipelineRunCommand.prepare()`（`src/core/command/pipeline-run.ts`）から呼ばれ、これがジョブ起動点である。
- 既存 state ファイルの後方互換は `validateJobState()` が担う。optional フィールドの欠落許容には 2 つの先行事例がある：
  - `worktreePath`：欠落時は undefined のまま放置し、検証を加えない（top-level optional の事例）。
  - `request.slug`：欠落時に validateJobState が `null` を充填し、意味的な解決は純粋関数 `getJobSlug()`（`src/state/job-slug.ts`）に委ねる（解決ヘルパの事例）。
- `src/kernel/` は最下層であり `src/state/schema.ts` も `src/kernel/step-names.ts` を import する。`state` / `store` / `core/pipeline` から循環なく参照できる共有定数の置き場所である。

## Goals / Non-Goals

**Goals**:

- `JobState` に optional な `pipelineId` フィールドを追加する。
- ジョブ起動時に、現行の pipeline 識別子（`"standard"`）を `pipelineId` に記録する。
- `pipelineId` を持たない既存 state ファイルを壊さず読め、欠落時の解決値を `"standard"` として一意に定義する。
- pipeline 実行・再開・画面出力の挙動を不変に保つ。

**Non-Goals**:

- `pipelineId` に基づく pipeline 定義の選択（registry lookup）。本変更では `createStandardPipeline` の無条件再構築を維持する。
- 再開の役割導出ロジック（`resolveResumeStep`）および pipeline エンジン（`Pipeline`）の変更。
- job status FSM（`VALID_TRANSITIONS` / `lifecycle`）の変更。pipeline 非依存のため触れない。
- `pipelineId` を closed union 型に固定すること（registry 導入前に値域を閉じない）。

## Decisions

### D1. `pipelineId` は top-level の optional フィールドとして追加する

`JobState` 直下に `pipelineId?: string` を追加する。型は closed union ではなく `string` とする。

**Rationale**: 識別対象は「ジョブ全体がどの pipeline 定義で動いたか」であり、`request` や `steps` のような部分構造ではなく state 全体に対応する属性のため top-level が自然。値域を `string` に開いておくのは、将来 registry が導入する未知の id を型変更なしに受け入れるため。closed union（例 `"standard"` のみ）にすると registry 導入時に schema の破壊的変更が必要になる。

**Alternatives considered**:

- `request.pipelineId` として `RequestInfo` に入れる：pipeline は request ではなくジョブ実行の属性。request は入力、pipeline 定義は実行戦略であり層が異なる。
- `"standard"` の closed union 型：型安全だが registry を前提とする値域拡張で破壊的変更になる。Non-Goals に反する。

### D2. canonical 値 `"standard"` は kernel 層の定数として一元管理する

`src/kernel/` に pipeline 識別子定数（`STANDARD_PIPELINE_ID = "standard"`）を定義し、記録側・解決側の双方がこれを参照する。

**Rationale**: `"standard"` の文字列が「起動時記録」と「欠落時解決」の 2 箇所に重複すると drift する。`src/kernel/step-names.ts` と同様に最下層へ single source of truth を置くことで、`src/state/`（解決ヘルパ）・`src/store/`（記録）・`src/core/pipeline/`（将来の参照）から循環依存なく import できる。

**Alternatives considered**:

- `src/core/pipeline/` に定数を置く：`src/state/` から参照すると state → core の逆方向依存が生じる。state は低層であるべき。
- 各所に文字列リテラル直書き：drift リスク。Goals の「解決値を一意に定義」に反する。

### D3. 欠落時の解決は純粋関数ヘルパ `getPipelineId(state)` に委ね、validateJobState は eager 書き換えをしない

`src/state/` に `getPipelineId(state): string`（`state.pipelineId ?? STANDARD_PIPELINE_ID`）を新設する。`validateJobState` は `pipelineId` 欠落をエラーにせず、値の充填や書き換えも行わない（`worktreePath` と同じく optional として放置）。発見性のため schema にコメントのみ追加する。

**Rationale**: 解決ロジックを 1 箇所（`getPipelineId`）に集約し、消費側は常にこのヘルパ経由で解決値を得る。これは `getJobSlug` の確立パターンと一致する。validateJobState で eager に `"standard"` を書き込まない理由は、(a) 読み込みが state ファイルを書き換えない純粋検証であるべきこと、(b) 既存ファイルの欠落をそのまま保ち「記録されたものだけが真」を維持できること（可逆性）。

**Alternatives considered**:

- `validateJobState` で欠落時に `"standard"` を eager 充填（`slug` 方式）：解決は単純な `?? "standard"` のため複雑な派生がなく、読み取り時 mutation の副作用を避けられるヘルパ方式の利点が上回る。`slug` が eager なのは nested object の検証都合であり、top-level の `pipelineId` には当てはまらない。
- 消費側で各々 `?? "standard"` を書く：解決値定義が分散し drift する。

### D4. 起動時記録は `JobStateStore.create` の optional 引数で行い、標準 pipeline を選ぶ command が明示的に値を渡す

`JobStateStore.create` の params に optional な `pipelineId?: string` を追加し、未指定時は `STANDARD_PIPELINE_ID` を default として初期 state に書き込む。`PipelineRunCommand.prepare` は標準 pipeline を構築する起動点なので、`STANDARD_PIPELINE_ID` を明示的に渡して「このジョブは standard pipeline で動く」という意図を記録する。

**Rationale**: `create` は単一の state 生成路であり、`step: "init"` 等の初期値をすでに焼き込んでいる。ここに optional + default を加えることで、既存の多数の `create` 呼び出し（テスト含む）を変更せずとも全新規ジョブが `pipelineId` を持つ。一方で「どの pipeline か」を最終的に決めるのは pipeline を組み立てる command 層であるべきなので、`PipelineRunCommand` からは明示的に渡す。registry 導入時はこの引数の供給元を registry に差し替えるだけで済む。

**Alternatives considered**:

- `create` が常に `"standard"` をハードコードし command は触らない：差分は最小だが「pipeline 選択の責務が store 層に固定される」点が registry 導入時に逆戻り。optional 引数 + default なら両立する。
- `PipelineRunCommand` で create 後に `update()` して書き込む：初期 state が一瞬 `pipelineId` 不在になり、書き込みが 2 回に分かれる。create で atomic に確定する方が一貫する。

### D5. 実行・再開・画面出力は `pipelineId` を読まない（挙動不変）

`createStandardPipeline` による無条件再構築、`resolveResumeStep` による役割導出、`Pipeline` の遷移・loop・stdout 出力はいずれも変更しない。`pipelineId` は記録専用フィールドとして導入し、本変更ではどの分岐条件にも使用しない。

**Rationale**: 本変更のスコープは「フィールド追加 + 起動時記録」。`pipelineId` に基づく選択は registry 導入を前提とするため含めない。読み取り側を一切変えないことで、画面出力のバイト単位スナップショットと再開互換が自動的に保たれる。

**Alternatives considered**:

- 記録と同時に `createStandardPipeline` を `pipelineId` でガードする：registry がない現状では `"standard"` 以外を取り得ず、分岐は dead code。Non-Goals に反する。

## Risks / Trade-offs

- **[Risk] 既存 state ファイルの欠落フィールドを参照する箇所が `undefined` を直接扱い、`"standard"` 解決を経由しない** → 消費側は必ず `getPipelineId(state)` を経由する規律とし、本変更では消費側を増やさない（記録のみ）。将来 registry が `getPipelineId` を入口にする。
- **[Risk] `JobStateStore.create` への引数追加で既存呼び出しが壊れる** → optional + default `STANDARD_PIPELINE_ID` とするため既存呼び出しは無改修。型的にも後方互換。
- **[Trade-off] 全新規ジョブ（テスト由来含む）が `pipelineId: "standard"` を持つようになる** → 望ましい挙動。state-store の round-trip / list テストは `pipelineId` の有無に依存しないため影響しない。state スナップショット系テストがあれば期待値更新が必要になり得る点のみ tasks で確認する。
- **[Trade-off] `pipelineId` を `string` に開くため型レベルの値検証がない** → registry 導入時に値域検証を追加する前提。現時点で唯一値 `"standard"` のため実害なし。

## Open Questions

- なし（architect 評価済みの設計判断で確定済み。registry / 選択ロジックは後続 request で扱う）。
