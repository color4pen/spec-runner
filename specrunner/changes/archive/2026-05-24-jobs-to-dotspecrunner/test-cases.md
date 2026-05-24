# Test Cases: jobs-to-dotspecrunner

## TC-01: config schema — jobs.location 有効値の検証

- **Category**: Unit / Config Schema
- **Priority**: must
- **Source**: Task 1, 受け入れ基準 `config.jobs.location: "xdg"` を設定すると従来パスに書かれる

**GIVEN** `SpecRunnerConfig` に `jobs: { location: "project" }` を渡す  
**WHEN** `validateConfig()` を実行する  
**THEN** エラーなしで通過し、`config.jobs.location` が `"project"` であること

---

## TC-02: config schema — jobs.location "xdg" 有効値の検証

- **Category**: Unit / Config Schema
- **Priority**: must
- **Source**: Task 1, 受け入れ基準 `config.jobs.location: "xdg"` を設定すると従来パスに書かれる

**GIVEN** `SpecRunnerConfig` に `jobs: { location: "xdg" }` を渡す  
**WHEN** `validateConfig()` を実行する  
**THEN** エラーなしで通過し、`config.jobs.location` が `"xdg"` であること

---

## TC-03: config schema — jobs section 省略時は valid

- **Category**: Unit / Config Schema
- **Priority**: must
- **Source**: Task 1, Design D2 「`jobs` section 自体が optional」

**GIVEN** `SpecRunnerConfig` に `jobs` field を含めない  
**WHEN** `validateConfig()` を実行する  
**THEN** エラーなしで通過すること（後方互換）

---

## TC-04: config schema — jobs.location 無効値は CONFIG_INVALID

- **Category**: Unit / Config Schema
- **Priority**: must
- **Source**: Task 1, Design D2 「validation: `"project"` or `"xdg"` 以外は `CONFIG_INVALID`」

**GIVEN** `SpecRunnerConfig` に `jobs: { location: "local" }` を渡す  
**WHEN** `validateConfig()` を実行する  
**THEN** `CONFIG_INVALID` エラーが返ること

---

## TC-05: config schema — jobs.location に数値を渡すと CONFIG_INVALID

- **Category**: Unit / Config Schema
- **Priority**: must
- **Source**: Task 9 「無効値: `"local"`, `123`, `null` → `CONFIG_INVALID`」

**GIVEN** `SpecRunnerConfig` に `jobs: { location: 123 }` を渡す  
**WHEN** `validateConfig()` を実行する  
**THEN** `CONFIG_INVALID` エラーが返ること

---

## TC-06: config schema — jobs.location に null を渡すと CONFIG_INVALID

- **Category**: Unit / Config Schema
- **Priority**: must
- **Source**: Task 9 「無効値: `null` → `CONFIG_INVALID`」

**GIVEN** `SpecRunnerConfig` に `jobs: { location: null }` を渡す  
**WHEN** `validateConfig()` を実行する  
**THEN** `CONFIG_INVALID` エラーが返ること

---

## TC-07: xdg.ts — setJobsLocation("project") 後 getJobsDir() がプロジェクトパスを返す

- **Category**: Unit / xdg
- **Priority**: must
- **Source**: Task 2, 受け入れ基準 `.specrunner/jobs/<jobId>.json` がデフォルトで作成される

**GIVEN** `setJobsLocation("project", "/repo")` を呼んだ後  
**WHEN** `getJobsDir()` を呼ぶ  
**THEN** `/repo/.specrunner/jobs` を返すこと

---

## TC-08: xdg.ts — setJobsLocation("project") 後 getVerboseLogDir() がプロジェクトパスを返す

- **Category**: Unit / xdg
- **Priority**: must
- **Source**: Task 2, 受け入れ基準 `.specrunner/logs/<jobId>.log` に verbose log が書かれる

**GIVEN** `setJobsLocation("project", "/repo")` を呼んだ後  
**WHEN** `getVerboseLogDir()` を呼ぶ  
**THEN** `/repo/.specrunner/logs` を返すこと

---

## TC-09: xdg.ts — setJobsLocation("project") 後 getJobStatePath() が正しいパスを返す

- **Category**: Unit / xdg
- **Priority**: must
- **Source**: Task 9 「`getJobStatePath("abc")` === `/repo/.specrunner/jobs/abc.json`」

**GIVEN** `setJobsLocation("project", "/repo")` を呼んだ後  
**WHEN** `getJobStatePath("abc")` を呼ぶ  
**THEN** `/repo/.specrunner/jobs/abc.json` を返すこと

---

## TC-10: xdg.ts — setJobsLocation("xdg") 後は XDG パスに戻る

- **Category**: Unit / xdg
- **Priority**: must
- **Source**: Task 2, 受け入れ基準 `config.jobs.location: "xdg"` を設定すると従来パスに書かれる

**GIVEN** `setJobsLocation("project", "/repo")` を呼んだ後、さらに `setJobsLocation("xdg")` を呼ぶ  
**WHEN** `getJobsDir()` を呼ぶ  
**THEN** `~/.local/share/specrunner/jobs` (XDG パス) を返すこと

---

## TC-11: xdg.ts — resetJobsLocation() 後は XDG デフォルトに戻る

- **Category**: Unit / xdg
- **Priority**: must
- **Source**: Task 2 「テスト用に `resetJobsLocation()` を export（module state を初期値に戻す）」

**GIVEN** `setJobsLocation("project", "/repo")` を呼んだ後、`resetJobsLocation()` を呼ぶ  
**WHEN** `getJobsDir()` を呼ぶ  
**THEN** XDG デフォルトパスを返すこと（module state が初期値に戻っている）

---

## TC-12: xdg.ts — module デフォルト状態では XDG パスを返す（テスト安全性）

- **Category**: Unit / xdg
- **Priority**: must
- **Source**: Design D1 「default は `"xdg"` … テストも壊れない」

**GIVEN** `setJobsLocation()` を一度も呼んでいない初期状態  
**WHEN** `getJobsDir()` を呼ぶ  
**THEN** XDG パス (`~/.local/share/specrunner/jobs`) を返すこと

---

## TC-13: gitignore utility — .gitignore が存在しない場合に新規作成して追記する

- **Category**: Unit / gitignore
- **Priority**: must
- **Source**: Task 4, 受け入れ基準 `specrunner init` 後の `.gitignore` に `.specrunner/` が含まれる

**GIVEN** `repoRoot` 配下に `.gitignore` が存在しない  
**WHEN** `ensureDotSpecrunnerGitignore(repoRoot)` を呼ぶ  
**THEN** `.gitignore` が作成され、`.specrunner/` 行が含まれること

---

## TC-14: gitignore utility — .gitignore が空ファイルの場合に追記する

- **Category**: Unit / gitignore
- **Priority**: must
- **Source**: Task 4 「空ファイル … の各ケース」

**GIVEN** `repoRoot/.gitignore` が空ファイルとして存在する  
**WHEN** `ensureDotSpecrunnerGitignore(repoRoot)` を呼ぶ  
**THEN** `.gitignore` に `.specrunner/` 行が追記されること

---

## TC-15: gitignore utility — .gitignore にすでに .specrunner/ が含まれる場合は no-op

- **Category**: Unit / gitignore
- **Priority**: must
- **Source**: Task 4 「冪等（既に存在すれば no-op）」

**GIVEN** `repoRoot/.gitignore` に `.specrunner/` 行が既に存在する  
**WHEN** `ensureDotSpecrunnerGitignore(repoRoot)` を 2 回呼ぶ  
**THEN** `.specrunner/` 行が重複して追加されないこと（冪等）

---

## TC-16: gitignore utility — 既存の .gitignore に他エントリがある場合に追記する

- **Category**: Unit / gitignore
- **Priority**: must
- **Source**: Task 4 「追記」ケース

**GIVEN** `repoRoot/.gitignore` に `node_modules/` と `dist/` のエントリが存在する  
**WHEN** `ensureDotSpecrunnerGitignore(repoRoot)` を呼ぶ  
**THEN** 既存エントリが保持され、末尾に `.specrunner/` 行が追加されること

---

## TC-17: gitignore utility — 最終行に改行がない場合も正しく追記する

- **Category**: Unit / gitignore
- **Priority**: should
- **Source**: Task 4 「最終行が改行で終わっていなければ改行を補完してから追記」

**GIVEN** `repoRoot/.gitignore` の末尾が改行なしで終わっている  
**WHEN** `ensureDotSpecrunnerGitignore(repoRoot)` を呼ぶ  
**THEN** 改行が補完された上で `.specrunner/` 行が追記されること

---

## TC-18: specrunner init — git repo 内で実行すると .gitignore に .specrunner/ が追記される

- **Category**: Integration / init
- **Priority**: must
- **Source**: Task 5, 受け入れ基準 `specrunner init` 後の `.gitignore` に `.specrunner/` が含まれる

**GIVEN** git repo の CWD で `specrunner init` を実行する  
**WHEN** init コマンドが完了する  
**THEN** `<repoRoot>/.gitignore` に `.specrunner/` 行が含まれること

---

## TC-19: specrunner init — git repo でない場所では .gitignore 操作をスキップ

- **Category**: Integration / init
- **Priority**: should
- **Source**: Task 5 「git repo でない場合はスキップ（warning 不要）」

**GIVEN** git repo 外のディレクトリで `specrunner init` を実行する  
**WHEN** init コマンドが完了する  
**THEN** エラー・警告なしで完了し、`.gitignore` 操作が行われないこと

---

## TC-20: specrunner run — デフォルト設定で job state が .specrunner/jobs/ に書かれる

- **Category**: Integration / run
- **Priority**: must
- **Source**: 受け入れ基準 `.specrunner/jobs/<jobId>.json` がデフォルトで作成される（`config.jobs.location` 未設定時）

**GIVEN** `config.jobs.location` を設定していないプロジェクトで `specrunner run` を実行する  
**WHEN** pipeline が起動する  
**THEN** `<repoRoot>/.specrunner/jobs/<jobId>.json` が作成されること

---

## TC-21: specrunner run — デフォルト設定で verbose log が .specrunner/logs/ に書かれる

- **Category**: Integration / run
- **Priority**: must
- **Source**: 受け入れ基準 `.specrunner/logs/<jobId>.log` に verbose log が書かれる

**GIVEN** `config.jobs.location` を設定していないプロジェクトで `specrunner run` を実行する  
**WHEN** pipeline が起動する  
**THEN** `<repoRoot>/.specrunner/logs/<jobId>.log` が作成されること

---

## TC-22: specrunner run — config.jobs.location: "xdg" で XDG パスに書かれる

- **Category**: Integration / run
- **Priority**: must
- **Source**: 受け入れ基準 `config.jobs.location: "xdg"` を設定すると従来パスに書かれる

**GIVEN** `specrunner.yaml` に `jobs: { location: "xdg" }` を設定して `specrunner run` を実行する  
**WHEN** pipeline が起動する  
**THEN** `~/.local/share/specrunner/jobs/<jobId>.json` が作成されること（XDG パス）

---

## TC-23: specrunner run — location: "project" 時に .gitignore が確保される

- **Category**: Integration / run
- **Priority**: must
- **Source**: Task 6 「location が `"project"` の場合のみ `ensureDotSpecrunnerGitignore(cwd)` を呼ぶ」

**GIVEN** `config.jobs.location: "project"` で `.gitignore` に `.specrunner/` が存在しない状態で `specrunner run` を実行する  
**WHEN** preflight が完了する  
**THEN** `<repoRoot>/.gitignore` に `.specrunner/` 行が追記されること

---

## TC-24: specrunner run — location: "xdg" 時は .gitignore を操作しない

- **Category**: Integration / run
- **Priority**: should
- **Source**: Task 6 「location が `"project"` の場合のみ」

**GIVEN** `config.jobs.location: "xdg"` で `specrunner run` を実行する  
**WHEN** preflight が完了する  
**THEN** `.gitignore` が変更されないこと

---

## TC-25: specrunner ps — config load 成功時はプロジェクトパスの job state を参照する

- **Category**: Integration / ps
- **Priority**: must
- **Source**: Task 3 「`ps.ts`: 冒頭で config load + repo root 解決 + `setJobsLocation()` を呼ぶ」

**GIVEN** `config.jobs.location: "project"` で `.specrunner/jobs/` に job state が存在する  
**WHEN** `specrunner ps` を実行する  
**THEN** プロジェクトパスの job state が読み込まれてリストに表示されること

---

## TC-26: specrunner ps — config load 失敗時は XDG fallback で動作する

- **Category**: Integration / ps
- **Priority**: must
- **Source**: Task 3 「config load / repo root 解決が失敗した場合は `setJobsLocation("xdg")` で fallback」

**GIVEN** git repo 外 または config file が壊れた状態で `specrunner ps` を実行する  
**WHEN** config load / repo root 解決が失敗する  
**THEN** XDG パスに fallback してエラー終了しないこと

---

## TC-27: specrunner cancel — config load 成功時はプロジェクトパスの job を対象にする

- **Category**: Integration / cancel
- **Priority**: must
- **Source**: Task 3 「`cancel.ts`: 関数冒頭で config load + repo root 解決 + `setJobsLocation()` を呼ぶ」

**GIVEN** `config.jobs.location: "project"` で `.specrunner/jobs/` に running job state が存在する  
**WHEN** `specrunner cancel <jobId>` を実行する  
**THEN** プロジェクトパスの job state が更新されること

---

## TC-28: specrunner cancel --all-terminated — プロジェクトパスを参照する

- **Category**: Integration / cancel
- **Priority**: should
- **Source**: Task 3 「`--all-terminated` パスも含めて、関数冒頭で `setJobsLocation` を呼ぶこと」

**GIVEN** `config.jobs.location: "project"` で `.specrunner/jobs/` に terminated job state が存在する  
**WHEN** `specrunner cancel --all-terminated` を実行する  
**THEN** プロジェクトパスの terminated job が対象になること

---

## TC-29: specrunner finish — プロジェクトパスの job state を読み込める

- **Category**: Integration / finish
- **Priority**: must
- **Source**: Task 3 「`finish.ts`: 既存の config / repo root 解決の後に `setJobsLocation()` を追加」

**GIVEN** `config.jobs.location: "project"` で `.specrunner/jobs/<jobId>.json` が存在する  
**WHEN** `specrunner finish <jobId>` を実行する  
**THEN** プロジェクトパスの job state が正常に読み込まれること

---

## TC-30: specrunner job-show — プロジェクトパスの job state を表示できる

- **Category**: Integration / job-show
- **Priority**: must
- **Source**: Task 3 「`job-show.ts`: config load + repo root 解決 + `setJobsLocation()` を追加」

**GIVEN** `config.jobs.location: "project"` で `.specrunner/jobs/<jobId>.json` が存在する  
**WHEN** `specrunner job-show <jobId>` を実行する  
**THEN** プロジェクトパスの job state の内容が表示されること

---

## TC-31: job-show — config load 失敗時は XDG fallback で動作する

- **Category**: Integration / job-show
- **Priority**: should
- **Source**: Task 3 Design D3 「config load 失敗時は XDG fallback」

**GIVEN** git repo 外または config が壊れた状態で `specrunner job-show <jobId>` を実行する  
**WHEN** config load / repo root 解決が失敗する  
**THEN** XDG パスに fallback してクラッシュしないこと

---

## TC-32: specrunner resume — プロジェクトパスの job state を参照する

- **Category**: Integration / resume
- **Priority**: must
- **Source**: Task 3 「`resume.ts`: bootstrap 後に `setJobsLocation()` を呼ぶ」

**GIVEN** `config.jobs.location: "project"` で `.specrunner/jobs/<jobId>.json` が存在する  
**WHEN** `specrunner resume <jobId>` を実行する  
**THEN** プロジェクトパスの job state が読み込まれること

---

## TC-33: .gitignore — repo root の .gitignore に .specrunner/ が含まれる

- **Category**: Integration / repo
- **Priority**: must
- **Source**: Task 8, 受け入れ基準 `specrunner init` / `bootstrap` 後の `.gitignore` に `.specrunner/` が含まれる

**GIVEN** このリポジトリの `.gitignore`  
**WHEN** ファイルを参照する  
**THEN** `.specrunner/` エントリが存在すること

---

## TC-34: ドキュメント — rules.ts の path 表記が新パスに更新されている

- **Category**: Static / Documentation
- **Priority**: must
- **Source**: Task 7, 受け入れ基準 「rules.md / project.md / README の path 表記が新パスに更新されている」

**GIVEN** `src/prompts/rules.ts` の L80-81 付近  
**WHEN** ファイルを参照する  
**THEN** job state path が `.specrunner/jobs/<jobId>.json`、verbose log path が `.specrunner/logs/<jobId>.log` と記述されていること

---

## TC-35: ドキュメント — project.md の状態管理セクションが新パスに更新されている

- **Category**: Static / Documentation
- **Priority**: must
- **Source**: Task 7, 受け入れ基準 「rules.md / project.md / README の path 表記が新パスに更新されている」

**GIVEN** `specrunner/project.md` の「状態管理」セクション  
**WHEN** ファイルを参照する  
**THEN** job state path が `.specrunner/jobs/` として記述されていること

---

## TC-36: typecheck — bun run typecheck が green

- **Category**: Build
- **Priority**: must
- **Source**: 受け入れ基準 「`bun run typecheck && bun run test` が green」

**GIVEN** 本変更を実装した状態  
**WHEN** `bun run typecheck` を実行する  
**THEN** 型エラーなしで完了すること

---

## TC-37: test — bun run test が green

- **Category**: Build
- **Priority**: must
- **Source**: 受け入れ基準 「`bun run typecheck && bun run test` が green」

**GIVEN** 本変更を実装した状態  
**WHEN** `bun run test` を実行する  
**THEN** 全テストが pass すること

---

## TC-38: 後方互換 — 既存の config (jobs section なし) で run が動作する

- **Category**: Integration / backward-compat
- **Priority**: must
- **Source**: Design D2 「`jobs` section 自体が optional（既存 config との後方互換）」

**GIVEN** `specrunner.yaml` に `jobs` section が存在しない既存プロジェクト  
**WHEN** `specrunner run` を実行する  
**THEN** エラーなく `"project"` デフォルト動作で job state が `.specrunner/jobs/` に書かれること

---

## TC-39: credentials / config のパスは XDG のまま変更なし

- **Category**: Unit / xdg
- **Priority**: must
- **Source**: Design D6 「credentials / config は XDG のまま維持（`getConfigPath()` / `getCredentialsPath()` は変更なし）」

**GIVEN** `setJobsLocation("project", "/repo")` を呼んだ後  
**WHEN** `getConfigPath()` / `getCredentialsPath()` を呼ぶ  
**THEN** XDG_CONFIG_HOME 配下のパスが返り、プロジェクトパスに変わらないこと

---

## TC-40: JobState schema — 構造が変更されていない

- **Category**: Unit / job-state
- **Priority**: must
- **Source**: スコープ外 「`JobState` の schema / format 変更（構造は現状維持、`modelUsage` も含めて既存どおり）」

**GIVEN** `config.jobs.location: "project"` で job state が `.specrunner/jobs/<jobId>.json` に書かれる  
**WHEN** ファイルの内容を参照する  
**THEN** `JobState` の JSON 構造（`modelUsage` を含む）が変更前と同一であること
