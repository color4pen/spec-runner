# Tasks: permissionScope 宣言 pipeline で forbidden 空のとき run 準備で warning を出す

> 依存順: T-01（pure module）→ T-02（配線）。T-03 は T-01 後、T-04 は T-02 後。T-05 は最後に既存テストの回帰確認。
> `applyScopeConfig`（`src/core/pipeline/resolve-scope.ts`）は編集しない（pure 変換契約の維持）。

## T-01: pure module `scope-warning.ts` を追加する

- [x] `src/core/pipeline/scope-warning.ts`（新規）に、副作用のない pure 関数として以下を実装する（logWarn 等のログ呼び出しを一切含めない）:
  - `scopeConfigEmptyWarning(descriptor: PipelineDescriptor): string | null`
    - `descriptor.permissionScope === undefined` → `null` を返す。
    - `descriptor.permissionScope.forbidden.length > 0` → `null` を返す。
    - `permissionScope` あり かつ `forbidden.length === 0` → warning 文言（string）を返す。
    - 文言は `descriptor.id` を埋め込み、(a) scope breach 検出が実質無効であること、(b) `pipeline.<id>.forbiddenSurfaces` を設定すれば有効化されること、を含める。テストで安定 assert できるよう、`pipeline.${descriptor.id}.forbiddenSurfaces` という config キー文字列と、検出が無効である旨の語を必ず含める。
  - `scopeConfigWarningForJob(jobState: JobState, config: SpecRunnerConfig): string | null`
    - `getPipelineDescriptor(getPipelineId(jobState))` で base descriptor を解決する。
    - `applyScopeConfig(base, config)` で scope 解決済み descriptor を得る。
    - `scopeConfigEmptyWarning(scoped)` の結果をそのまま返す。
- [x] 判定は `descriptor.permissionScope !== undefined && forbidden.length === 0` の一般形とし、`fast` 等の profile 名分岐を作らない。
- [x] import: `PipelineDescriptor`（`./types.js`）, `applyScopeConfig`（`./resolve-scope.js`）, `getPipelineDescriptor`（`./registry.js`）, `getPipelineId`（`../../state/pipeline-id.js`）, `JobState`（`../../state/schema.js`）, `SpecRunnerConfig`（`../../config/schema.js`）。

**Acceptance Criteria**:
- `scopeConfigEmptyWarning` は「permissionScope あり + forbidden 空」でのみ非 null を返し、それ以外（permissionScope なし / forbidden ≥ 1）では null を返す。
- 返す文言に対象 pipeline id と `pipeline.<id>.forbiddenSurfaces` 相当の config キー文字列が含まれる。
- 両関数ともログ副作用を持たない（呼び出しても stderr に何も出力しない）。
- `typecheck` が green。

## T-02: `CommandRunner.execute()` の run 準備点に emission を配線する

- [x] `src/core/command/runner.ts` で `scopeConfigWarningForJob` を `../pipeline/scope-warning.js` から**直接** import する（`../pipeline/index.js` 経由にしない）。
- [x] `execute()` の Step 5（`buildPipelineForJob` 呼び出しの直前、setupWorkspace / buildDeps 成功後）で `scopeConfigWarningForJob(jobState, config)` を 1 回だけ呼び、返り値が非 null のときのみ `logWarn(warning)` を呼ぶ。`config` は `prepare()` から受け取った prepared config を用いる。
- [x] warning の emission は `buildPipelineForJob` の内部には置かない（run 準備点に固定して、呼び出し回数に依存させない）。module-level の可変フラグ等の抑止 state を導入しない。
- [x] warning のみで、exit code / 状態遷移 / 既存の出力（stdout JSON 等）は変更しない。

**Acceptance Criteria**:
- run（`PipelineRunCommand`）/ resume（`ResumeCommand`）双方が通る `execute()` の run 準備点で、1 run につき最大 1 回 warning が emit される。
- setupWorkspace 失敗で早期 return する run では warning が出ない。
- `typecheck` が green。

## T-03: pure 判定の単体テストを追加する

- [x] `tests/unit/core/pipeline/scope-warning.test.ts`（新規）に `scopeConfigEmptyWarning` / `scopeConfigWarningForJob` のテストを追加する。
- [x] permissionScope 宣言 + forbidden 空の解決後 descriptor（fast + surfaces 無し config を `applyScopeConfig` に通したもの、または同等の fixture descriptor）で非 null（warning 文言）を返し、文言に pipeline id と `forbiddenSurfaces` を含む config キーが含まれることを固定する。
- [x] forbidden を 1 件以上宣言した config を通した fast 解決後 descriptor で null を返すことを固定する。
- [x] permissionScope を持たない standard / design-only descriptor で null を返すことを固定する。
- [x] `scopeConfigWarningForJob` に fast の jobState + surfaces 無し config を渡すと非 null、standard の jobState を渡すと null を返すことを固定する。

**Acceptance Criteria**:
- 「permissionScope 宣言 + forbidden 空 → warning」「forbidden ≥ 1 → warning なし」「permissionScope なし → warning なし」がテストで固定される。
- 判定は解決後 descriptor に対して行われる（静的 `FAST_DESCRIPTOR` の空 forbidden を config 解決前に誤判定していないこと）。

## T-04: emission の run 準備結合テスト（1 run 1 warning）を追加する

- [x] `tests/unit/core/command/runner.test.ts` に、`jobState.pipelineId="fast"` かつ forbidden 未設定 config の PrepareResult で `execute()` を 1 回実行し、stderr に scope warning が**ちょうど 1 回**出力されることを固定するテストを追加する（既存の pipeline index mock・stderr spy を活用。既存テストは変更しない）。
- [x] 同ファイルで、standard（permissionScope なし）の既定 PrepareResult で `execute()` を実行したとき scope warning が出ないことを固定する。
- [x] warning が `buildPipelineForJob` の呼び出し回数に依存しないこと（emission が run 準備点にあり pure 判定関数はログを出さないこと）を、T-03 の「pure 関数はログ副作用なし」テストと本 execute レベルの「1 run 1 回」テストの組で担保する。

**Acceptance Criteria**:
- fast + forbidden 空の 1 run で scope warning が stderr にちょうど 1 回出力される。
- standard の run では scope warning が出ない。
- warning の内容に `pipeline.fast.forbiddenSurfaces` 相当のキーと検出無効の旨が含まれる。

## T-05: 既存テストの回帰確認

- [x] `src/core/pipeline/resolve-scope.ts` を編集していないこと、`tests/unit/core/pipeline/resolve-scope.test.ts` が無変更で green であることを確認する（`applyScopeConfig` の pure 契約 = permissionScope なし → 参照同一 が不変）。
- [x] `tests/unit/core/command/runner.test.ts`（既存ケース）/ `tests/unit/core/command/pipeline-run-gate.test.ts` が無変更で green であることを確認する（standard 経路では warning が出ず、fast fixture の prepare 系テストのアサーションに warning が影響しない）。
- [x] `bun run typecheck && bun run test` が green。

**Acceptance Criteria**:
- request の受け入れ基準（permissionScope 宣言 + forbidden 空で warning / forbidden ≥ 1 で warning なし / standard で warning なし / 1 run 1 回 / `applyScopeConfig` 既存契約不変 / 既存テスト無変更 green / `typecheck && test` green）がテストで固定される。
- `bun run typecheck && bun run test` が green。
