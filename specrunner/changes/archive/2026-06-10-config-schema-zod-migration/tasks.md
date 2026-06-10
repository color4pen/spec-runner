# Tasks: config schema zod migration

実装対象は `src/config/schema.ts` の `validateConfig` 本体。シグネチャ
`(raw: unknown) => SpecRunnerConfig` と公開 interface・`store.ts` / `migrate.ts` は変更しない。
`zod/v4-mini` から import する（`report-tool.ts` と同じ）。`src/core/port/report-result.ts` /
`src/core/step/report-tool.ts` は触らない（手書き方針維持・スコープ外）。

oracle: `tests/config/schema.test.ts` / `tests/unit/config/schema.test.ts` /
`tests/unit/config/runtime-config.test.ts` / `tests/config/store.test.ts` /
`tests/exit-code-standardization.test.ts` を無改変で green に保つ。

---

## T-01: zod 構造スキーマを定義する

- [x] `configSchema`（zod/v4-mini）を定義し、以下のセクションの型・範囲・enum・必須/任意を宣言する。
  各ノードに「メッセージインベントリ」の legacy reason と一致する custom message を付与する。
- [x] multi-constraint 数値フィールド（型 + int + 範囲）は全 check に同一 message を付与する
  （例: `number(MSG).check(int(MSG), gte(1, MSG))`）。型不一致・非整数・範囲外いずれも同一 reason を返すこと。
- [x] object スキーマは未知キーを strip する既定動作のまま使い、未知トップレベルフィールド（`jobs` 等）を
  error にしない。
- [x] スキーマのキー順は legacy のセクション検証順（runtime → agents → environment → specReview →
  pipeline → steps → models → progress → verification → github → logs → archive）に揃える。

**検証対象セクションとメッセージインベントリ**（`<path> <reason>` 形式。path は動的セグメントを含む）:

| セクション | ルール | reason 文字列 |
|---|---|---|
| version | `=== 1`（必須） | `Config version must be 1.`（※ no-code / 専用扱い、T-02 参照） |
| runtime | `undefined \| "managed" \| "local"` | `must be "managed" or "local".` |
| agents | object（非 object → エラー） | `must be an object.` |
| agents.&lt;k&gt; | null/undefined は許容、else object | `must be an object.` |
| agents.&lt;k&gt;.{agentId,definitionHash,lastSyncedAt} | string | `must be a string.` |
| environment | object | `must be an object.` |
| environment.{id,lastSyncedAt} | string | `must be a string.` |
| specReview | object | `must be an object.` |
| specReview.pollIntervalMs | int ≥ 1（optional） | `must be a positive integer.` |
| pipeline | object | `must be an object.` |
| pipeline.maxRetries | int 1–10（optional） | `must be between 1 and 10.`（※ no-code / 専用扱い、T-02 参照） |
| steps | object | `must be an object.` |
| steps.&lt;k&gt; | null/undefined は許容、else object | `must be an object.` |
| steps.&lt;k&gt;.maxTurns | int ≥ 1 \| null（optional） | `must be a positive integer or null.` |
| steps.&lt;k&gt;.model | 非空 string（optional） | `must be a non-empty string.` |
| steps.&lt;k&gt;.timeoutMs | int ≥ 0 \| null（optional） | `must be a non-negative integer or null.` |
| steps.&lt;k&gt;.byRequestType | object（optional） | `must be an object.` |
| steps.&lt;k&gt;.byRequestType.&lt;t&gt; | null/undefined 許容、else object | `must be an object.` |
| steps.&lt;k&gt;.byRequestType.&lt;t&gt;.{maxTurns,model,timeoutMs} | 上記 step 同様 | 同上 |
| models | object | `must be an object.` |
| models.&lt;m&gt; | object | `must be an object.` |
| models.&lt;m&gt;.provider | `"anthropic" \| "openai"` | `must be "anthropic" or "openai".` |
| progress | object | `must be an object.` |
| progress.heartbeatIntervalSec | int ≥ 0 \| null（optional） | `must be a non-negative integer or null.` |
| verification | object | `must be an object.` |
| verification.commands | array（optional） | `must be an array.` |
| verification.commands[i] | 非空 string \| `{name?: string, run: 非空 string}` | string 違反: `must be a non-empty string.` / union 全滅: `must be a string or object with a run field.` |
| verification.commands[i].run | 非空 string | `must be a non-empty string.` |
| verification.commands[i].name | string（optional） | `must be a string.` |
| github | object | `must be an object.` |
| github.host | 非空 string（optional） | `must be a non-empty string.` |
| github.apiBaseUrl | 非空 string かつ `https://` 始まり（optional） | `must be a non-empty string.` / `must start with https://.` |
| logs | object | `must be an object.` |
| logs.maxJobs | int 1–1000（optional） | `must be an integer between 1 and 1000.` |
| archive | object | `must be an object.` |
| archive.mergeWaitTimeoutMs | int ≥ 0 \| null（optional） | `must be a non-negative integer or null.` |
| archive.mergeWaitPollIntervalMs | int ≥ 1（optional） | `must be a positive integer.` |
| archive.protectedPaths | array（optional） | `must be an array.` |
| archive.protectedPaths[i] | 非空 string | `must be a non-empty string.` |

備考:
- `agents` / `steps.<k>` / `byRequestType.<t>` の value は `null` を許容する（`nullable`）。空オブジェクト・
  未設定も許容。
- `apiBaseUrl` の `https://` 始まり判定は zod の `check`（refine predicate）で表現する（v4-mini に
  `startsWith` が無い場合）。非空判定と https 判定は別 check として各々に専用 message を付ける。
- `byRequestType` の値スキーマには `byRequestType` フィールドを **含めない**（nested 検出は T-03 の後段で行う）。

**Acceptance Criteria**:
- `configSchema` が上表の型・範囲・enum を網羅し、各ノードに対応 reason の custom message を持つ。
- 妥当な config（`{version:1, agents:{}}` など）で issue が出ない。
- 未知トップレベルフィールドを持つ config で issue が出ない。

## T-02: エラー翻訳層を実装する

- [x] `safeParse` 失敗時に `error.issues[0]` を 1 件取り出し、path を文字列化する path renderer を実装する。
  数値セグメントは `[n]`、文字列セグメントは先頭はそのまま・以降は `.seg`
  （例: `steps.code-review.byRequestType.spec-change.model` / `verification.commands[0].run`）。
- [x] 既定ルール: `CONFIG_INVALID: <path> <issue.message>` を message とし、`.code = "CONFIG_INVALID"` を
  付与した `Error` を throw する。
- [x] **no-code 例外サイトを忠実に再現する**（下表）。

| 条件 | message | `.code` |
|---|---|---|
| root が非オブジェクト（issue path 空 / object 不一致） | `Config must be a JSON object.` | **無し** |
| `version !== 1` | `Config version must be 1.` | **無し** |
| `pipeline.maxRetries` 範囲外 | `CONFIG_INVALID: pipeline.maxRetries must be between 1 and 10.` | **無し** |
| 上記以外の全検証失敗 | `CONFIG_INVALID: <path> <reason>` | `"CONFIG_INVALID"` |

**Acceptance Criteria**:
- `tests/unit/config/schema.test.ts`（TC-037/038、maxRetries）が green。maxRetries 範囲外 error は
  message に `CONFIG_INVALID: pipeline.maxRetries must be between 1 and 10.` を含み `.code` を持たない。
- `tests/unit/config/runtime-config.test.ts` の TC-034（runtime）/ TC-PROG が green
  （`.code === "CONFIG_INVALID"` を assert する分を含む）。
- `tests/config/schema.test.ts` の path 入りメッセージ（agents / environment / specReview /
  byRequestType / steps.* / verification）が全て green。

## T-03: 後段セマンティックチェックを独立関数として実装する

スキーマ検証成功後に raw オブジェクトを走査して実行する。`if-then` 連鎖を `validateConfig` 本体へ
戻さず、独立関数として分離する。

- [x] **model registry チェック**: `BUILTIN_MODEL_REGISTRY` と user `models` をマージし、
  step / byRequestType の `model` が registry に存在するか検証する。不在は
  `CONFIG_INVALID: steps.<k>.model "<m>" is not in the model registry. Add it to config.models.`
  （byRequestType は `steps.<k>.byRequestType.<t>.model` path）。runtime === "managed" で OpenAI provider の
  model は `CONFIG_INVALID: OpenAI model "<m>" cannot be used with runtime "managed".`。いずれも
  `.code = "CONFIG_INVALID"`。
- [x] **byRequestType セマンティクス**:
  - 空文字キー → `CONFIG_INVALID: steps.<k>.byRequestType contains an empty string key.`（code 付き）
  - nested `byRequestType` → `CONFIG_INVALID: steps.<k>.byRequestType.<t>.byRequestType is not allowed (1-level limit).`（code 付き）
  - 未知 request type キー（既知集合 `bug-fix / spec-change / new-feature / refactoring / chore` 以外）
    → throw せず `stderrWrite("[specrunner] warn: steps.<k>.byRequestType.<t> is not a known request type. Known types: ...")` を出力する。
- [x] 既知 request type 集合は legacy（`knownTypes`）と一致させる。

**Acceptance Criteria**:
- `tests/config/schema.test.ts` の byRequestType 群（空キー / nested 1-level limit / registry 不在 /
  managed+openai / 未知キー warning-only）が green。
- `tests/unit/config/schema.test.ts` の step model registry 群が green。
- `tests/config/store.test.ts` の「invalid model → `code: CONFIG_INVALID`」（standalone / merged）が green。
- 未知 request type キーで `validateConfig` は throw しない。

## T-04: validateConfig を 2 層フローに再構成する

- [x] `validateConfig` を「①`configSchema.safeParse` →失敗なら T-02 で翻訳して throw →②T-03 後段チェック →
  ③ `raw as SpecRunnerConfig` を返す」という線形フローへ書き換える。
- [x] 返り値は **zod parse 出力ではなく元の `raw`** とする（未知フィールド保持・coercion/strip 回避）。
- [x] `checkConfigComplete` は現状維持（変更しない）。

**Acceptance Criteria**:
- 旧 `validateConfig` の手書き `typeof` ガード連鎖が削除され、検証は configSchema + 後段関数に集約される。
- `validateConfig({version:1, agents:{}, jobs:{location:"xdg"}})` の返り値が `jobs` を保持する。
- `tests/unit/config/runtime-config.test.ts` の TC-033（local runtime accept）/ 返り値の `runtime` 検査が green。

## T-05: 型と検証の情報源を束縛する（compile-time 整合）

- [x] `configSchema` の推論型と公開 interface（`SpecRunnerConfig` 系）の構造的整合をコンパイル時
  アサーションで束縛し、片方のみ変更で型エラーになるようにする（情報源一本化の担保）。
- [x] 公開 interface（`SpecRunnerConfig` / `StepExecutionConfig` / `VerificationConfig` 等）の export と
  JSDoc は維持する。リポジトリ他所の import 先 type を変えない。

**Acceptance Criteria**:
- `tsc --noEmit` が green（`schema.ts` を import する全 src/ ファイルを含む）。
- スキーマと interface のフィールド乖離を起こす変更がコンパイルエラーで検出される。

## T-06: load / migration 経路の不変を確認する

- [x] `store.ts`（`parseAndMigrate` / `validateAndWrap` / `loadConfig` / `saveConfig` / `deepMergeConfig`）と
  `migrate.ts`（`applyMigration`）を変更しない。
- [x] `validateConfig` のシグネチャ `(raw: unknown) => SpecRunnerConfig` を維持する。

**Acceptance Criteria**:
- `tests/config/store.test.ts`（overlay / deep merge / standalone / CONFIG_MISSING / invalid JSON）が無改変で green。
- `tests/unit/config/migrate.test.ts` が無改変で green。

## T-07: 全体検証

- [x] `typecheck`（`tsc --noEmit`）green。
- [x] `test`（`vitest run`）green。config validation テストをエラーコード・exit code・hint・メッセージ形式を
  含めて無改変で green に保つ。
- [x] `src/core/port/report-result.ts` / `src/core/step/report-tool.ts` に差分が無い（スコープ外）。
- [x] config スキーマのフィールド集合・受理/拒否の境界が現行と同等以上（追加・削除なし）。

**Acceptance Criteria**:
- `typecheck && test` が green。
- 受け入れ基準（request.md）の全項目を満たす。
