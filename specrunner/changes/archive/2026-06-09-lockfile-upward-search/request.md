# detectPackageManager の lockfile 探索を上位ディレクトリに拡張する

## Meta

- **type**: spec-change
- **slug**: lockfile-upward-search
- **base-branch**: main
- **adr**: false

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

## 背景

`src/util/detect-pm.ts` の `detectPackageManager()` は cwd 1 ディレクトリだけで lockfile を探す。pnpm workspace（monorepo）では lockfile（`pnpm-lock.yaml`）が workspace root にあり、worktree checkout のルートにはない。結果として npm にフォールバックし、`npm ci` が走って壊れる。

また `src/core/verification/commands.ts` の `spawnCommand()` は `cwd/node_modules/.bin` だけを PATH に追加する。pnpm workspace では binaries が workspace root の `node_modules/.bin` に hoisted されるため、worktree cwd からは見つからない。

## 要件

1. `detectPackageManager()` が cwd から git root まで親ディレクトリを順に探索し、最初に見つかった lockfile の PM を返す。git root の判定は `.git` ディレクトリ（またはファイル）の存在で行う。filesystem root に達しても見つからなければ `packageManager` フィールド → npm fallback（既存と同じ）。
2. `detectPackageManager()` が lockfile を見つけたディレクトリのパスも返す（PM 名だけでなく `{ pm, root }` を返す）。呼び出し元が lockfile root の `node_modules/.bin` を PATH に加えるために使う。
3. `spawnCommand()` が PM 検出の root ディレクトリの `node_modules/.bin` も PATH に追加する（cwd のものに加えて）。
4. 既存の単一パッケージプロジェクト（cwd に lockfile がある）では挙動が変わらない（後方互換）。

## スコープ外

- pnpm workspace の `--filter` 対応（install 時の workspace 個別 install）。
- lockfile root と cwd が異なる場合の install コマンドの挙動変更（install は引き続き cwd で実行。workspace root で install する方が正しいが、worktree の中から workspace root を install するのは副作用が大きく別件）。
- verification.commands path への影響（commands は `sh -c` で実行されるため PATH は呼び出し側に依存しない）。

## 受け入れ基準

- [ ] cwd に lockfile がなく親ディレクトリにある場合、親の lockfile から PM を検出する
- [ ] cwd に lockfile がある場合は従来どおりそのまま検出する（後方互換）
- [ ] `.git` を超えて探索しない
- [ ] `spawnCommand()` が lockfile root の `node_modules/.bin` を PATH に含める
- [ ] テストケースが追加されている
- [ ] `typecheck && test` が green
- [ ] `lint` が green

## architect 評価済みの設計判断

- 戻り値を `PackageManager` から `{ pm: PackageManager; root: string }` に変更する。呼び出し元（worktree manager / verification runner / doctor）は `result.pm` で PM を取り、`result.root` で PATH 用の root を取る。
- 探索停止条件は `.git` の存在。worktree の `.git` はファイル（gitdir pointer）なので `existsSync` で両方拾える。filesystem root 到達でも停止する（無限ループ防止）。
- lockfile が見つからなかった場合（packageManager fallback / npm default）は `root = cwd` を返す（後方互換）。
- `spawnCommand()` の PATH は `cwd/node_modules/.bin:root/node_modules/.bin:original_PATH` の順。cwd のものが優先される（workspace package のローカル dep が workspace root の hoisted dep に勝つ）。
