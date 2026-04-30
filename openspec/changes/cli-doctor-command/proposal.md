## Why

dogfooding 001〜005 で SpecRunner が動作する前提条件（外部 CLI / 認証 / 設定 / リポジトリ状態 / Anthropic agent 登録状況）が揃っていないとき、`specrunner run` を叩いて初めて runtime error で気付く。後続予定の `specrunner finish` も外部依存（git / openspec）を更に活用するため、起動前に診断する手段がなければ failure mode 解析が困難になる。`brew doctor` / `flutter doctor` 系の診断コマンドを追加して、proactive に環境問題を検出可能にする。

## What Changes

- **新規 CLI subcommand `specrunner doctor`** を `bin/specrunner.ts` に追加。runtime / config / env / auth / repo / agents / storage の 7 カテゴリを機械的に検証する。
- **`--json` フラグ** で機械可読 JSON 出力を提供（CI 利用想定）。
- **exit code 仕様**: 0 = pass / warn のみ、1 = fail あり、2 = doctor 自身の crash。
- **`DoctorCheck` interface と `DoctorContext` injection** を導入。各 check は単独 unit test 可能、port パターン（fetch / fs / child_process / config / github）と整合。
- **18 種類の個別 check**: node / bun / git / openspec / config 存在 + perm / anthropic.apiKey / github.accessToken / `SPECRUNNER_GITHUB_CLIENT_ID` / Anthropic API key 有効性 / GitHub token 有効性 + scope / cwd git repo / origin が GitHub / `openspec/project.md` 存在 / `openspec-workflow/requests/{active,awaiting-merge,merged,canceled}/` 構造 / 7 agents 登録 / environment ID / agent definition drift / jobs storage 書き込み可。
- **`--help` 表示更新**: doctor コマンドが usage に追加される。

破壊的変更なし。既存サブコマンド（init / login / run / ps）の挙動は変更しない。

## Capabilities

### New Capabilities
- なし（doctor は cli-commands 配下のサブコマンド追加であり、既存 capability の delta として表現する）

### Modified Capabilities
- `cli-commands`: `specrunner doctor` サブコマンドの追加。`specrunner` バイナリが提供するサブコマンドが 4 個（init / login / run / ps）から 5 個（+ doctor）に拡張される。doctor の引数・終了コード・stdout/stderr 出力・JSON 出力契約を spec に追加する。

## Impact

- **コード**:
  - `bin/specrunner.ts`: doctor case dispatch + USAGE 更新（~20 行）
  - `src/cli/doctor.ts`: 新規。CLI entry（~80 行）
  - `src/core/doctor/types.ts`: 新規。`DoctorCheck` / `DoctorContext` / `DoctorResult` 型定義（~30 行）
  - `src/core/doctor/checks/*.ts`: 新規。18 個の個別 check（~500 行合計）
  - `src/core/doctor/runner.ts`: 新規。check 実行と集約（~50 行）
  - `src/core/doctor/formatter.ts`: 新規。human / JSON 出力フォーマッタ（~80 行）
- **依存**:
  - 新規 npm 依存なし（標準 fs / child_process / fetch のみ使用）
  - openspec を `npx` 経由で実行（global install 不要）
- **API**:
  - Anthropic API: 軽量 GET 1 回（key 有効性確認、レート消費最小）
  - GitHub API: `GET /user` 1 回（token 有効性 + scope 確認）
- **仕様 / ドキュメント**:
  - `openspec/changes/cli-doctor-command/specs/cli-commands/spec.md` に delta spec 追加
  - `openspec-workflow/adr/ADR-20260430-external-dependency-policy.md` を生成（外部依存方針: openspec / git 必須、gh CLI 不要、LLM 介在不要）
- **テスト**:
  - 各 check の unit test（DoctorContext mock 使用）
  - runner / formatter の unit test
  - `bin/specrunner.ts` doctor dispatch の test
  - 既存 533 tests は regression 0 を維持
