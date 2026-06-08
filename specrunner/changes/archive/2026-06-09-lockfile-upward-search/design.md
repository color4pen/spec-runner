# Design: detectPackageManager の lockfile 上位探索と lockfile root の PATH 反映

## Context

`src/util/detect-pm.ts` の `detectPackageManager(cwd, fsLike?)` は `cwd` 1 ディレクトリだけで lockfile を
探し、単一の `PackageManager` を返す。pnpm workspace（monorepo）では lockfile（`pnpm-lock.yaml`）が
workspace root にあり、サブパッケージ / worktree checkout の起点には無い。結果として lockfile を取り逃して
`npm` に fallback し、`npm ci` が走って install が壊れる。

さらに `src/core/verification/commands.ts` の `spawnCommand(command, cwd, env)` は `cwd/node_modules/.bin`
だけを子プロセスの `PATH` 先頭に付与する。pnpm workspace では binary が workspace root の
`node_modules/.bin` に hoist されるため、`cwd` からは見つからず、`verification.commands` が直接 binary
（`tsc` / `eslint` / `vitest` 等）を起動するケースで command not found になる。

検出関数 `detectPackageManager` の consumer は 3 箇所:

| # | 箇所 | 検出 cwd | PM の用途 | root の要否 |
|---|------|---------|----------|------------|
| 1 | `src/core/worktree/manager.ts` `create()` | `repoRoot` | install コマンド導出 | 不要（PM のみ） |
| 2 | `src/core/verification/runner.ts` phase 経路 | verification cwd | run コマンド導出 | 不要（PM のみ） |
| 3 | `src/core/doctor/checks/runtime/package-manager.ts` | `ctx.cwd` | `<pm> --version` 検証 | 不要（PM のみ） |

`spawnCommand` の唯一の呼び出し元は `runVerificationCommands`（commands 経路、`runner.ts:301`）であり、
ここが lockfile root を `spawnCommand` に渡す責務を持つ。

### 触れる seam

- `src/util/detect-pm.ts` — `detectPackageManager` を上位探索化し、戻り値を `{ pm, root }` に変更。
- `src/core/verification/commands.ts` — `spawnCommand` に `root` 引数を追加し PATH に root の `.bin` を反映。
- `src/core/verification/runner.ts` — phase 経路は `{ pm }` で取得。commands 経路は `root` を検出して `spawnCommand` に渡す。
- `src/core/worktree/manager.ts` — `{ pm }` で取得（DI 境界で吸収、後述 D5）。
- `src/core/doctor/checks/runtime/package-manager.ts` — `{ pm }` で取得。

`installCommand` / `runCommand`（PM → コマンド導出の pure 関数）は変更しない。外部依存は増やさない
（`node:*` のみ）。

## Goals / Non-Goals

**Goals**:

- `detectPackageManager` を `cwd` → git root（`.git` 存在まで、git root 自身を含む）→ filesystem root の
  順に上位探索させ、最初に見つかった lockfile の PM を返す。
- 戻り値を `{ pm, root }` に変更し、lockfile を見つけたディレクトリのパスを呼び出し元へ渡す。lockfile
  不在時は `root = cwd`。
- `spawnCommand` が `cwd/node_modules/.bin` に加えて lockfile root の `node_modules/.bin` も PATH に
  付与する（`cwd` 優先）。
- commands 経路が検出した lockfile root を `spawnCommand` に渡す。
- 単一パッケージプロジェクト（`cwd` に lockfile がある）の挙動を完全保存する（後方互換）。

**Non-Goals**:

- pnpm workspace の `--filter` 対応（install 時の workspace 個別 install）。
- lockfile root と cwd が異なる場合の install / verification command の**実行場所**の変更（install は
  引き続き worktree cwd で、command は引き続き verification cwd で実行する）。本変更は PATH の付与のみ。
- `packageManager` フィールドの上位探索（fallback はこれまでどおり `cwd` の `package.json` のみを読む）。
- 検出結果の cross-call キャッシュ機構の導入。

## Decisions

### D1: 上位探索は「lockfile 確認 → `.git` 確認 → 親へ」を 1 ディレクトリ単位で繰り返す

各ディレクトリ `dir` で次の順に処理する:

1. 既存の固定優先順序で lockfile を `existsSync(join(dir, <lockfile>))` 確認。見つかれば
   `{ pm, root: dir }` を返して終了。
2. lockfile が無ければ `existsSync(join(dir, ".git"))` を確認。存在すれば `dir` を git root とみなし、
   ループを停止する（git root 自身の lockfile は手順 1 で既に確認済みなので、上位へは進まない）。
3. `parent = path.dirname(dir)`。`parent === dir`（filesystem root 到達）ならループを停止する。
   そうでなければ `dir = parent` として手順 1 へ戻る。

ループ停止後は、`cwd` の `package.json` の `packageManager` フィールド → `npm` fallback の既存ロジックで
PM を決定し、`{ pm, root: cwd }` を返す。

**Rationale**: 「lockfile を先に確認してから `.git` を確認する」順序が、git root 自身に lockfile がある
monorepo（workspace root = git root）を正しく拾う鍵。`.git` は worktree ではファイル（gitdir pointer）
なので `existsSync` でディレクトリ / ファイル両方を 1 つの判定で拾える（architect 評価済み）。
`path.dirname` の不動点（`path.dirname("/") === "/"`）で filesystem root を検出でき、無限ループを防ぐ。

**Alternatives considered**:

- *`.git` を lockfile より先に確認する*: git root 自身の lockfile を取り逃す（workspace root = git root の
  monorepo で誤って npm fallback する）。却下。
- *git root を `git rev-parse --show-toplevel` の subprocess で求める*: 検出関数が util 層の純粋な fs
  依存から subprocess 依存に格上げされ、`DetectPmFs` モックで単体テストできなくなる。`.git` の
  `existsSync` 判定なら既存の fs インターフェースで完結する。却下。

### D2: 戻り値を `{ pm, root }` オブジェクトに変更する

```text
interface DetectPmResult { pm: PackageManager; root: string }
detectPackageManager(cwd: string, fsLike?: DetectPmFs): Promise<DetectPmResult>
```

`pm` は検出した PM、`root` は lockfile が存在したディレクトリの絶対パス。lockfile 不在時
（`packageManager` フィールド / `npm` fallback）は `root = cwd`。

**Rationale**: 呼び出し元が PATH 用に lockfile root を必要とするのは commands 経路だけだが、PM と root を
1 関数で一貫して返す方が、検出ロジックの単一情報源を保てる。root を分離した second function にすると
同一探索を 2 回行うか状態を共有する必要があり複雑。architect 評価済みの戻り値設計。

**Alternatives considered**: *PM だけ返し root は別関数で再探索*: 同一 fs 探索の二重実行。却下。

### D3: `spawnCommand` に `root` 引数を追加し PATH を `cwd/.bin:root/.bin:original` 順にする

`spawnCommand(command, cwd, env, root?)` の `root` は optional（既定 `cwd`）。PATH 先頭に付与する
`.bin` の集合を組み立てる:

- 常に `cwd/node_modules/.bin` を含める。
- `root` が指定され、かつ `cwd` と異なる場合のみ `root/node_modules/.bin` を `cwd` のものの**後ろ**に
  追加する。
- 元の `env.PATH` はその後ろに連結する（`env.PATH` 不在時は `.bin` 群のみ）。

**Rationale**: `cwd` を優先順位の先頭に置くことで、workspace package のローカル依存が workspace root に
hoist された依存に勝つ（architect 評価済みの PATH 順序）。`root` を optional + 既定 `cwd` にすることで、
既存の 3 引数呼び出し（`commands.test.ts` の C-01〜C-03 等）が PATH 挙動を変えずにそのまま通る
（後方互換）。`root === cwd` のとき重複付与を避ける。

**Alternatives considered**:

- *`spawnCommand` 内部で `detectPackageManager` を呼んで root を自前で求める*: `spawnCommand` が util の
  検出ロジックに依存し、純粋な spawn ユーティリティでなくなる。検出は呼び出し側（commands 経路）の
  責務に留め、`spawnCommand` は与えられた root を PATH に反映するだけにする。却下。

### D4: commands 経路（`runVerificationCommands`）が root を検出して `spawnCommand` に渡す

`runVerificationCommands(slug, cwd, rawCommands)` の冒頭で `const { root } = await detectPackageManager(cwd);`
を 1 回求め、各コマンドの `spawnCommand(cmd.run, cwd, env, root)` 呼び出しに渡す。コマンドの実行 cwd・
`sh -c` 実行方式・fail-fast 順序は変更しない。

**Rationale**: 受け入れ基準「`spawnCommand()` が lockfile root の `node_modules/.bin` を PATH に含める」を
end-to-end で満たすには、唯一の呼び出し元である commands 経路が root を供給する必要がある。検出を
ループ外で 1 回行うのはローカル変数の再利用であり、「キャッシュしない」方針と矛盾しない。

request の「スコープ外: verification.commands path への影響（commands は `sh -c` で実行されるため PATH は
呼び出し側に依存しない）」との整合: 本変更はコマンドの**実行場所（cwd）・実行方式（`sh -c`）・順序**を
一切変えず、`PATH` への lockfile root の `.bin` 付与（加算的変更）のみを行う。これは要件 3 と受け入れ
基準が明示的に要求する振る舞いであり、commands の実行セマンティクスの再設計には当たらない。

**Alternatives considered**: *commands 経路を変更せず `spawnCommand` の root を常に未指定にする*: 受け入れ
基準を end-to-end で満たせず、monorepo で直接 binary を起動する verification command が解決できないまま。
却下。

### D5: worktree manager の DI 境界で `{ pm }` へ縮約し既存 DI 型 / テストを保つ

`createWorktreeManager` の DI 引数 `detectPmFn?: (cwd: string) => Promise<PackageManager>` の**型は据え置く**。
本体のデフォルトを `detectPackageManager` 直結から `async (c) => (await detectPackageManager(c)).pm` への
アダプタに変更する。`create()` 内は従来どおり `const pm = await detectPm(repoRoot);` のまま。

**Rationale**: worktree manager は PM のみを使い（install は worktree cwd で実行、PM binary はグローバル
PATH 上、lockfile root の `.bin` 反映は不要）、root を必要としない。DI 型を `PackageManager` のまま保つ
ことで、既存の manager テストの `makePmStub`（`PackageManager` を返す stub）が**無改修で通る**。戻り値
変更の影響範囲を検出関数本体と直接の 3 consumer に局所化する。

**Alternatives considered**: *DI 型も `{ pm, root }` に変更*: manager テストの全 stub と happy-path /
cleanup / retry 系の多数ケースを改修する必要があり、PM しか使わない manager に root 概念を漏らす。却下。

### D6: phase 経路 / doctor は `{ pm }` 分解で取得する

- `runVerificationPhases`: `const { pm } = await detectPackageManager(cwd); const toRunCmd = runCommand(pm);`
- doctor `package-manager.ts`: `const { pm } = await detectPackageManager(ctx.cwd, ctx.fs);`

いずれも PM のみ使用し root は使わない。`DoctorFs` は `existsSync` / `readFile` を持ち、上位探索が使う
fs インターフェース（`DetectPmFs`）を構造的に満たし続けるため doctor の検出はそのまま機能する。

**Rationale**: phase 経路の run コマンドと doctor の `<pm> --version` 検証はいずれも PM 名だけで足り、
最小の分解で戻り値変更に追従する。

## Risks / Trade-offs

- [Risk] 戻り値変更で既存の `detect-pm.test.ts`（`.toBe("pnpm")` 等の文字列比較 9+ 件）が壊れる →
  Mitigation: 既存アサーションを `(await detectPackageManager(...)).pm` 形式に更新し、新規に上位探索 /
  root / `.git` 境界の test case を追加する（test-case-gen / implementer が担当）。
- [Risk] 上位探索により `existsSync` の呼び出し回数が増える → Mitigation: `existsSync` のコストは無視
  できる（archived ADR で architect 評価済み）。深さは git root までで有界。filesystem root も `dirname`
  不動点で停止する。
- [Risk] commands 経路に PM 検出が加わり、検出が失敗 / 例外で commands 全体を止める懸念 → Mitigation:
  `detectPackageManager` は内部で readFile / parse 例外を握りつぶし常に値を返す設計（fallback `npm`,
  `root = cwd`）。例外を投げないため commands 実行を阻害しない。
- [Trade-off] `spawnCommand` の引数が 4 つに増える → optional + 既定 `cwd` で既存 3 引数呼び出しの後方
  互換を保ち、影響を最小化する。
- [Trade-off] worktree manager の DI 型を据え置くアダプタ方式は、戻り値の shape が境界で 2 種
  （`{pm,root}` と `PackageManager`）併存する → 影響範囲の局所化とテスト無改修を優先し許容する。

## Open Questions

- なし（上位探索の停止条件・戻り値 shape・PATH 順序はすべて request の architect 評価済み設計判断で確定。
  commands 経路への root 配線は受け入れ基準を満たすための必然であり、D4 でスコープ外記述との整合を明示
  済み）。
