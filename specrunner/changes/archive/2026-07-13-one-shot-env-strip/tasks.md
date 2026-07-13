# Tasks: one-shot SDK query の env を stripSecrets 経由に統一し、env-omission を歯で固定する

Scope of edits:

- **Source (1 file)**: `src/adapter/claude-code/query-one-shot.ts` — import `stripSecrets`
  and add `env` to the SDK query options.
- **Test (1 file)**: `tests/unit/adapter/claude-code/query-one-shot.test.ts` — add the
  behavioral env-capture tests + the env-omission detection test (namespace `TC-OSQ-ENV-*`).

Do NOT touch:

- `src/adapter/claude-code/agent-runner.ts`（既に B-6 準拠。env 扱いは不変）。
- `src/adapter/codex/**`（挙動不変）。
- `src/util/env-filter.ts`（`stripSecrets` / `SECRET_DENYLIST` は既存のまま利用）。
- `tests/unit/architecture/core-invariants.test.ts` / `arch-allowlist.ts`（既存 B-6 grep 歯・
  allowlist は無変更。CODEOWNERS ゲート下）。
- `architecture/**`（構造定義。out-of-loop）。

禁止事項（design D1 / Non-Goals / request-review findings）:

- one-shot に `CLAUDE_CODE_OAUTH_TOKEN` その他の明示 env 値の注入を**追加しない**
  （`agent-runner.ts:398-403` の token 注入ブロックをコピーしない）。
- `env` 明示注入 API（呼び出し元が個別 env を渡す機構）を**追加しない**。
- one-shot の `permissionMode` / sandbox / allowedTools / maxTurns / model / systemPrompt /
  timeout を**変更しない**。

新テスト ID 名前空間: `TC-OSQ-ENV-*`（one-shot query env）。design.md（D1–D5）と spec.md の
Scenario を参照すること。

## T-01: one-shot query options に stripSecrets 由来の env を渡す

- [x] `src/adapter/claude-code/query-one-shot.ts` の import 群に
  `import { stripSecrets } from "../../util/env-filter.js";` を追加する。
- [x] Step 4 の SDK query options オブジェクト（現状 line 132-140、`fn({ prompt, options: { … } })`）
  に `env: stripSecrets(process.env as Record<string, string | undefined>)` を**1 プロパティ
  として追加**する。`agent-runner.ts:397` と同一のキャスト・同一の strip 関数を使う。
- [x] 中間可変変数（`const sdkEnv = …`）を作らずインラインで渡す（design D1: token 注入の
  コピーペースト混入を構造的に避ける）。`CLAUDE_CODE_OAUTH_TOKEN` 注入ブロックは追加しない。
- [x] 既存の options キー（`cwd` / `allowedTools` / `permissionMode` / `...maxTurnsOption` /
  `model` / `systemPrompt` / `abortController`）は位置も値も変更しない。

**Acceptance Criteria**:
- `queryOneShot` の SDK query options に `env` キーが存在し、その値が
  `stripSecrets(process.env)` と一致する。
- 追加行は `stripSecrets` を含むため、既存 B-6 grep 歯の seam 除外フィルタに安全判定され、
  `arch-allowlist.ts` への新 entry を必要としない。
- `env` 以外の options は既存の値・並びのまま（sandbox / canUseTool キーは付かない）。
- one-shot に `CLAUDE_CODE_OAUTH_TOKEN` や明示 env 注入が追加されていない。
- `bun run typecheck` が pass する。

## T-02: 純粋述語 envOmissionViolations と behavioral 捕捉テストを追加する

- [x] `tests/unit/adapter/claude-code/query-one-shot.test.ts` に、`src/util/env-filter` から
  `stripSecrets` と `SECRET_DENYLIST` を import する。
- [x] module-local の純粋関数
  `envOmissionViolations(env: Record<string, string | undefined> | undefined): string[]`
  を定義する（design D3）:
  - `env` が `undefined` / `null` → `["env omitted — SDK inherits raw process.env"]` を返す。
  - `env` が `SECRET_DENYLIST` のいずれかのキーを含む → 各混入キーにつき
    `"secret leaked: <KEY>"` を含むリストを返す。
  - どちらでもない → `[]`。
- [x] `TC-OSQ-ENV-01`（要件 1）: 注入 `queryFn` で `options` を捕捉し（既存の `capturedOptions`
  パターンを流用）、`queryOneShot` 実行後に
  - 捕捉した `options.env` が定義されている（`toBeDefined`）、
  - `options.env` が `stripSecrets(process.env as Record<string, string | undefined>)` と
    `toEqual` で一致する、
  を assert する。
- [x] `TC-OSQ-ENV-02`（要件 2）: `process.env.GH_TOKEN` に test 値を設定してから
  `queryOneShot` を実行し、捕捉した env が
  - `GH_TOKEN` キーを**含まない**（`not.toHaveProperty("GH_TOKEN")`）、
  - `PATH` キーを**含む**（`toHaveProperty("PATH")`）、
  - `envOmissionViolations(captured)` が `toEqual([])`、
  を assert する。`GH_TOKEN`（および設定した他キー）は `afterEach` もしくは try/finally で
  元値へ復元し、テスト間汚染を避ける。`PATH` が runtime に無い環境を想定するなら、制御した
  非 secret マーカーキーを設定して保持を assert してもよい。

**Acceptance Criteria**:
- `TC-OSQ-ENV-01` が「env が渡り、`stripSecrets(process.env)` と一致する」を固定する。
- `TC-OSQ-ENV-02` が「secret（`GH_TOKEN`）除去・非 secret（`PATH`）保持」を固定する。
- `process.env` への変更は各テスト後に復元され、他テストを汚染しない。
- 実挙動固定テストと後続 T-03 の検出テストが同一述語 `envOmissionViolations` を共有する。

## T-03: env-omission 検出テストで歯が red になることを固定する

- [x] `TC-OSQ-ENV-03`（要件 3・design D3）: 合成入力に対し `envOmissionViolations` が
  env-omission と secret 混入を red 判定することを assert する:
  - `envOmissionViolations(undefined)` が**非空**（`.length` > 0。env-omission を検出）。
  - `envOmissionViolations({ GH_TOKEN: "x", PATH: "/bin" })` が
    `"secret leaked: GH_TOKEN"` を**含む**（secret 混入を検出）。
  - `envOmissionViolations({ PATH: "/bin" })` が `toEqual([])`（strip 済み env は緑）。
- [x] このテストが「要件 2 の捕捉テストと同一述語を用いて要件 3 のガードを兼ねる」ことを
  コメントで明示する（request-review finding #1）。

**Acceptance Criteria**:
- `TC-OSQ-ENV-03` は env-omission（`undefined`）を非空違反として、secret 混入を secret-leak
  違反として、strip 済み env を違反なしとして判定することを固定する。
- 検出テストは T-02 の実捕捉テストと同一の `envOmissionViolations` 述語を適用する
  （実挙動固定と検出機構が乖離しないことを構造で保証する）。

## T-04: 無変更凍結の確認と green ゲート

- [x] `bun run typecheck && bun run test` を実行し green を確認する。
- [x] 既存 B-6 grep 歯（`core-invariants.test.ts` の `describe("B-6 …")`）と DSM / 他の
  アーキ歯が**検査ロジック無変更**で pass することを確認する。
- [x] one-shot の既存凍結テスト（`TC-SB-05`: sandbox キー不在 / `TC-FW-07`: canUseTool キー
  不在・permissionMode・allowedTools）と codex の既存テストが**無変更で green**であることを
  確認する（`env` キー追加が既存 assertion に影響しないこと）。
- [x] `git diff` で編集が `src/adapter/claude-code/query-one-shot.ts` と
  `tests/unit/adapter/claude-code/query-one-shot.test.ts` の 2 ファイルに限られ、
  `agent-runner.ts` / codex / `core-invariants.test.ts` / `arch-allowlist.ts` /
  `architecture/**` が**未変更**であることを確認する。

**Acceptance Criteria**:
- `typecheck` と `test` が green。
- 既存 B-6 grep 歯・one-shot / codex 既存凍結テストが無変更で pass。
- 編集は source 1 ファイル + test 1 ファイルに限定され、CODEOWNERS ゲート下ファイルと
  agent-runner / codex は未変更。
