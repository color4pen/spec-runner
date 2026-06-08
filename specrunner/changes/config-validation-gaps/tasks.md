# Implementation Tasks: config-validation-gaps

> 既存の手書き validator + `CONFIG_INVALID` throw パターンを踏襲する（zod 不使用）。
> 各 throw は既存 schema.ts と同じ inline 形式
> `throw Object.assign(new Error("CONFIG_INVALID: <msg>"), { code: "CONFIG_INVALID" });` を展開する（新規ヘルパ関数は作らない）。

## Phase 1: `validateConfig` のフィールド検証追加（`src/config/schema.ts`）

- [x] **T1.1**: `agents` の shape 検証ブロックを追加する（design D1）
  - 配置: `pipeline` 検証ブロック近傍。既存 section と同じ独立 `if` ブロックスタイル。
  - `obj["agents"] !== undefined && obj["agents"] !== null` のとき:
    - `typeof obj["agents"] !== "object"` → `CONFIG_INVALID: agents must be an object.`
    - 各エントリ `[stepName, rec]` について `rec` が `undefined`/`null` なら `continue`（Partial Record の欠落 key を許容）
    - `typeof rec !== "object"` → `CONFIG_INVALID: agents.${stepName} must be an object.`
    - `agentId` / `definitionHash` / `lastSyncedAt` の各 field が `typeof !== "string"` → `CONFIG_INVALID: agents.${stepName}.${field} must be a string.`
  - 空 object `{}` は valid（throw しない）。

- [x] **T1.2**: `environment` の shape 検証ブロックを追加する（design D2）
  - `obj["environment"] !== undefined && obj["environment"] !== null` のとき:
    - `typeof obj["environment"] !== "object"` → `CONFIG_INVALID: environment must be an object.`
    - `id` / `lastSyncedAt` が `typeof !== "string"` → `CONFIG_INVALID: environment.${field} must be a string.`
  - 未設定は throw しない。

- [x] **T1.3**: `specReview.pollIntervalMs` の検証ブロックを追加する（design D3）
  - `obj["specReview"] !== undefined && obj["specReview"] !== null` のとき:
    - `typeof obj["specReview"] !== "object"` → `CONFIG_INVALID: specReview must be an object.`
    - `pollIntervalMs !== undefined` のとき `typeof !== "number" || !Number.isInteger(v) || v < 1` → `CONFIG_INVALID: specReview.pollIntervalMs must be a positive integer.`
  - 既存 `archive.mergeWaitPollIntervalMs` validator と同一パターン（正の整数, >= 1）。`pollIntervalMs` 未設定は throw しない。

- [x] **T1.4**: `pipeline` のオブジェクト型ガードを追加する（design D4）
  - 既存の maxRetries チェック（schema.ts L315-323 付近）の**手前**に挿入:
    - `typeof obj["pipeline"] !== "object"` → `Object.assign(new Error("CONFIG_INVALID: pipeline must be an object."), { code: "CONFIG_INVALID" })`
  - 既存の `maxRetries` メッセージ・挙動は変更しない（後方互換）。

## Phase 2: config 外 JSON parse の shape check

- [x] **T2.1**: `loadCredentials` に shape check を追加する（`src/core/credentials/credentials-io.ts`, design D6）
  - L49-54 の `try { return JSON.parse(raw) as CredentialsFile } catch { return {} }` を restructure する:
    - parse のみ try/catch で囲み、構文エラーは `return {}`（後方互換）。
    - parse 成功後、**catch の外**で shape check し throw を伝播させる:
      - `typeof parsed !== "object" || parsed === null` → `CONFIG_INVALID: credentials file must be a JSON object.`
      - `creds["github"] !== undefined` のとき、`github` が object かつ `github.token` が string でなければ → `CONFIG_INVALID: credentials file: github.token must be a string.`
    - 検証通過後 `return parsed as CredentialsFile`。
  - throw は `Object.assign(new Error("CONFIG_INVALID: ..."), { code: "CONFIG_INVALID" })` 形式。
  - `anthropic` の検証は追加しない（request 未指定 / 過度な検証回避）。
  - **対象は L50（`loadCredentials`）のみ**。L67-68（`saveCredentials` の merge-read）は変更しない。

- [x] **T2.2**: cancel sidecar の jobId typeof ガードを追加する（`src/core/cancel/runner.ts`, design D7）
  - `resolveWorktreePathForJob`（L87 付近）の guard を:
    - `typeof sidecar["worktreePath"] === "string" && sidecar["jobId"] === state.jobId`
    - → `typeof sidecar["worktreePath"] === "string" && typeof sidecar["jobId"] === "string" && sidecar["jobId"] === state.jobId`
  - best-effort 設計を維持（throw しない。不一致時は convention パスへフォールスルー）。

- [x] **T2.3**: resume sidecar の pid typeof チェックを確認する（`src/core/resume/safety.ts`, design D8）
  - `isStaleRunning`（L53）の `pid != null && typeof pid === "number"` が既存で要件を満たすことを確認する。
  - **コード変更なし**（充足済み）。確認結果は T3.4 の回帰テストで証跡化する。

## Phase 3: テスト追加

- [x] **T3.1**: `validateConfig` のフィールド検証テストを追加する（`tests/config/schema.test.ts`, design D9）
  - 既存 `makeMinimalRawConfig(overrides)` helper を再利用。`describe` ブロックを追加。
  - `agents`:
    - 非 object（`agents: "x"`）→ `/CONFIG_INVALID/` throw
    - エントリが非 object（`agents: { design: "x" }`）→ throw
    - `agentId` 欠落 / 非 string、`definitionHash` 非 string、`lastSyncedAt` 非 string → throw
    - valid（`agents: { design: { agentId: "a", definitionHash: "h", lastSyncedAt: "2026-01-01T00:00:00.000Z" } }`）→ not throw
    - 空（`agents: {}`）→ not throw
  - `environment`:
    - 非 object / `id` 非 string / `lastSyncedAt` 非 string → throw
    - valid（`{ id: "e", lastSyncedAt: "2026-01-01T00:00:00.000Z" }`）→ not throw
    - 未設定 → not throw
  - `specReview.pollIntervalMs`:
    - `0` / `-1` / `1.5` / `"10000"` → throw
    - `10000` → not throw
    - 未設定（`specReview: {}` および section 不在）→ not throw
  - `pipeline`:
    - `pipeline: "fast"`（非 object）→ throw
    - 既存 maxRetries テスト（TC-037/TC-038 等）が引き続き green

- [x] **T3.2**: credentials shape check のテストを追加する（`tests/core/credentials/credentials-io.test.ts`, 新規, design D10）
  - temp dir + `XDG_CONFIG_HOME` 上書きで credentials.json を書いて `loadCredentials()` を呼ぶ（既存 credentials テストの env 操作 / cleanup パターンに合わせる。`beforeEach`/`afterEach` で env 退避・temp 削除）。
  - valid（`{ github: { token: "ghp_x" } }`）→ そのまま返る
  - anthropic-only（`{ anthropic: { apiKey: "sk-x" } }`）→ throw しない
  - 不正 shape（`{ github: { token: 123 } }` / `{ github: {} }` / `{ github: "x" }`）→ throw
  - malformed JSON（`"{ not json"`）→ `{}`（throw しない）
  - ファイル不在 → `{}`

- [x] **T3.3**: cancel sidecar guard のテストを追加する（`tests/unit/core/cancel/runner.test.ts`, design D11）
  - 既存 `makeJob` / fixture を使い、liveness sidecar の `jobId` を非 string（数値）にしたケースを作る。
  - `cancelSingleJob`（worktree cleanup 経由で `resolveWorktreePathForJob` が走る）が throw せず best-effort で完了し、sidecar の `worktreePath` を採用せず convention 由来パスへフォールスルーすることを確認する。

- [x] **T3.4**: resume sidecar pid guard の回帰テストを追加する（`tests/unit/core/resume/safety.test.ts`, design D8/D11）
  - sidecar の `pid` が非 number（`"123"` 等）のとき `isStaleRunning(state, sidecarPath)` が `true`（stale）にフォールバックすることを確認する。

## Phase 4: Delta spec（`specrunner/changes/config-validation-gaps/specs/`）

- [x] **T4.1**: `specs/cli-config-store/spec.md` を作成済みであることを確認する（本 change に同梱）
  - ADDED Requirement: `validateConfig は型付き全フィールドの shape を検証する`（agents / environment / specReview.pollIntervalMs / pipeline 型ガード）。

- [x] **T4.2**: `specs/credential-store/spec.md` を作成済みであることを確認する（本 change に同梱）
  - ADDED Requirement: `credentials file は load 時に shape を検証する`。

## Phase 5: 検証

- [x] **T5.1**: `bun run typecheck` が green
- [x] **T5.2**: `bun run lint` が green
- [x] **T5.3**: `bun run test` が green（新規テスト + 既存テスト非回帰）
- [x] **T5.4**: 対象テストの個別実行で確認
  - `bun run test tests/config/schema.test.ts`
  - `bun run test tests/core/credentials/credentials-io.test.ts`
  - `bun run test tests/unit/core/cancel/runner.test.ts`
  - `bun run test tests/unit/core/resume/safety.test.ts`

## Notes for Implementer

- **最小差分**: 既存 section の inline throw スタイルを 1:1 で踏襲する。共通ヘルパ抽出 / final cast の解消はスコープ外（別件）。
- **後方互換が最重要**: 全検証は「フィールドが存在する場合のみ」発火させ、未設定（optional）は必ず通す。既存の valid config（agents/environment 未設定、正しい値）が落ちないこと。
- **credentials は throw、sidecar は guard 強化**: credentials は不正 shape で throw（早期エラー）。cancel/resume の sidecar は best-effort 設計を壊さないため guard 強化に留め throw しない（design D7/D8）。
- **resume/safety.ts は無編集**: 既存 pid typeof チェックで充足。回帰テストのみ追加する。
- **検証順序**: `pipeline` の object 型ガードは必ず既存 maxRetries チェックの**手前**に置く（後ろだと型ガードの意味がない）。
