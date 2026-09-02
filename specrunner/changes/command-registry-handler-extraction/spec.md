# Spec: CommandSpec registry から inline handler を command module へ抽出する

## Requirements

### Requirement: CommandSpec ツリーは handler の named function reference のみを保持する

`command-registry.ts` 内の `COMMANDS` ツリーに定義された全 CommandSpec の `handler` プロパティは、関数式（アロー関数・無名関数）を直接記述しない。handler プロパティが存在する場合、そのすべてが named function の参照（identifier reference）でなければならない（SHALL）。

#### Scenario: 全 CommandSpec の handler が named reference である

**Given** `command-registry.ts` が実装前のベースライン（inline handler 29 件）から本リファクタリングを経た状態にある
**When** `COMMANDS` ツリーを再帰的に走査し、handler を持つ全 CommandSpec について `handler.name` を確認する
**Then** どの CommandSpec の `handler.name` も `"handler"` と等しくない（すべてが named function 参照である）

#### Scenario: architecture ratchet が inline handler の再導入を検出する

**Given** architecture ratchet test が `bun run test` suite に含まれている
**When** 開発者が COMMANDS ツリー内に `handler: async (parsed, ctx) => { ... }` という inline 定義を追加する
**Then** `architecture-ratchet.test.ts` の handler.name チェックが失敗し、どの command path で違反が発生したかのメッセージを出力する

---

### Requirement: command-registry.ts は process.exit を呼び出さない

抽出完了後、`command-registry.ts` のソースには `process.exit` の呼び出しが 0 件でなければならない（SHALL）。既存の 67 件の `process.exit` 呼び出しは、順序・分岐・exit code を変えずに handler 側モジュールへ移動する。

#### Scenario: registry ソースから process.exit が消えている

**Given** T-16 のクリーンアップが完了した状態
**When** `src/cli/command-registry.ts` のソーステキストからコメントを除去して `process.exit` を検索する
**Then** マッチ件数が 0 である

#### Scenario: exit code が変更されていない

**Given** 抽出後の `handleJobResume` が `job resume <slug>` を処理する状態
**When** `--detach` と `--json` フラグが同時に指定される
**Then** `process.exit(EXIT_CODE.ARG_ERROR)` が呼ばれ、exit code 2 でプロセスが終了する（抽出前と同一）

---

### Requirement: handler モジュールから command-registry.ts への value import が存在しない

handler モジュールは `command-registry.ts` から値（関数・定数・クラス）を import してはならない（MUST）。型のみの import（`import type`）は禁止対象に含まない。循環依存を dynamic import・cast・service locator で隠さないこと。

#### Scenario: handler モジュールの import が command-registry を参照しない

**Given** T-03〜T-15 で作成・変更された handler モジュール群が存在する
**When** 各モジュールの import 宣言を解析し、`command-registry` をソースとする `ImportDeclaration` を検索する
**Then** type-only でない `ImportDeclaration` で `command-registry` を参照するものが 0 件である

#### Scenario: architecture ratchet が循環 import を検出する

**Given** architecture ratchet test が `bun run test` suite に含まれている
**When** handler モジュール（例: `resume.ts`）に `import { COMMANDS } from "../command-registry.js"` を追加する
**Then** `architecture-ratchet.test.ts` の import cycle チェックが失敗する

---

### Requirement: CommandSpec ツリーが CLI 契約の唯一の正本であり続ける

`command-registry.ts` の `COMMANDS` オブジェクト以外に、3 件以上の CommandSpec エントリを export するオブジェクト（並行 CLI 契約正本）が `src/cli/` に存在してはならない（MUST）。handler モジュール側に独自の command registry・flag 定義・help 定義を作成しない。

#### Scenario: 並行 CLI 契約正本が存在しない

**Given** 全抽出作業が完了した状態
**When** `src/cli/` 配下の全 `.ts` ファイルを列挙し、`export const COMMANDS` を定義するファイルを検索する
**Then** `command-registry.ts` のみが該当し、他のファイルは存在しない

---

### Requirement: CLI 契約（command path・flags・aliases・guards）が変更前後で同一である

抽出前後で CLI の構造的契約が同一でなければならない（SHALL）。具体的には以下が変更前後で一致すること:
- canonical command path 一覧
- flag 名・型・default・必須性
- alias の解決先
- `requiresRepo`・`worktreeGuard` の値
- `visibility`
- `help.summary`・`help.detail`（`ARCHIVE_USAGE` の re-export 経由を含む）

#### Scenario: CLI contract snapshot が変更前後で一致する

**Given** T-01 で作成した `cli-contract-snapshot.test.ts.snap` が存在する
**When** 全抽出作業（T-03〜T-16）を完了した後に `bun run test` を実行する
**Then** `cli-contract-snapshot.test.ts` の snapshot 比較がグリーンであり、変更なし（0 diffs）で通過する

---

### Requirement: 既存の CLI contract テストが green を維持する

本リファクタリングによって既存のテストの期待値を変更してはならない（MUST）。テスト期待値の修正が必要な場合は停止して報告する。

#### Scenario: 既存テスト群が全てグリーンのまま

**Given** 全抽出作業が完了した状態
**When** `bun run test` を実行する
**Then** `command-registry-resume.test.ts`・`command-registry-reopen.test.ts`・`archive-from-issue.test.ts`・`resume-from-issue.test.ts`・`view-commands-worktree-guard.test.ts`・`login.test.ts`・`from-flag-no-enum.test.ts`・その他全 CLI テストが変更前と同一の pass/fail 状態を維持する

---

### Requirement: USAGE 定数が引き続き command-registry から import 可能である

テストが `import { LOGIN_USAGE, ARCHIVE_USAGE, JOB_RESUME_USAGE, REOPEN_USAGE, USAGE } from "../command-registry.js"` で参照している定数は、抽出後も同じインターフェースで import 可能でなければならない（MUST）。`ARCHIVE_USAGE` は `archive.ts` への移動後も `command-registry.ts` から re-export される。

#### Scenario: ARCHIVE_USAGE が command-registry から import 可能である

**Given** `ARCHIVE_USAGE` が `src/cli/archive.ts` に移動し、`command-registry.ts` が re-export している
**When** テストファイルが `import { ARCHIVE_USAGE } from "../command-registry.js"` を実行する
**Then** `ARCHIVE_USAGE` 文字列が正常に解決され、`expect(ARCHIVE_USAGE).toContain("--from-issue")` が成立する

---

### Requirement: repository 全体の process.exit 件数が変化しない

R3a は process.exit の集約・削減・return contract 化を行わない（MUST）。registry 内の 67 件の process.exit はすべて handler 側に移動するため、repository 全体の process.exit 件数は変化しない。

#### Scenario: process.exit 件数が変化しない

**Given** 本リファクタリング前に `grep -r "process.exit" src/ --include="*.ts" | wc -l` で計測した件数がある
**When** 全抽出作業完了後に同コマンドで再計測する
**Then** 件数が同一である（削減も増加もしていない）
