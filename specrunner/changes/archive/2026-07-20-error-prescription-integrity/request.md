# エラー処方の整合 — 誤診 hint の修正・廃止コマンド処方の除去・状態駆動 next steps・doctor の XDG 認識

## Meta

- **type**: spec-change
- **slug**: error-prescription-integrity
- **base-branch**: main
- **adr**: false

<!-- 新しい port/adapter や構造変更は無い。エラー処方（hint）の出力契約と doctor の config 解決規則の修正のため spec-change -->

## 背景

同じ状態に対する処方（Hint）がコマンド間で矛盾する、製品自身のコマンドを迂回して手作業や廃止コマンドを案内する、実際の読み込み規則と異なるパスを検査する、という処方の不整合が複数ある。いずれも実測で確認済み（npm 公開物 v0.4.1 および現行 main）。

- origin 未設定で `run` が停止した際の表示が「git repository に cd しろ」— ユーザーは既に git repo の中に居る。失敗した述語（origin 不在）と処方が一致していない。doctor の同条件 hint（`git remote add origin ...`）は正しく、同一状態への処方がコマンド間で矛盾
- doctor の `local-state-writable` hint が「Run 'specrunner ps' once」— **`ps` は廃止済みコマンド**で、実行すると `Unknown command: ps`。処方が実行不能
- doctor の `workflow-structure` hint が「Create the missing directories manually.」— scaffold 作成は `init` の仕事（現行 init は作成物を報告する）
- GitHub token の hint が「Set GH_TOKEN env var, run 'gh auth login', or run 'specrunner login'」の三択 — README の正道は `specrunner login` 一本で、`gh` は製品の必須依存ではない
- 初回セットアップの doctor は複数 fail + warn が並ぶが、必要な実手順（新規作成者: `git init` → `git remote add` → `specrunner login` / 既存プロジェクト参加者: `specrunner init` → `specrunner login`）の順序をどの出力も示さない
- `XDG_CONFIG_HOME` 指定下で `init` は正しい場所へ config を作るのに、直後の `doctor` は `~/.config/specrunner/config.json` 固定で fail する — 検査が実際の読み込み規則を使っていない
- token 不良時に git の生エラー（`fatal: could not read Username for 'https://github.com': No such device or address`）がそのまま表面化する — 認証不良を「device が無い」と報告しており原因追跡を誤らせる

## 現状コードの前提

- `src/git/remote.ts:36-37` / `:51-52` — origin 不在エラーの hint が「cd into a git repository before running specrunner.」（`src/errors.ts:148` にも同文言のエラー定義がある）
- `src/core/doctor/checks/storage/local-state-writable.ts:42` — hint「Run 'specrunner ps' once to initialize storage.」。`ps` コマンドは廃止済み（`bin/specrunner.ts` のコマンド表に無く、実行すると Unknown command）
- `src/core/doctor/checks/repo/workflow-structure.ts:59` — 「Create the missing directories manually.」
- `src/core/doctor/checks/config/github-token-present.ts:35` / `src/core/doctor/checks/auth/github-token-valid.ts:19` — 三択 hint
- `src/core/doctor/checks/config/file-exists.ts:15` — `path.join(ctx.homeDir, ".config", "specrunner", "config.json")` とパスを固定。実際の解決規則 `src/util/xdg.ts:18`（`getConfigPath`、`XDG_CONFIG_HOME` を尊重: `xdg.ts:8`）を使っていない
- `src/core/doctor/formatter.ts` — `formatHuman` は check 結果と Summary を出すのみで、next steps 相当の出力は無い
- `src/cli/command-registry.ts:817` — `doctor` エントリに `usage` フィールドが無く、`doctor --help` は「No detailed help available.」になる。`--json` は実装済み
- `src/core/runtime/local.ts:464` — `git fetch origin failed (exit N): <git stderr 生文字列>` を throw し、`src/core/command/runner.ts:139` がそのまま表示する
- `README.md` の Quick Start は新規作成者向け手順のみ（`mkdir` → `git init` → install → init → login）。既存プロジェクト参加者（clone → install → init → login、scaffold と project config は commit 済み）の手順が無い
- doctor の check は `DoctorContext`（`repoRoot` / `cwd` / `homeDir` / `env` を保持）を受け取る

## 要件

1. **失敗した述語と処方を一致させる**: origin 不在の停止（`src/git/remote.ts`）の hint を `git remote add origin <url>` 系の処方に修正する。doctor の `github-origin` check の hint と同趣旨に揃える。
2. **廃止コマンドの処方を除去する**: `local-state-writable` の hint から `specrunner ps` を排し、現行の実在コマンド（または「初回 run 時に自動作成される」旨の説明）に置換する。CLI が処方する全 hint を対象に、実在しないコマンドを案内していないかを機械検査するテストを置く（hint 文字列中の `specrunner <sub>` をコマンド表と突き合わせる）。
3. **手作業処方を製品コマンドに置換する**: `workflow-structure` の hint は `specrunner init` の実行を第一処方にする。
4. **token 処方の一本化**: token 系 hint は `specrunner login` を第一処方にし、`GH_TOKEN` / `gh` は従属的な代替として表記する。
5. **状態駆動の next steps**: doctor の human 出力末尾に、fail した check から導出した順序付きの「次にやること」を出す。固定の手順表ではなく、check の fail 集合から導出する（git repo 不在 → `git init` / origin 不在 → `git remote add` / config 不在 → `specrunner init` / token 不在 → `specrunner login` の依存順）。fail が無ければ出力しない。`--json` の構造は変えない（既存の機械消費者を壊さない）。
6. **doctor の XDG 認識**: `config-file-exists` check は `getConfigPath()`（`src/util/xdg.ts`）と同一の解決規則で config パスを求める。`XDG_CONFIG_HOME` 指定下で `init` → `doctor` が pass する。
7. **doctor --help**: `doctor` の usage（`--json` 含む）を registry に追加する。
8. **README に参加者手順**: 既存プロジェクト（spec-runner 導入済み repo）を clone した人向けの手順（install → `specrunner init` → `specrunner login`）を Quick Start 近傍に追記する。
9. **git 生エラーの wrap**: workspace 準備の `git fetch` 失敗時、stderr が認証系パターン（`could not read Username` / `Authentication failed` 等）に合致する場合は「GitHub 認証に失敗した。`specrunner login` で再認証」を第一文とするエラーに変換する。git の元 stderr は詳細として保持し、破棄しない。

## スコープ外

- verdict / blocking rules・pipeline routing の変更
- doctor の check 追加・削除（既存 check の hint / パス解決の修正のみ）
- provider readiness の検査（別 request）
- `--json` 出力スキーマの変更

## 受け入れ基準

- [ ] **T1（origin 処方）**: origin 不在で `run` が停止した際の hint が `git remote add` を含み、「cd into a git repository」を含まないことを固定する。**破壊確認**: 修正を戻すと落ちること。
- [ ] **T2（廃止コマンド検査）**: CLI が出力し得る全 hint 文字列中の `specrunner <subcommand>` 参照が実在コマンドであることを機械検査するテスト。**破壊確認**: hint に架空コマンドを足すと落ちること。
- [ ] **T3（next steps・作成者）**: git repo 外相当の fail 集合に対し、next steps が `git init` → `git remote add` → `specrunner login` の順で出力されることを固定する。
- [ ] **T4（next steps・参加者）**: repo 系 check が全 pass で config / token のみ fail の集合に対し、next steps が `specrunner init` → `specrunner login` の順で出力されることを固定する。
- [ ] **T5（next steps 抑制と JSON 不変）**: fail ゼロのとき next steps が出ないこと、`--json` の出力構造が従来と同一であることを固定する。
- [ ] **T6（XDG）**: `XDG_CONFIG_HOME` を隔離した環境で config を作成した後、`config-file-exists` check が pass することを固定する。**破壊確認**: パス固定に戻すと落ちること。
- [ ] **T7（--help）**: `doctor --help` が usage（`--json` 記載あり）を表示することを固定する。
- [ ] **T8（auth エラー wrap）**: `git fetch` の stderr が認証系パターンのとき、表示の第一文が `specrunner login` を処方し、git の元メッセージが詳細に保持されることを固定する。非認証系の fetch 失敗は従来表示のまま（回帰防止）。
- [ ] **T9**: README に参加者手順が追記されている。`typecheck && test` が green（hint 文言変更に伴う既存テストの期待更新を除く）。

## architect 評価済みの設計判断

- **next steps は fail 集合からの導出**。→ 却下: ペルソナ別の固定手順表（実状態と食い違う手順を出す。参加者/作成者の判別を機械がする必要も無く、fail からの導出で両者に自然に一致する）。
- **hint の実在コマンド検査を歯として置く**。→ 却下: 文言レビューのみ（`ps` の件は文言変更時に検査が無かったから起きた。コマンド廃止と hint の同期は規模で必ず漏れる）。
- **XDG は check 側を `getConfigPath()` に揃える**。→ 却下: check 独自のパス探索を拡張（読み込み規則の正は `store.ts` / `xdg.ts` にあり、検査が独自実装を持つと再び乖離する）。
- **auth エラーは wrap して元 stderr を保持**。→ 却下: 生エラーのまま（誤診を誘う）/ 完全置換（git 側の情報を失い、非典型ケースのデバッグが不能になる）。
