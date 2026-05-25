# `config.jobs.location` の `"xdg"` opt-out を廃止し、jobs/logs を常に project 内に置く

## Meta

- **type**: spec-change
- **slug**: remove-xdg-mode
- **base-branch**: main
- **adr**: true

## 背景

直近 PR #387 で `config.jobs.location` を導入し、`"project"` (default) / `"xdg"` の二択で jobs/logs の格納先を切り替えられるようにした。しかし以下の理由で **xdg mode を残す意義が薄い**ことが判明した:

1. **後方互換性のため**: PR #387 のスコープ外で「旧 XDG path に残った state file の移行は扱わない」と明記済。残しても自動で連携しない
2. **複数 repo 集約管理**: specrunner は repo-bound tool であり、別 repo の job 履歴を 1 か所に集めたい需要が本質的に薄い
3. **構造的脆弱性**: `xdg.ts` の module-level state (`jobsLocation`, `projectRoot`) はデフォルトが `"xdg"`。CLI entry で `setJobsLocation()` を呼び忘れると **silent に XDG モードにフォールバック** する。新 CLI entry 追加時に呼び忘れリスクが累積する
4. **コード単純化**: module-state を消すと CLI entry の早期 config-load + `setJobsLocation()` 呼び出し boilerplate (6 箇所) が削減できる

memory `feedback_llm_uncertainty_principle` (= 判断する場面を消す) の方向に合致。

## 要件

1. **`config.jobs.location` 設定キーを廃止する**
   - 型定義の削除: `JobsConfig` interface 削除 + `SpecRunnerConfig.jobs` field 削除
   - 検査ロジックの削除: `validateConfig()` 内の `jobs.location` validation block 削除
   - 旧 config に `jobs: { location: "xdg" }` が残っていても error にならず、未知 field として無視される（`loadConfig` の現状挙動と整合）

2. **`xdg.ts` の module-level state を削除する**
   - module-level 変数 `jobsLocation` / `projectRoot` を削除
   - `setJobsLocation()` / `resetJobsLocation()` export を削除
   - `getJobsDir()` / `getVerboseLogDir()` は常に `<repo-root>/.specrunner/jobs/` / `<repo-root>/.specrunner/logs/` を返すように単純化

3. **`getJobsDir()` / `getVerboseLogDir()` は repo root を引数で受け取るか、別経路で取得する**
   - 現状 module-state に依存して projectRoot を解決していたが、xdg mode が消えれば呼び出し側が repo root を渡せばよい
   - 代替案: 各 helper が `git rev-parse --show-toplevel` を内部で実行する (副作用が見えにくいので非推奨)
   - 設計選択は実装時に design step で決定する

4. **全 CLI entry から `setJobsLocation()` 呼び出しを削除する**
   - `src/cli/run.ts`, `src/cli/resume.ts`, `src/cli/cancel.ts`, `src/cli/finish.ts`, `src/cli/ps.ts`, `src/cli/job-show.ts`
   - 各 entry の早期 config-load (jobs.location 解決目的) も jobs に関する部分は削減

5. **doc 更新**
   - `src/prompts/rules.ts` の path 表記から `"xdg"` 言及を削除
   - `specrunner/project.md` の状態管理セクション更新

6. **test 群の更新**
   - `tests/unit/util/xdg.test.ts` の `setJobsLocation`/`resetJobsLocation` 関連テストを削除 or 書き換え
   - `tests/unit/config/schema.test.ts` の `jobs.location` validation テストを削除
   - 他、`jobs.location` を mock / setup していた test を整理

## スコープ外

- `~/.local/share/specrunner/jobs/` に残った旧 state file の取り扱い（移行・検出・警告など一切含めない、PR #387 と同方針）
- `~/.config/specrunner/` (config / credentials) の格納先変更（per-user / secret なので XDG_CONFIG_HOME のまま維持）
- `.specrunner/` ディレクトリ構造の変更（jobs/, logs/ サブディレクトリ構成は維持）
- worktree 内から parent repo の `.specrunner/` への書き込み戦略の見直し
- repo root 検出ロジックの全体見直し（必要なら別 request）

## 受け入れ基準

- [ ] `config.jobs` section を未指定で `specrunner job start` が動く（= デフォルトで `.specrunner/jobs/` に書く）
- [ ] 旧 config に `jobs: { location: "xdg" }` が残っていても error にならず（未知 field として無視）、`.specrunner/jobs/` に書かれる
- [ ] `xdg.ts` から `setJobsLocation`, `resetJobsLocation`, `jobsLocation`, `projectRoot` のシンボルが export されていない
- [ ] 全 CLI entry から `setJobsLocation()` の呼び出し箇所が消えている
- [ ] `rules.ts` / `project.md` の path 表記に `"xdg"` の言及が無い
- [ ] `bun run typecheck && bun run test` が green
- [ ] 既存 archived state file（XDG path に残っているもの）は **resume 不可** で OK（自動移行しない方針）

## Workflow Options

- enabled: []

## architect 評価済みの設計判断

- **xdg mode を完全削除**: 残しておく対象ユーザーが少なく、構造的脆弱性のほうがコストが大きい
- **repo root の受け渡し方法は実装時に決定**: 引数経由 / 別 helper / git invoke 内蔵の 3 案あり、design step で評価する
- **migration なし**: PR #387 と同じく旧 file は放置、必要な user は手動で移行
- **spec 変更を伴う**: `cli-config-store/spec.md` の `jobs` section、`job-state-store/spec.md` の XDG scenarios、`verbose-execution-log/spec.md` の XDG scenarios を delta spec で削除する
