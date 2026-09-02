# Design: CommandSpec registry から inline handler を command module へ抽出する

## Context

`src/cli/command-registry.ts`（1,696 行）は CLI の宣言正本（CommandSpec ツリー・resolve API・パーサー）と実処理（flag coercion・arg validation・GitHub client 生成・filesystem 操作・process.exit）が同一ファイルに混在している。

現行の集中状況:
- inline `handler: async ...` が 29 件（CommandSpec ツリー内に埋め込み）
- `process.exit(...)` が 67 件（すべてのコマンドの終了処理）
- `fs`・`path`・`resolveGitHubToken`・`createGitHubClient`・`loadConfigWithOverlay`・`parseRequestMdRaw` 等のビジネス I/O value import が存在

一部のコマンド（`job start` / `runJobHandler`）はすでに named function に分離されているが、同じファイル内に定義が残っている。

このリファクタは R1〜R2c 完了後の R3a であり、**CLI の宣言変更と実処理の変更を分離**する純粋なコード移動に限定する。ユーザー向け挙動・process.exit の条件・exit code・出力文字列は変えない。

## Goals / Non-Goals

**Goals**:
- 29 件の inline handler を命名済み関数参照へ置換し、CommandSpec ツリー内の実装コードをゼロにする
- registry から filesystem・credential・GitHub client 生成の value import を除去する
- registry 内の process.exit を 67 件から 0 件にする（handler 側へ意味を変えずに移動）
- registry → handler module の一方向 import 構造を確立する（循環禁止）
- CLI contract の構造比較（path / flag / alias / guard / help）が変更前後で一致することを検証する
- 再集中を防ぐ architecture ratchet を追加する

**Non-Goals**:
- process.exit を集約・削減・return contract 化する（R3b）
- CommandSpec・parser・help・dispatch の再設計
- command 名・flag・help・出力・exit code の変更
- handler の return type 変更
- 新しい DI framework・service locator の導入
- 無関係な dead code 削除や format 変更

## Decisions

### D1: Handler 配置戦略（既存モジュール拡張 + 最小限の新規ファイル）

inline handler は「そのコマンドのビジネスロジックを既に所有する CLI モジュール」に抽出する。既存 CLI モジュールが存在しない command family に対してのみ新規ファイルを作成する。

**既存モジュールに handler 関数を追加するグループ:**

| 抽出先モジュール | 追加する handler 関数 |
|---|---|
| `src/cli/init.ts` | `handleInit` |
| `src/cli/login.ts` | `handleLogin` |
| `src/cli/credentials.ts` | `handleCredentialsSet` |
| `src/cli/run.ts` | `handleJobStart`（`runJobHandler` を改名・移動）、`resolveSlugForDetach` を移動 |
| `src/cli/ps.ts` | `handleJobLs`、`handleJobStats` |
| `src/cli/job-show.ts` | `handleJobShow` |
| `src/cli/job-wait.ts` | `handleJobWait` |
| `src/cli/cancel.ts` | `handleJobCancel` |
| `src/cli/resume.ts` | `handleJobResume` |
| `src/cli/reopen.ts` | `handleJobReopen` |
| `src/cli/attach.ts` | `handleJobAttach` |
| `src/cli/archive.ts` | `handleJobArchive` |
| `src/cli/prune.ts` | `handleJobPrune` |
| `src/cli/managed.ts` | `handleRuntimeSetup`、`handleRuntimeStatus`、`handleRuntimeReset` |
| `src/cli/doctor.ts` | `handleDoctor`、`handleDoctorRepair` |
| `src/cli/config-effective.ts` | `handleConfigEffective` |
| `src/cli/inbox.ts` | `handleInboxRun` |

**新規ファイル（対応する CLI モジュールが存在しないため）:**

| 新規ファイル | 担当する handler |
|---|---|
| `src/cli/request-handlers.ts` | `handleRequestNew`、`handleRequestPrompt`、`handleRequestLs`、`handleRequestTemplate`、`handleRequestValidate` |
| `src/cli/scaffold-handlers.ts` | `handleRulesNew`、`handleReviewersNew` |
| `src/cli/guide-handler.ts` | `handleGuide` |
| `src/cli/usage-handler.ts` | `handleUsage` |

**Rationale**: 既存モジュールに追加することでファイル増殖を最小化し、所有境界を明確にする。`request.*` は CLI モジュールが存在せず（実処理が `core/command/request*.ts` にある）、5 件まとめて新規ファイルが自然。`rules.new` + `reviewers.new` は同一パターン（scaffold 系）で件数が少ないため 1 ファイルにまとめる。

**Alternatives considered**:
- 全 handler を `src/cli/handlers.ts` 1 ファイルへ移動 → 新たな集中点を作るだけで解決しない。却下。
- `src/cli/handlers/` サブディレクトリを新設 → 既存 `src/cli/*.ts` 構造と二重になりディレクトリ追加の意味がない。却下。
- 1 コマンド 1 ファイル → thin wrapper 関数 1 件のためにファイルを乱立させる。却下。

### D2: CommandHandler 型の中立モジュールへの移動

`src/cli/command-handler.ts` を新規作成し、`CommandHandler` 型のみをエクスポートする。`command-registry.ts` と handler モジュール双方がここから型をインポートする。`command-registry.ts` は `export type { CommandHandler }` で後方互換性を維持する。

```
command-registry.ts  →  command-handler.ts  (type import)
handler modules      →  command-handler.ts  (type import)
```

**Rationale**: handler モジュールが `CommandHandler` 型を明示的に使いたい場合、`command-registry.ts` からの `import type` は値 import ではないため技術的には許容されるが、誤って value import に変化するリスクがある。中立モジュールに分離することで意図を明確にし、import 方向の違反を防ぐ。

**Alternatives considered**:
- `CommandHandler` を `command-registry.ts` に残し、handler モジュールは structural typing のみで型アノテーションなしに実装 → 型の明示性が低下する。却下。
- `CommandHandler` を `command-registry.ts` に残し、handler から `import type` 許容 → `import type` は安全だが、型・値の境界混同を招きやすい。中立モジュールのほうが意図が明確。却下。

### D3: USAGE 文字列の帰属

USAGE 定数のうち `help.detail` フィールドにのみ参照されるものは `command-registry.ts` に残す（CLI 契約メタデータとして registry が所有する）。

唯一の例外は **`ARCHIVE_USAGE`**：handler 本体内で `stderrWrite(ARCHIVE_USAGE)` として参照されるため、`archive.ts` へ移動し、`command-registry.ts` から re-export して既存テストの import パスを維持する。

再エクスポート例:
```typescript
// command-registry.ts
export { ARCHIVE_USAGE } from "./archive.js";
```

`LOGIN_USAGE`・`JOB_RESUME_USAGE`・`REOPEN_USAGE` は handler 本体で参照されず `help.detail` のみで使うため、`command-registry.ts` に残す。既存テストの import は変更不要。

**Rationale**: handler が USAGE 文字列を参照する場合は handler モジュールへ移動が必要（registry からの import は循環になる）。handler 参照のない USAGE 文字列を全部移動すると registry 側の import が増えるだけで複雑化する。最小限の移動（ARCHIVE_USAGE のみ）が妥当。

**Alternatives considered**:
- 全 USAGE 文字列を `src/cli/usage-strings.ts` へ一括移動 → 両方（registry と handler）がインポートする共有モジュールになるが、strings は CLI 契約の一部として registry が所有するほうが意味論的に正しい。却下。
- ARCHIVE_USAGE を registry に残し handler にコピー/リファクタ → 意味を変えずに移動するという要件に違反する。却下。

### D4: Architecture Ratchet の実装方針

`src/cli/__tests__/architecture-ratchet.test.ts` を新規作成し、以下を vitest で机械検出する:

1. **Runtime handler.name チェック**: `COMMANDS` をインポートして全 CommandSpec ノードを再帰的に走査し、`spec.handler?.name === "handler"` でないことを確認する（object literal property に定義された無名アロー関数は JS エンジンがプロパティ名を name として付与するため、inline であれば `name === "handler"` になる; named function 参照なら本来の関数名が保持される）

2. **ソーステキストの process.exit チェック**: `command-registry.ts` のソースを読み込み、ラインコメント（`//`）とブロックコメント（`/* */`）を正規表現で除去した後、`process.exit` が 0 件であることを確認する

3. **Import graph cycle チェック**: `@typescript-eslint/parser`（既存 devDep）で各 handler モジュールの import 宣言を解析し、`command-registry` への value import が 0 件であることを確認する

4. **並行 CLI 契約正本チェック**: `src/cli/` 配下のファイルを列挙し、`COMMANDS` という変数を export するファイルが `command-registry.ts` のみであることを確認する

**Rationale**: Runtime handler.name チェックは AST パースなしで確実に動作する。ソーステキストチェックはコメント除去があれば単純 grep より信頼性が高い。`@typescript-eslint/parser` は既存 devDep であり追加依存なし。

**Alternatives considered**:
- ESLint カスタムルール → プラグイン基盤の構築が必要で複雑。却下。
- `typescript` compiler API で完全 AST 解析 → より強力だが `@typescript-eslint/parser` で十分。`typescript` は devDep にあるため利用可能だが、eslint parser のほうがシンプル。
- 単純 grep のみ → コメント内の `process.exit` などで誤検知の可能性。要件が「AST 等の構造検査を優先」と明示。却下。

### D5: CLI contract snapshot

`src/cli/__tests__/cli-contract-snapshot.test.ts` で COMMANDS ツリーを正規化形式（path / flags 名一覧 / aliases / requiresRepo / worktreeGuard の boolean）にシリアライズし、vitest snapshot（`toMatchSnapshot`）として固定する。

refactoring 前にスナップショットを生成・コミットし、抽出後も同一スナップショットと一致することで CLI 契約の同一性を保証する。

## Risks / Trade-offs

- **[Risk] 17 モジュールへの変更分散によるレビュー負荷増加** → Mitigation: 各モジュールへの変更は `handleXxx` 関数の追加のみで既存ロジックへの変更はゼロ。テスト対象は handler 関数の入出力であり、既存テストへの影響はない。

- **[Risk] dynamic import の扱い** → `doctor.repair` と `job.start (--issue path)` はそれぞれ `repairSlugOccupancySidecar`・`startWithIssueLink` を dynamic import している。これらは抽出先モジュールにそのまま移動する（static import への変換は行わない）。

- **[Risk] USAGE 定数の再エクスポートによる整合性維持** → `ARCHIVE_USAGE` は `archive.ts` で定義し `command-registry.ts` が re-export する。`archive.ts` の文字列変更が registry 経由のテストにも反映されるため整合性は保たれる。

- **[Risk] handler.name 依存の信頼性** → JavaScript エンジンはオブジェクトリテラルのプロパティに inline 定義された関数に対して、そのプロパティ名を `.name` として付与する（ES2015+ の名前推論）。Bun の V8 エンジンで同様の動作が確認できる。named function reference はその定義名を保持するため区別可能。ただし `handler: runJobHandler` のようなケースは `runJobHandler` を name として持つため、`name === "handler"` フィルタで正確に検出可能。

## Open Questions

なし。すべての設計判断は現在のコードベースと要件から決定可能。
