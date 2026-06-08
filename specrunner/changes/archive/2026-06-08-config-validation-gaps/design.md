# Design: config-validation-gaps

## Overview

`validateConfig`（`src/config/schema.ts`）は最終行で `return raw as SpecRunnerConfig` とキャストするため、明示的に検証したフィールドだけが型安全で、未検証フィールドは壊れた値が素通りする。本変更は `SpecRunnerConfig` interface で型を持ちながら未検証のフィールド（`agents` / `environment` / `specReview.pollIntervalMs` / `pipeline` のオブジェクト型ガード）を、既存の手書き validator + `CONFIG_INVALID` throw パターンに沿って検証する。あわせて config 外の JSON parse 箇所（credentials file の load、cancel sidecar の read）の最低限の shape check を補強する。

zod 等の schema ライブラリは導入しない（architect 評価済み: 既存パターン踏襲）。`validateConfig` の final cast 構造そのものの解消はスコープ外。

## Current State（コード偵察結果）

### `validateConfig`（`src/config/schema.ts`）

検証済み: `version` / `runtime` / `pipeline.maxRetries` / `steps`（深い検証）/ `models` / `progress` / `verification` / `github` / `logs` / `archive`。

未検証（本変更の対象）:

- `agents` — `Partial<Record<AgentStepName, AgentRecord>>`。`AgentRecord` の shape（`agentId: string` / `definitionHash: string` / `lastSyncedAt: string`）が一切検証されていない。
- `environment` — `EnvironmentConfig`（`id: string` / `lastSyncedAt: string`）が未検証。
- `specReview.pollIntervalMs` — `number`。負数・0・非整数・文字列が素通りする。
- `pipeline` — L315 で `obj["pipeline"] !== undefined && obj["pipeline"] !== null` のみ確認し、直後に `obj["pipeline"] as Record<string, unknown>` とキャストする。**オブジェクト型ガードが無い**ため `pipeline: "fast"` のような非 object 値が素通りし（`"fast"["maxRetries"]` は `undefined` のため maxRetries チェックも通過する）、後段で `as Record` キャストが偶然動いてしまう。

### config 外の JSON parse 箇所

- `src/core/credentials/credentials-io.ts:50`（`loadCredentials`）— `JSON.parse(raw) as CredentialsFile` をノーチェックで返す。malformed JSON（構文エラー）は `catch` で `{}` を返す既存挙動。`CredentialsFile` は `github?.token: string` / `anthropic?.apiKey?: string`（いずれも optional）。
  - 同ファイル L67-68（`saveCredentials` の merge 用 read）も同様だが、本変更の対象は request item 2 が明示する **L50（load）のみ**。
- `src/core/cancel/runner.ts:86`（`resolveWorktreePathForJob`）— `JSON.parse(raw) as Record<string, unknown>`。L87 で `typeof sidecar["worktreePath"] === "string"` と `sidecar["jobId"] === state.jobId`（等価比較）を確認するが、`jobId` の **typeof は未検証**。この read は try/catch で囲まれた best-effort fallback（失敗時は convention 由来パスへフォールスルー）。`pid` は不使用。
- `src/core/resume/safety.ts:51`（`isStaleRunning`）— `JSON.parse(...) as Record<string, unknown>`。L53 で `pid != null && typeof pid === "number"` を**既に検証済み**。この read も try/catch で囲まれた best-effort（失敗時は stale 判定）。

## Design Decisions

### D1: `agents` の shape 検証を追加する

**Decision**: `obj["agents"]` が存在する場合、object であること、および各エントリ値が object かつ `agentId` / `definitionHash` / `lastSyncedAt` がすべて string であることを検証する。違反は `CONFIG_INVALID` で throw。

**配置**: `validateConfig` 内、`pipeline` 検証ブロックの近傍（既存セクション群と同じ「section ごとに独立した if ブロック」スタイル）。

**検証ロジック（擬似コード）**:
```typescript
if (obj["agents"] !== undefined && obj["agents"] !== null) {
  if (typeof obj["agents"] !== "object") {
    throw configInvalid("agents must be an object.");
  }
  const agentsObj = obj["agents"] as Record<string, unknown>;
  for (const [stepName, rec] of Object.entries(agentsObj)) {
    if (rec === undefined || rec === null) continue; // Partial Record: 欠落 key は許容
    if (typeof rec !== "object") {
      throw configInvalid(`agents.${stepName} must be an object.`);
    }
    const r = rec as Record<string, unknown>;
    for (const field of ["agentId", "definitionHash", "lastSyncedAt"] as const) {
      if (typeof r[field] !== "string") {
        throw configInvalid(`agents.${stepName}.${field} must be a string.`);
      }
    }
  }
}
```

**Rationale**:
- `agents` は `Partial<Record<...>>` のため key の欠落は正常（local runtime では agents が空のことがある）。空 object `{}` は valid として通す。
- 値が存在する場合のみ shape を強制する。`migrate.ts` が legacy 形式を正規化した**後**に `validateConfig` が呼ばれる前提（schema.ts の既存コメント）に依存する。

**Note**: `agents` の値検証は文字列の typeof のみ。空文字許容/非許容は既存フィールドと揃え、`agentId` 等は「string であること」のみ要求する（空文字を弾く要件は request に無いため追加しない＝scope creep 回避）。

### D2: `environment` の shape 検証を追加する

**Decision**: `obj["environment"]` が存在する場合、object であること、および `id` / `lastSyncedAt` が string であることを検証する。違反は `CONFIG_INVALID` で throw。

```typescript
if (obj["environment"] !== undefined && obj["environment"] !== null) {
  if (typeof obj["environment"] !== "object") {
    throw configInvalid("environment must be an object.");
  }
  const env = obj["environment"] as Record<string, unknown>;
  for (const field of ["id", "lastSyncedAt"] as const) {
    if (typeof env[field] !== "string") {
      throw configInvalid(`environment.${field} must be a string.`);
    }
  }
}
```

**Rationale**: `EnvironmentConfig` は managed runtime で必須だが、`SpecRunnerConfig.environment` 自体は optional（`?`）。よって「存在する場合のみ」検証する。両フィールドとも non-optional な interface 定義のため、存在時は両方 string を要求する。

### D3: `specReview.pollIntervalMs` の検証を追加する（正の整数）

**Decision**: `specReview.pollIntervalMs` は既存の `archive.mergeWaitPollIntervalMs` validator（正の整数 = `number && Number.isInteger && >= 1`）と同じパターンで検証する。

```typescript
if (obj["specReview"] !== undefined && obj["specReview"] !== null) {
  if (typeof obj["specReview"] !== "object") {
    throw configInvalid("specReview must be an object.");
  }
  const sr = obj["specReview"] as Record<string, unknown>;
  if (sr["pollIntervalMs"] !== undefined) {
    const v = sr["pollIntervalMs"];
    if (typeof v !== "number" || !Number.isInteger(v) || v < 1) {
      throw configInvalid("specReview.pollIntervalMs must be a positive integer.");
    }
  }
}
```

**Rationale**: request item 1 は「正の整数（既存の timeoutMs と同じパターン）」を指定。`timeoutMs` は `>= 0`（0 = disable）だが、poll interval に 0 は無意味（無限ループ/busy poll）なため **正の整数（>= 1）** とする。これは `mergeWaitPollIntervalMs` の既存判断と一致する。`pollIntervalMs` は optional（`?`）なので未設定は通す。

### D4: `pipeline` のオブジェクト型ガードを追加する

**Decision**: 既存の `maxRetries` チェックの**前**に、`pipeline` が object であることのガードを追加する。非 object（`"fast"` / 数値 / 配列）は `CONFIG_INVALID`。

```typescript
if (obj["pipeline"] !== undefined && obj["pipeline"] !== null) {
  if (typeof obj["pipeline"] !== "object") {            // ← 追加
    throw configInvalid("pipeline must be an object.");
  }
  const pipeline = obj["pipeline"] as Record<string, unknown>;
  if (pipeline["maxRetries"] !== undefined) { /* 既存 */ }
}
```

**Rationale**: 現状 `pipeline: "fast"` は `typeof "fast"["maxRetries"] === "undefined"` のため maxRetries チェックをすり抜け、後段の `as Record` キャストが偶然動く。型ガードを maxRetries チェックの手前に置くことで「pipeline は object でなければならない」という契約を明示する。既存の `maxRetries` メッセージ（`pipeline.maxRetries must be between 1 and 10.`）は変更しない（後方互換）。

**Note**: 既存の maxRetries throw は `code` プロパティを持たない素の `Error` だが（schema.ts L320）、本変更で追加する pipeline 型ガードは他セクションと同じく `code: "CONFIG_INVALID"` 付き Error にする。既存行の挙動には手を入れない。

### D5: 共通 throw ヘルパは導入しない（既存スタイル踏襲）

**Decision**: 上記擬似コードの `configInvalid(...)` は説明用の略記であり、実装では既存コードと同一の inline 形式
```typescript
throw Object.assign(new Error("CONFIG_INVALID: <message>"), { code: "CONFIG_INVALID" });
```
を各箇所で展開する。新規ヘルパ関数は追加しない。

**Rationale**: `validateConfig` は全 section で inline の `Object.assign(new Error(...), { code: "CONFIG_INVALID" })` を一貫して使っている。ここでヘルパを導入すると差分が validator 全体に波及し「全体リファクタリング」スコープに踏み込む。最小差分・既存スタイル一致を優先する（architect 評価済み判断）。

### D6: credentials file の load 時 shape check（throw する）

**Decision**: `loadCredentials`（`credentials-io.ts`）で JSON.parse 後に shape check を追加する。`github` キーが存在する場合 `github.token` が string であることを要求し、違反時は throw する。malformed JSON（構文エラー）の `{}` フォールバックは現行どおり維持する。

**実装方針（restructure が必要）**:

現状は parse と return が同一 try 内にあり、try 内で throw すると `catch` が握り潰して `{}` を返してしまう。よって parse（構文エラー → `{}`）と shape check（不正 shape → throw）を分離する:

```typescript
let parsed: unknown;
try {
  parsed = JSON.parse(raw);
} catch {
  return {};                       // malformed JSON（構文エラー）は従来どおり {}
}
// shape check は catch の外で行い、throw を伝播させる
if (typeof parsed !== "object" || parsed === null) {
  throw configInvalid("credentials file must be a JSON object.");
}
const creds = parsed as Record<string, unknown>;
if (creds["github"] !== undefined) {
  const gh = creds["github"];
  if (typeof gh !== "object" || gh === null || typeof (gh as Record<string, unknown>)["token"] !== "string") {
    throw configInvalid("credentials file: github.token must be a string.");
  }
}
return parsed as CredentialsFile;
```

**Rationale**:
- request item 2 / acceptance #2 が「shape check を入れ、不正値で throw」を要求。architect 注記「対象ファイルが壊れていた場合に早期に明確なエラーを出す」に沿い、**最低限のキーフィールド（`github.token`）のみ**検証する。
- `github` キー自体は optional（anthropic-only の credentials file は valid）なので「存在する場合のみ token を検証」する。`anthropic.apiKey` の検証は request が明示しないため追加しない（過度な schema 検証を避ける）。
- 構文エラー時の `{}` 維持は後方互換のため（既存の「壊れた JSON は無視して再 login を促す」挙動を変えない）。throw する対象は「JSON としては valid だが期待する shape を満たさない」ケースに限定する。
- error code は他の config 系と同様 `CONFIG_INVALID`（exit 2 = 環境修正を促す）を付与する。新規 error code は追加しない。

### D7: cancel sidecar の jobId typeof ガードを追加する（best-effort、throw しない）

**Decision**: `cancel/runner.ts` `resolveWorktreePathForJob` の guard を
```typescript
if (typeof sidecar["worktreePath"] === "string" && sidecar["jobId"] === state.jobId) {
```
から
```typescript
if (
  typeof sidecar["worktreePath"] === "string" &&
  typeof sidecar["jobId"] === "string" &&
  sidecar["jobId"] === state.jobId
) {
```
に変更する。

**Rationale / acceptance #2 との整合**:
- この sidecar read は **意図的に best-effort**（try/catch で囲まれ、不一致時は convention 由来パスへフォールスルー）。ここで throw すると graceful degradation（sidecar が壊れていても convention パスで cleanup を続行する）設計が壊れる。
- したがって本箇所の「shape check」は **throw ではなく guard 強化**として実装する。`jobId` が数値等の非 string でも `=== state.jobId` で弾けるが、`typeof === "string"` を明示することで「sidecar の jobId は string である」という型契約をコード上で表明し、将来の偶発的一致（型強制比較）を防ぐ。
- acceptance #2 の「sidecar の JSON parse に shape check が入り、不正値で throw する」は、**credentials の throw** と **sidecar の guard 強化**の両方で「壊れた値を信用しない」という同一目的を満たす。sidecar 側を throw に変えるのは request item 3（「jobId の typeof 検証を追加する」のみ指定）を超える挙動変更（best-effort → fail-fast）であり、scope 外と判断する。この差異は本 design で明示し、reviewer の判断材料とする。

### D8: resume sidecar の pid typeof チェックは既存で充足（変更なし）

**Decision**: `resume/safety.ts:51` の `isStaleRunning` は `pid != null && typeof pid === "number"`（L53）を既に持つため、コード変更は**不要**。request item 3 の「追加不要か確認し、不足があれば補う」に対し「充足、追加不要」と確認する。

**実施事項**: コード変更なし。確認の証跡として、非 number な pid を持つ sidecar が stale 判定にフォールバックする回帰テストを 1 件追加する（D11）。

**Rationale**: 既存実装が要件を満たしているため、不要な編集をしない（最小差分原則）。

## Test Strategy（D9–D12）

すべて vitest。既存テストファイルの helper / 構造に合わせる。

### D9: `validateConfig` のテスト（`tests/config/schema.test.ts`）

既存 `makeMinimalRawConfig(overrides)` helper を再利用し、`describe` ブロックを追加する。各フィールドについて「不正値 → `CONFIG_INVALID` で throw」「valid 値 → throw しない」「未設定 → throw しない（後方互換）」を網羅する。

- `agents`: 非 object（`"x"`）、エントリが非 object、`agentId` 欠落/非 string、`definitionHash` 非 string、`lastSyncedAt` 非 string → throw。valid な `{ design: { agentId, definitionHash, lastSyncedAt } }` と空 `{}` → not throw。
- `environment`: 非 object、`id` 非 string、`lastSyncedAt` 非 string → throw。valid → not throw。未設定 → not throw。
- `specReview.pollIntervalMs`: `0` / 負数 / `1.5` / 文字列 → throw。`10000` → not throw。未設定 → not throw。
- `pipeline`: `pipeline: "fast"`（非 object）→ throw。既存の maxRetries テストが引き続き green であること。

### D10: credentials shape check のテスト（`tests/core/credentials/credentials-io.test.ts`、新規）

`getCredentialsPath` は XDG path を返すため、`XDG_CONFIG_HOME` を temp dir に向けてファイルを書き、`loadCredentials()` を呼ぶ統合スタイルにする（既存 credentials テストの env 操作パターンに合わせる。必要なら `vi.spyOn`/temp dir + afterEach cleanup）。

- valid（`{ github: { token: "ghp_x" } }`）→ そのまま返る。
- anthropic-only（`{ anthropic: { apiKey: "sk-x" } }`）→ throw しない（github 不在は許容）。
- 不正 shape（`{ github: { token: 123 } }` / `{ github: {} }` / `{ github: "x" }`）→ throw。
- malformed JSON（`"{ not json"`）→ `{}` を返す（throw しない、後方互換）。
- ファイル不在（ENOENT）→ `{}` を返す。

### D11: cancel/resume sidecar のテスト

- `tests/unit/core/cancel/runner.test.ts`: 既存 `makeJob` 系 fixture を使い、liveness sidecar の `jobId` を**非 string（例: 数値）**にしたケースで、`resolveWorktreePathForJob` 経由の worktree 解決が sidecar を採用せず convention パスへフォールスルーすることを確認する（cleanup が best-effort で続行し throw しない）。
- `tests/unit/core/resume/safety.test.ts`: sidecar の `pid` が非 number（例: `"123"`）のとき `isStaleRunning` が stale（`true`）にフォールバックすることを確認する回帰テスト（D8 の確認証跡）。

### D12: 既存テストの非回帰

`tests/config/schema.test.ts` / `tests/unit/config/schema.test.ts` / credentials / cancel / resume の既存テストが全て green であること。valid な既存 config（agents/environment 未設定や正しい値）が引き続き通ることを確認する。

## Acceptance Mapping

| Acceptance Criterion | 対応 Decision |
|---|---|
| 不正値 config が `CONFIG_INVALID` で reject | D1–D4 |
| credentials / sidecar の shape check / throw | D6（credentials throw）/ D7（sidecar guard 強化）/ D8（resume 既存充足）— sidecar の throw 化は scope 外、design D7 で根拠を明示 |
| 各検証に対応するテスト | D9–D11 |
| 既存 valid config が通る（後方互換） | 全 Decision で「存在する場合のみ検証」「未設定は通す」を徹底、D12 |
| `bun run typecheck && bun run test` green | D12 + 実装後検証 |
| `bun run lint` green | 実装後検証 |

## Out of Scope（request 準拠）

- `validateConfig` の全体リファクタリング（final cast の構造的解消）。
- 新フィールドの追加。
- `saveCredentials`（credentials-io.ts L67-68）の merge-read shape check（request item 2 は L50 のみ指定）。
- cancel/resume sidecar read を best-effort から fail-fast（throw）へ変更すること（D7 参照）。
