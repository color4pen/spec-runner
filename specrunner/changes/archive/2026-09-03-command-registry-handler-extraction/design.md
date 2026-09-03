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
| `src/cli/run.ts` | （なし）— `handleJobStart`・`resolveSlugForDetach` は D7 により `job-start-handler.ts` に置く。`run.ts` は `runRun` / `runRunCore` の primitive のみを持つ |
| `src/cli/ps.ts` | `handleJobLs`、`handleJobStats` |
| `src/cli/job-show.ts` | `handleJobShow` |
| `src/cli/job-wait.ts` | `handleJobWait` |
| `src/cli/cancel.ts` | `handleJobCancel` |
| `src/cli/resume.ts` | （なし）— `handleJobResume` は D7 により `job-resume-handler.ts` に置く |
| `src/cli/reopen.ts` | `handleJobReopen` |
| `src/cli/attach.ts` | `handleJobAttach` |
| `src/cli/archive.ts` | （なし）— `handleJobArchive` は D7 により `job-archive-handler.ts` に置く。`ARCHIVE_USAGE` は D3 のとおり `archive.ts` が所有する |
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
| `src/cli/job-start-handler.ts` | `handleJobStart`、`resolveSlugForDetach`（D7: `run.ts` ↔ `from-issue.ts` の循環回避） |
| `src/cli/job-resume-handler.ts` | `handleJobResume`（D7: `resume.ts` ↔ `resume-from-issue.ts` の循環回避） |
| `src/cli/job-archive-handler.ts` | `handleJobArchive`（D7: `archive.ts` ↔ `archive-from-issue.ts` の循環回避） |

**Rationale**: 既存モジュールに追加することでファイル増殖を最小化し、所有境界を明確にする。`request.*` は CLI モジュールが存在せず（実処理が `core/command/request*.ts` にある）、5 件まとめて新規ファイルが自然。`rules.new` + `reviewers.new` は同一パターン（scaffold 系）で件数が少ないため 1 ファイルにまとめる。`job.start` / `job.resume` / `job.archive` の 3 件だけは既存モジュール（`run.ts` 等）に置くと `*-from-issue.ts` との相互 value import になるため、D7 のとおり独立 handler module に置く（PR #1109 review による改訂）。

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

3. **Import graph cycle チェック**: `@typescript-eslint/parser`（既存 devDep）で `src/cli/` 配下の全 `.ts` ファイルを動的に列挙（`fs.readdirSync` 等）し、`command-registry.ts` 自身を除外した全ファイルの import 宣言を解析する。`command-registry` を参照する `ImportDeclaration`（type-only でないもの）が 0 件であることを確認する。ハードコードリストに依存しないことで、将来 `src/cli/` に新規ハンドラモジュールが追加されても自動的に検査対象に含まれる。

4. **並行 CLI 契約正本チェック**: `src/cli/` 配下のファイルを列挙し、`COMMANDS` という変数を export するファイルが `command-registry.ts` のみであることを確認する

5. **`src/cli` 内 value-import 循環ゼロチェック**: `src/cli/` 配下（`__tests__` を除く）の全 `.ts` を同じ parser で解析し、相対 specifier（`./` / `../`）を持つ type-only でない `ImportDeclaration` から有向グラフを構築して、`src/cli/` 内で閉じる強連結成分（サイズ 2 以上）が 0 件であることを確認する（Tarjan 等の標準アルゴリズムで良い）

6. **`src/cli` 内部モジュールへの dynamic import ゼロチェック**: 同じ AST 走査で `ImportExpression`（`import(...)`）を収集し、specifier が `./` で始まるものが 0 件であることを確認する。既存の `../core/occupancy/repair.js`（`doctor.ts`）と `../core/issue-target/start.js`（`job-start-handler.ts`）は `../core` 配下であり対象外

**Rationale**: チェック 5・6 は PR #1109 review（`run.ts` ↔ `from-issue.ts` 等の循環を `await import()` で隠していた 3 箇所）を機械検出するために追加した。Runtime handler.name チェックは AST パースなしで確実に動作する。ソーステキストチェックはコメント除去があれば単純 grep より信頼性が高い。`@typescript-eslint/parser` は既存 devDep であり追加依存なし。

**Alternatives considered**:
- ESLint カスタムルール → プラグイン基盤の構築が必要で複雑。却下。
- `typescript` compiler API で完全 AST 解析 → より強力だが `@typescript-eslint/parser` で十分。`typescript` は devDep にあるため利用可能だが、eslint parser のほうがシンプル。
- 単純 grep のみ → コメント内の `process.exit` などで誤検知の可能性。要件が「AST 等の構造検査を優先」と明示。却下。

### D5: CLI contract の構造比較（base 由来の期待値との全項目比較）

`src/cli/__tests__/cli-contract-normalize.ts` に `normalizeCommandsTree(commands)` を置き、COMMANDS ツリーを **handler の同一性以外のすべての CommandSpec 情報** を含む正規化形式にシリアライズする:

- `path`・`summary`・`visibility`・`aliasOf`・`requiresRepo`・`worktreeGuard`
- `args`: 各 `ArgSpec` の `name`・`required`・`count`
- `flags`: flag 名でソートし、各 `FlagDef` の `type`・`min`・`values`・`deprecated`（`deprecated.message` が関数の場合は `"<function>"` に正規化する）
- `help`: `group`・`summary`・`detail` の文字列（`ARCHIVE_USAGE` の re-export 経由を含む）
- `hasHandler`: `handler !== undefined`
- `children`: key でソートして再帰

期待値は候補ブランチで生成した snapshot ではなく、**base（merge-base = main `483c75f7`）の `command-registry.ts` から生成した JSON fixture** `src/cli/__tests__/fixtures/cli-contract.base.json` とし、`cli-contract-snapshot.test.ts` は `expect(normalizeCommandsTree(COMMANDS)).toEqual(baseFixture)` で比較する。vitest の `toMatchSnapshot` と `__snapshots__/cli-contract-snapshot.test.ts.snap` は削除する（候補側で再生成できる期待値は「変更前と同一」の証明にならない）。

fixture の生成手順（テストファイルのヘッダコメントに base SHA とともに記録する）:

```bash
git show 483c75f7:src/cli/command-registry.ts > src/cli/command-registry.base.tmp.ts
cat > src/cli/__tests__/dump-base.tmp.ts <<'EOF'
import { COMMANDS } from "../command-registry.base.tmp.js";
import { normalizeCommandsTree } from "./cli-contract-normalize.js";
console.log(JSON.stringify(normalizeCommandsTree(COMMANDS), null, 2));
EOF
bun src/cli/__tests__/dump-base.tmp.ts > src/cli/__tests__/fixtures/cli-contract.base.json
rm src/cli/command-registry.base.tmp.ts src/cli/__tests__/dump-base.tmp.ts
```

base の registry が import する `./*.js` モジュールは候補ブランチにもすべて存在するため、この手順は候補 worktree 内で完結する。conformance は同じ手順で fixture を再生成して差分 0 を確認できる。

**Rationale**: spec の Requirement「CLI 契約が変更前後で同一である」は flag の型・制約・help まで含む。旧 D5 の正規化（flag 名と boolean のみ）ではこの要件を検証できず、また期待値が候補側で生成されるため「変更前と一致」の証明になっていなかった（PR #1109 review Finding 3）。

### D6: bin/specrunner.ts の error 判定は変更しない（code-review iter 1 Finding 3 の裁定を PR #1109 review により改訂）

code-review iter 1 Finding 3 で受け入れた duck-type guard（`isFlagParseError` / `isSpecRunnerError`）は **撤回する**。`bin/specrunner.ts` は base（`483c75f7`）と差分ゼロに戻し、`main()` の判定は `instanceof FlagParseError` / `instanceof SpecRunnerError` のままとする。request.md の停止条件「dispatch error boundary の変更」に該当する変更を production に入れない。

guard が必要になった原因は、`vi.resetModules()` を使う `tests/unit/cli/*.test.ts` が `bin/specrunner.ts` の `main` を静的 import で 1 度だけ読み込み、各テストで handler module 側だけを reset 後に再 import するため、`flag-parser.js` / `errors.js` のクラスが 2 つの module registry に分裂することにある。修正は production の判定を緩めるのではなく、テスト側で分裂を止める: `main` と error class を各テストで `vi.resetModules()` の**後に** `await import()` で同一 registry から取得する（または当該テストで `resetModules` を使わない）。どちらを選ぶかはテストごとに判断してよいが、production コードでの回避（duck-type、`name` 比較、`Symbol.hasInstance`）は禁止する。

**Rationale**: duck-type guard は `name` が一致するだけの無関係な Error を誤認する可能性を production に持ち込む。テスト都合の変更を production の error 境界に入れない（R3a は純粋な移動）。

### D7: `src/cli` 内の value-import 循環の禁止と job.start / job.resume / job.archive の handler 配置

抽出後の `run.ts` ↔ `from-issue.ts`、`resume.ts` ↔ `resume-from-issue.ts`、`archive.ts` ↔ `archive-from-issue.ts` は相互 value import になり、候補は `await import()` で隠していた（PR #1109 review Finding 1）。base では registry が両者を static import しており循環はなかった。抽出で新たな循環を作らないため、次の構造にする:

```
job-start-handler.ts   → run.ts（runRun / runRunCore）, from-issue.ts（runFromIssue）
job-resume-handler.ts  → resume.ts（runResume）, resume-from-issue.ts（runResumeFromIssue）
job-archive-handler.ts → archive.ts（runArchive / ARCHIVE_USAGE）, archive-from-issue.ts（runArchiveFromIssue）
from-issue.ts          → run.ts（runRunCore）          （既存・変更なし）
resume-from-issue.ts   → resume.ts（runResumeCore）    （既存・変更なし）
archive-from-issue.ts  → archive.ts（runArchive）      （既存・変更なし）
```

- handler module は primitive を static import する。primitive module（`run.ts` / `resume.ts` / `archive.ts` / `*-from-issue.ts`）は handler module を import しない。
- `src/cli/` 内部モジュール（specifier が `./` で始まるもの）への dynamic import は 0 件（ratchet チェック 6）。`src/cli/` 内の value-import グラフは非循環（ratchet チェック 5）。
- `resolveSlugForDetach` は `handleJobStart` 専用のため `job-start-handler.ts` に置く。
- `command-registry.ts` は 3 つの handler module から `handleJobStart` / `handleJobResume` / `handleJobArchive` を import する。

**テストの方針**: `src/cli/__tests__/*.test.ts` は handler を再実装（guard・routing・`process.exit` の写し）せず、handler module から実物を import し、primitive（`runRunCore`・`runFromIssue` 等）だけを `vi.mock` する。候補にあった 7 ファイル（`from-issue.test.ts`・`resume-from-issue.test.ts`・`archive-from-issue.test.ts`・`command-registry-adopt-commits.test.ts`・`command-registry-apply-canon.test.ts`・`command-registry-resume.test.ts`・`detach-flag-cli.test.ts`）の複製 mock は撤去する（PR #1109 review Finding 2）。handler が primitive を static import するようになるため、mock した primitive は実 handler から呼ばれる。

**Alternatives considered**:
- `*-from-issue.ts` 側から primitive を dynamic import する → 循環の隠蔽先が移るだけ。却下。
- `runRunCore` 等を第 3 のモジュールへ移して `run.ts` から handler を export する → 移動量が増え、R3a「純粋な移動」の範囲を超える。却下。

## Risks / Trade-offs

- **[Risk] 17 モジュールへの変更分散によるレビュー負荷増加** → Mitigation: 各モジュールへの変更は `handleXxx` 関数の追加のみで既存ロジックへの変更はゼロ。テスト対象は handler 関数の入出力であり、既存テストへの影響はない。

- **[Risk] dynamic import の扱い** → `doctor.repair` と `job.start (--issue path)` はそれぞれ `repairSlugOccupancySidecar`・`startWithIssueLink` を dynamic import している。これらは抽出先モジュールにそのまま移動する（static import への変換は行わない）。一方、抽出に伴って新設した `./from-issue.js`・`./resume-from-issue.js`・`./archive-from-issue.js` への `await import()`（`src/cli/` 内部モジュールへの dynamic import）は循環の隠蔽であり禁止する（D7、ratchet チェック 6）。

- **[Risk] USAGE 定数の再エクスポートによる整合性維持** → `ARCHIVE_USAGE` は `archive.ts` で定義し `command-registry.ts` が re-export する。`archive.ts` の文字列変更が registry 経由のテストにも反映されるため整合性は保たれる。

- **[Risk] base fixture の陳腐化** → main が進んで CLI 契約が変わった場合、fixture は merge-base 時点の契約を表す。本 change の base は `483c75f7` に固定し、rebase 時は D5 の手順で再生成する。

- **[Risk] handler.name 依存の信頼性** → JavaScript エンジンはオブジェクトリテラルのプロパティに inline 定義された関数に対して、そのプロパティ名を `.name` として付与する（ES2015+ の名前推論）。Bun の V8 エンジンで同様の動作が確認できる。named function reference はその定義名を保持するため区別可能。ただし `handler: runJobHandler` のようなケースは `runJobHandler` を name として持つため、`name === "handler"` フィルタで正確に検出可能。

## Open Questions

なし。すべての設計判断は現在のコードベースと要件から決定可能。
