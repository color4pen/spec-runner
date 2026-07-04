# workspace セットアップを config 化して言語非依存にする

## Meta

- **type**: new-feature
- **slug**: configurable-workspace-setup
- **base-branch**: main
- **adr**: true

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

## 背景

spec-runner をグローバル install し、JS/TS 以外の言語（Python / Go / Rust 等）や、lockfile を未コミットの JS プロジェクトで job を実行すると、worktree セットアップの依存 install 段階で必ず失敗し、パイプラインが 1 step も走らない。

原因は、worktree 作成後に走る依存 install が対象プロジェクトの言語を問わず package-manager install に固定されている点にある。lockfile が見つからない場合は npm へフォールバックし `npm ci` を実行するが、`npm ci` は lockfile 必須のため `EUSAGE` で失敗する。失敗すると worktree は自己清掃されて throw されるため、痕跡（orphan worktree・job state）は残らず、job ログも空のまま終わる。

verification ステップは config でコマンド列を指定でき言語非依存になっているのに対し、workspace セットアップだけがハードコードされているという非対称がある。この非対称により、spec-runner は「検証層では言語非依存」でありながら「セットアップ層では暗黙に JS 専用」になっており、多言語プロジェクトで実質的に使用不能になる。

## 現状コードの前提

- `src/core/worktree/manager.ts:125-135`: worktree 作成後、`detectPm(repoRoot)` で package manager を決定し `installCommand(pm)` を worktree 内で**無条件に**実行する。exit 非 0 なら worktree を `git worktree remove --force` + `rm -rf` して throw する。install をスキップ/差し替える分岐は存在しない。
- `src/util/detect-pm.ts:96`: lockfile も `package.json` の `packageManager` フィールドも見つからない場合、default として `{ pm: "npm" }` を返す。「package manager を使わない」という結果は返せない。
- `src/util/detect-pm.ts:103-108`: `installCommand("npm")` は `["npm", "ci"]` を返す。`npm ci` は `package-lock.json` / `npm-shrinkwrap.json` が必須。
- `src/config/schema.ts:401`: config は `verification`（実行コマンド列を config で指定）を持つが、workspace セットアップ / install を制御する top-level キー（install / setup / workspace）は存在しない。

## 要件

1. **workspace セットアップを config 駆動にする。** `verification.commands` と対称に、worktree 作成後に実行する setup コマンド列を config で指定できるようにする。config に指定があれば、それを既存の `detectPm` ベース install の代わりに実行する。（本 request の最重量部＝ハードコードされた install の一般化）
2. **非 JS / greenfield プロジェクトがデフォルトで通る。** 対象プロジェクトに JS 依存管理の痕跡（lockfile または `package.json`）が無く、かつ setup 未指定のとき、install を実行せず worktree セットアップを成功させる。
3. **既存の JS + lockfile プロジェクトを回帰させない。** lockfile を持つ既存プロジェクト（spec-runner 自身を含む）は、本変更後も worktree で依存 install が行われ、verification が `node_modules` 欠如で落ちない。
4. **失敗時の後片づけは現行を踏襲する。** setup コマンドが exit 非 0 で失敗したときの worktree remove + throw の挙動は現状パスを維持する。

## スコープ外

- verification / archive など worktree セットアップ以外のステップの挙動変更。
- lockfile 自動生成のヒューリスティック（greenfield-JS で lockfile を自動生成する等）。setup を config で明示することで対応可能とし、自動化は本 request では扱わない。
- `detect-pm` の package manager 検出ロジック自体の再設計（既存ロジックは流用する）。
- remote runtime のセットアップ経路（本 request は local runtime の worktree セットアップが対象）。

## 受け入れ基準

- [ ] config で workspace setup コマンドを指定でき、worktree 作成後にそのコマンドが実行されることをテストで固定する。
- [ ] setup 未指定かつ対象プロジェクトに JS 依存管理の痕跡（lockfile / `package.json`）が無いとき、install を実行せず worktree セットアップが成功することを、非 JS / greenfield を模したテストで固定する。
- [ ] 既存の JS + lockfile プロジェクトで従来通り依存 install が行われることを、既存テスト無変更 green または回帰テストで固定する。
- [ ] spec-runner 自身の自己ホスト（worktree での依存 install → verification）が本変更後も機能する（回帰しない）。
- [ ] `typecheck && test` が green。

## architect 評価済みの設計判断

以下は提案方針。config キー名・default 判定の厳密条件は design / architect で確定する。

**採用（提案）**

- workspace セットアップを config 化し、`verification.commands` と対称な setup コマンド列を追加する。config に指定があれば worktree 作成後にそれを実行し、既存の `detectPm` ベース install を置き換える。
- setup 未指定時の default は「JS 依存管理の痕跡（lockfile または `package.json`）を検出したときのみ従来の `detectPm` + install を実行し、痕跡が無ければ install をスキップ」とする。これにより (a) 既存 JS+lockfile プロジェクトは無設定で従来通り、(b) 非 JS / greenfield プロジェクトは無設定で通る、の両立を**移行なし**で満たす。
- 失敗時の後片づけ（worktree remove + throw）は現行パスを踏襲する。

**却下**

- 案B「`package.json` が無ければ install スキップのガードのみ」: `package.json` はあるが lockfile 未生成の JS を救えず、かつ非 JS プロジェクトで任意の setup コマンド（`uv sync` / `go mod download` 等）を明示する手段を与えない。
- 案C「npm フォールバックを `npm ci` → `npm install` に変更」: Go / Python 等でも npm を走らせ続けるため、多言語プロジェクトでの失敗を解決しない。
