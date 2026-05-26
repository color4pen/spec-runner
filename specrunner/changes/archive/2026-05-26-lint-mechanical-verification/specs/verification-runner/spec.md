## Requirements

### Requirement: verification CLI runner は config の commands 配列で任意の command を sequential 実行する

`runVerification()` は MUST project local config（`<repo-root>/.specrunner/config.json`）の `verification.commands` が定義されている場合、配列順に command を sequential 実行する。各 command は `sh -c <command>` 経由で spawn される（POSIX shell 前提）。exit code 0 → passed、non-zero → failed。最初の failed command で MUST break し、残り command は SHALL `status: "skipped"` で記録される（fail-fast）。

command 配列の各要素は `string | { name?: string; run: string }` の union 型で指定される。内部では `{ name: string | undefined; run: string }` の正規化配列に統一される。normalize ルール:
- string `"cmd"` → `{ name: undefined, run: "cmd" }`
- `{ run: "cmd" }` → `{ name: undefined, run: "cmd" }`
- `{ name: "label", run: "cmd" }` → `{ name: "label", run: "cmd" }`

failure 時の表示: `name` があれば `Step '<name>' failed`、無ければ `Step '<command>' failed`。

verification-result.md の出力 format は既存と同じ構造（Phase Results 表 + Phase 詳細セクション）を維持する。`phase` field には `name` があればそれを、無ければ command 文字列を使用する。

#### Scenario: commands 経路で全 command passed

- **GIVEN** config に `verification.commands: ["echo ok", { "run": "true" }]` が定義されている
- **WHEN** `runVerification(slug, cwd)` を呼ぶ
- **THEN** 結果の verdict は `"passed"` であり、各 command の status は `"passed"`

#### Scenario: commands 経路で 2 番目 failed → 後続 skipped

- **GIVEN** config に `verification.commands: ["true", "false", "echo after"]` が定義されている
- **WHEN** `runVerification(slug, cwd)` を呼ぶ
- **THEN** 1 番目の status は `"passed"`、2 番目の status は `"failed"`、3 番目の status は `"skipped"`
- **AND** verdict は `"failed"`

#### Scenario: name あり failure の表示

- **GIVEN** config に `verification.commands: [{ "name": "lint", "run": "false" }]` が定義されている
- **WHEN** `runVerification(slug, cwd)` を呼ぶ
- **THEN** verification-result.md の Phase Results 表で phase 列に `lint` が表示される

#### Scenario: name なし failure の表示

- **GIVEN** config に `verification.commands: ["ruff check"]` が定義されている
- **WHEN** `runVerification(slug, cwd)` を呼ぶ
- **THEN** verification-result.md の Phase Results 表で phase 列に `ruff check` が表示される

### Requirement: verification CLI runner は commands 未定義時に既存の phase 検出 fallback で動作する

`verification.commands` が未定義（config に `verification` section が無い、または `verification.commands` が無い）の場合、`runVerification()` は MUST 既存の phase 検出 fallback（`package.json` の `build / typecheck / test / lint / security` script を `bun run` で順次実行）で動作する。この fallback は既存挙動と完全に同等であり regression を生じない。

#### Scenario: commands 未定義で fallback 動作

- **GIVEN** config に `verification` section が存在しない
- **AND** `package.json` に `build` / `typecheck` / `test` script が存在する
- **WHEN** `runVerification(slug, cwd)` を呼ぶ
- **THEN** 既存の phase 検出 fallback で `bun run build` / `bun run typecheck` / `bun run test` が順次実行される
- **AND** 結果は commands 導入前と同一

#### Scenario: config に verification section はあるが commands が未定義

- **GIVEN** config に `{ "verification": {} }` が存在する（commands key が無い）
- **WHEN** `runVerification(slug, cwd)` を呼ぶ
- **THEN** 既存の phase 検出 fallback で動作する

### Requirement: verification CLI runner は build / typecheck / test / lint / security の 5 phase を fail-fast 順次実行する

`src/core/verification/runner.ts` の `runVerification(slug: string): Promise<VerificationResult>` は MUST 以下の 5 phase を配列順 `["build", "typecheck", "test", "lint", "security"]` で順次実行する。各 phase は SHALL `node:child_process.spawn` で `bun run <phase>` を子プロセスとして起動する（test phase を含む全 phase が `bun run <script>` 形式で統一される）。`bun:*` / `Bun.*` の import は MUST 使用しない。spawn は cwd を target project の repository root で実行する（per-phase timeout は本 request スコープ外）。

最初の non-zero exit code を返した phase で MUST break し、残り phase は SHALL `status: "skipped"` で記録される（fail-fast）。

#### Scenario: 全 phase passed

- **GIVEN** 5 phase すべてが exit code 0 で終了する
- **WHEN** `runVerification(slug)` を呼ぶ
- **THEN** 結果の verdict は `"passed"` であり、各 phase の status は `"passed"`

#### Scenario: typecheck failed → 後続 skipped

- **GIVEN** build phase が exit 0、typecheck phase が exit 2 で終了する
- **WHEN** `runVerification(slug)` を呼ぶ
- **THEN** 結果の verdict は `"failed"`
- **AND** build phase status は `"passed"`、typecheck phase status は `"failed"`、test/lint/security の status は `"skipped"`

#### Scenario: bun:* / Bun.* の import 禁止

- **WHEN** `src/core/verification/runner.ts` の import 文を grep する
- **THEN** `from "bun:`、`from "bun"`、`Bun.spawn` のいずれも出現しない
- **AND** `from "node:child_process"` が import されている

### Requirement: verification CLI runner は build / typecheck / test / lint / security / test-coverage の 6 phase を fail-fast 順次実行する

`src/core/verification/runner.ts` の `runVerification(slug: string): Promise<VerificationResult>` は MUST 以下の 6 phase を配列順 `["build", "typecheck", "test", "lint", "security", "test-coverage"]` で順次実行する。最初の 5 phase (build / typecheck / test / lint / security) は従来通り `bun run <script>` を子プロセスとして起動する。6 番目の `test-coverage` は CLI 内部処理として実行する（package.json script を spawn しない）。

最初の non-zero exit code を返した phase で MUST break し、残り phase は SHALL `status: "skipped"` で記録される（fail-fast）。

#### Scenario: 全 6 phase passed

- **GIVEN** 5 script phase すべてが exit code 0 で終了し、test-coverage phase も passed
- **WHEN** `runVerification(slug)` を呼ぶ
- **THEN** 結果の verdict は `"passed"` であり、phases 配列の length は 6

#### Scenario: test phase failed → test-coverage skipped

- **GIVEN** test phase が exit 1 で終了する
- **WHEN** `runVerification(slug)` を呼ぶ
- **THEN** test-coverage phase の status は `"skipped"`
