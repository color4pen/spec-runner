# Design: managed-agent adapter の非 null アサーションを safe access に置き換える

## Context

`src/adapter/managed-agent/agent-runner.ts` は managed runtime（Anthropic Managed Agents API 経由）の
agent 実行を担う adapter である。この adapter に、optional / nullable なフィールドを TypeScript の
非 null アサーション `!` で握り潰している箇所が存在し、フィールド未設定時に意味の不明な実行時エラー
（`TypeError: Cannot read properties of undefined` 等）または不正値の下流伝播を引き起こす。

対象は以下の 3 種類のフィールドアクセスである。

| # | 式 | 型 | 不在の意味 |
|---|-----|-----|-----------|
| 1 | `config.environment!.id` | `EnvironmentConfig \| undefined`（config schema で optional） | managed environment が未登録 |
| 2 | `return sessionId!` / `sessionId!` | local `let sessionId`（初期化なし） | session が確立されなかった |
| 3 | `state.branch!` | `string \| null`（JobState schema） | branch が未設定 |

### 現状の正確な所在（調査結果）

- `config.environment!.id`: **L285（`createDesignSession`）**, L606・L628（`createOrResumePollingSession`）の
  **計 3 箇所**。request.md は polling 側の L606・L628 のみを列挙しているが、design-style の L285 にも
  同一パターンが存在する。design は managed pipeline の最初のステップであり、environment 未設定なら
  L285 が最初に到達する。
- `sessionId!`: L618・L641（送信時の suppressor）, L648（`return sessionId!`）。`let sessionId: string;` は
  初期化子を持たず、TS の definite-assignment 解析を黙らせる目的で `!` が付与されている。
  既存の catch は全て `throwSessionCreateError` / `throwSendMessageError`（戻り型 `never`）を呼ぶため、
  通常フローでは undefined のまま return には到達しない。ただし `createSession` が
  `{ sessionId: undefined }` のような不正な応答を resolve した場合は undefined が return される。
- `state.branch!`: L663（`fetchResultFile`）。`fetchResultFile` は polling-style からのみ呼ばれ、
  その手前の `preparePollingMessage`（L564-566）で `!state.branch` を `branchNotSetError` で既に
  ガードしている。したがって L663 の null ケースは public `run()` 経由では到達せず、defense-in-depth に当たる。
  `state.branch!` は実行時 no-op（`!` は値を変えない）なので、null の場合は `null` がそのまま
  `getRawFile(..., branch, ...)` に渡り、下流で不明瞭に失敗する。

### 既存の error 表現規約

- `src/errors.ts` に `SpecRunnerError`（code + hint + message）と well-known factory 群がある。
  branch 未設定用の `branchNotSetError(stepName)` は既に存在し、本 adapter にも import 済み。
- 本 adapter の throw は `throwWrappedError(errorInfo, state)`（`src/core/port/error-helpers.ts`）経由で、
  plain `Error` に `code` / `hint` / `state` を付与して投げる。`error-helpers.ts`（managed 専用）に
  `throwSessionCreateError` / `throwSendMessageError`（共に `SESSION_CREATE_FAILED`）等の throw helper がある。
- environment 未設定用の factory は存在しない（新規追加が必要）。

## Goals / Non-Goals

**Goals**:

- 上記 3 種・全箇所の `!` を、不在時に「何が足りないか」と「対処法」を含む明確なメッセージで
  fail-fast する safe access（optional chaining + 明示ガード）へ置き換える。
- environment / sessionId / branch それぞれの不在・null ケースに対するテストを追加する。
- `bun run typecheck && bun run test && bun run lint` を green に保つ。

**Non-Goals**:

- managed-agent adapter のエラー握りつぶし修正（`.catch(() => null)` 等）。別件。
- local runtime（Claude Code adapter）のコード変更。これらの経路はこの adapter を通らない。
- preparePollingMessage（L564）の既存 branch ガードの変更。L663 はそれと整合させるのみ。

## Decisions

### D1: environment ガードは新規 factory + 私的 helper に集約し、managed adapter 内の全 createSession 呼び出しに適用する

`src/errors.ts` に新 error code `ENVIRONMENT_NOT_SET` と factory
`environmentNotSetError(stepName)`（hint: `Run 'specrunner managed setup'.`、doctor の
`environment-registered` チェックと同一の remediation）を追加する。agent-runner.ts に私的 helper
（例: environment 未設定時に `throwWrappedError` で投げ、設定時に `environment.id` を返す関数）を設け、
`config.environment!.id` の **3 箇所すべて（L285・L606・L628）** をこの helper 経由に置き換える。

- **Rationale**: 「`environment` 未設定で managed runtime を使った場合に明確なエラーで throw する」という
  受け入れ基準は振る舞いレベルの契約である。design は managed pipeline の最初のステップなので、
  L285 を残すと最初のステップが `TypeError` でクラッシュし、受け入れ基準を満たせない。3 箇所は同一の
  preflight 条件であり、helper に集約すればメッセージ・挙動が一貫する。修正は managed adapter 内に閉じる
  （architect 判断と整合）。
- **Alternatives considered**:
  - request.md 記載どおり L606・L628 のみ修正 → 却下。design-style（L285）に同一クラッシュが残り、
    受け入れ基準（environment 未設定 → 明確な throw）を満たせない。
  - 各箇所にインライン `if (!config.environment) throw ...` を 3 回複製 → 却下。重複し、メッセージの
    一貫性が崩れやすい。helper へ集約する。
  - config schema で `environment` を required にする → 却下。local runtime では environment は不要であり、
    schema 変更は scope 外かつ影響範囲が広い。

### D2: sessionId は型を `string | undefined` に正直化し、return 直前に明示ガードを置く

`createOrResumePollingSession` の `let sessionId: string;` を `string | undefined` 宣言に変え、
代入後は TS の narrowing により L618・L641 の `!` を除去する。`return sessionId!`（L648）は
`sessionId` が undefined の場合に明確なメッセージで throw する明示ガード（`SESSION_CREATE_FAILED` 系、
「session が確立されなかった」旨と対処）に置き換える。

- **Rationale**: `!` は型レベルの主張に過ぎず、実体が undefined でも実行時には防げない。型を正直化して
  ガードを runtime に移すことで、`createSession` が不正な応答（`sessionId` 欠落）を返した場合に
  fail-fast する。既存の catch は `never` を投げるため通常フローの振る舞いは不変。
- **Alternatives considered**:
  - `let sessionId: string` のまま `!` を残す → 却下。要件 2 に反する。
  - 各代入直後に individually assert → 却下。return 地点での単一ガードが最小で読みやすい。

### D3: branch は L663 を明示 null ガードに置き換え、既存 `branchNotSetError` を再利用する

`const effectiveBranch = state.branch!;`（L663, `fetchResultFile`）を、`state.branch === null` の場合に
`branchNotSetError(step.name)` 相当を `throwWrappedError` で投げる明示ガードに置き換え、null でなければ
narrow 済みの `state.branch` を使う。`preparePollingMessage`（L564）の既存ガードと同一の error code
（`BRANCH_NOT_SET`）・factory を使い、表現を統一する。

- **Rationale**: 既存の `branchNotSetError` factory がそのまま使える。L663 は upstream ガードの
  defense-in-depth であり、`state.branch!` の no-op を明示 throw に変えることで「null の場合に throw」を
  保証する。新 error code を増やさない。
- **Alternatives considered**:
  - `state.branch ?? ""` のような既定値 fallback → 却下。空 branch で GitHub API を叩くと別の不明瞭な
    失敗を生む。fail-fast が要件。
  - L663 を削除し L564 ガードのみに依存 → 却下。`fetchResultFile` 単体の不変条件として明示する方が安全。

## Risks / Trade-offs

- [Risk] L663 の null ケースは upstream（L564）で既にガードされ、public `run()` 経由では到達しない →
  Mitigation: L663 の修正自体は型安全性と単体不変条件の明示が目的。振る舞いテストは branch=null で
  `run()` が `BRANCH_NOT_SET` を投げること（L564 で捕捉）を検証し、契約「branch null → throw」を担保する。
- [Risk] L285 を scope に含めることで request.md の列挙（L606・L628 のみ）を超える → Mitigation: 受け入れ
  基準（environment 未設定 → 明確な throw）を満たすために必須であり、Open Questions に明記して可視化する。
  修正は managed adapter 内に閉じ、local runtime には波及しない。
- [Risk] sessionId の undefined-return ガードは通常フロー（catch が `never`）では到達しない → Mitigation:
  `createSession` が `{ sessionId: undefined }` を resolve する不正応答ケースをテストで到達させ、ガードの
  有効性を検証する。
- [Risk] 新 error code `ENVIRONMENT_NOT_SET` の追加 → Mitigation: 既存 `branchNotSetError` の前例に倣う。
  exit code は既定（GENERAL_ERROR）で `BRANCH_NOT_SET` と同様の扱いとする。

## Open Questions

- request.md は environment の `!` を L606・L628 のみ列挙しているが、本 design は同一パターンの
  **L285（design-style）も scope に含める**。design は managed の最初のステップであり、受け入れ基準を
  満たすには L285 の修正が必須という判断による。implementer はこの 3 箇所すべてを修正すること。
- `ENVIRONMENT_NOT_SET` を `EXIT_CODE_MAP` に `ARG_ERROR`（setup 前提エラー）として登録するかは任意。
  本 change では `branchNotSetError` の前例に合わせ未登録（既定 GENERAL_ERROR）とする。必要なら別途。
