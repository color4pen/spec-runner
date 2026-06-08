# パッケージマネージャを自動検出して bun ハードコードを解消する

## Meta

- **type**: spec-change
- **slug**: detect-package-manager
- **base-branch**: main
- **adr**: true

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

## 背景

specrunner は pipeline 実行中に `bun install --frozen-lockfile`（worktree 作成時）と `bun run <script>`（verification step）を直接叩いている。CLI 自体は `#!/usr/bin/env node` で node 上で動くが、対象プロジェクトが pnpm / npm / yarn を使っている場合、bun コマンドが存在しないか、正しい lockfile を読まずにインストールされる。

現在 bun がハードコードされている箇所:

1. `src/core/worktree/manager.ts:116-120` — `bun install --frozen-lockfile`
2. `src/core/verification/runner.ts:71` — `spawn("bun", ["run", script], ...)`
3. `src/core/doctor/checks/runtime/bun.ts` — bun の存在を required チェック

業界標準はプロジェクトの lockfile から package manager を検出する方式（Turborepo / Nx / create-next-app が採用）。lockfile と PM の対応は決定的:

| lockfile | PM | install | run |
|---|---|---|---|
| `pnpm-lock.yaml` | pnpm | `pnpm install --frozen-lockfile` | `pnpm run <script>` |
| `bun.lockb` / `bun.lock` | bun | `bun install --frozen-lockfile` | `bun run <script>` |
| `yarn.lock` | yarn | `yarn install --frozen-lockfile` | `yarn run <script>` |
| `package-lock.json` | npm | `npm ci` | `npm run <script>` |

## 要件

1. lockfile ベースのパッケージマネージャ検出関数を `src/util/detect-pm.ts` に新設する。外部ライブラリを追加しない（inline 実装）。検出優先順: lockfile → `package.json` の `packageManager` フィールド → fallback `npm`。
2. 検出結果から install コマンド（`[command, ...args]`）と run コマンド（`(script: string) => [command, ...args]`）を導出する関数を同ファイルに置く。
3. `src/core/worktree/manager.ts` の `bun install --frozen-lockfile` を、検出された PM の install コマンドに置き換える。検出は worktree 作成先ではなく**元リポジトリの cwd**（lockfile がある場所）で行う。
4. `src/core/verification/runner.ts` の `spawn("bun", ["run", script], ...)` を、検出された PM の run コマンドに置き換える。検出は verification の cwd で行う。
5. `src/core/doctor/checks/runtime/bun.ts` を、検出された PM の存在チェックに置き換える。bun プロジェクトなら bun を、pnpm プロジェクトなら pnpm をチェックする。
6. `verification.commands` が config で明示されている場合は PM 検出の影響を受けない（commands は `sh -c` で実行されるため PM に依存しない）。

## スコープ外

- Yarn 2+（Berry）固有の対応。yarn.lock は検出するが、Yarn 2+ は `--frozen-lockfile` を認識せず hard error になる（`--immutable` が必要）。Yarn 2+ プロジェクトは `verification.commands` で workaround すること。
- `npm_config_user_agent` の解析（CLI が直接実行されるケースでは利用不可。補助シグナルとしても不要）。
- config での PM 明示指定（lockfile 検出で十分。config にオプションを足す必要性が確認できてから）。

## 受け入れ基準

- [ ] pnpm-lock.yaml が存在するプロジェクトで worktree 作成時に `pnpm install --frozen-lockfile` が実行される
- [ ] pnpm-lock.yaml が存在するプロジェクトで verification が `pnpm run <script>` で実行される
- [ ] bun.lockb または bun.lock が存在するプロジェクトで既存と同じ `bun install` / `bun run` が実行される（後方互換）
- [ ] lockfile が見つからない場合は npm にフォールバックする
- [ ] `specrunner doctor` が検出された PM の存在をチェックする
- [ ] `verification.commands` が設定されている場合は PM 検出に影響されない
- [ ] 外部依存が増えない（deps は 4 個のまま）
- [ ] `bun run typecheck && bun run test` が green
- [ ] `bun run lint` が green

## architect 評価済みの設計判断

- 検出関数は `src/util/detect-pm.ts` に置く（util 層 = 他のどの層からも参照可能、副作用なし）。
- lockfile を第一シグナルにする（業界標準。`packageManager` フィールドは Corepack が Node.js 25 から除外され普及率が下がっているため補助に留める）。
- 検出結果はプロジェクト cwd ごとにキャッシュしない（1 回の pipeline run で同じ cwd を複数回検出するが、fs.existsSync のコストは無視できる）。
- npm の install コマンドは `npm ci`（`npm install --frozen-lockfile` は存在しない。`npm ci` が lockfile 準拠の clean install）。
