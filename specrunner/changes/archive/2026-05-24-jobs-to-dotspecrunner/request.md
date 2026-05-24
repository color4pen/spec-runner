# job state / verbose log を project 内 `.specrunner/` 配下に移管する

## Meta

- **type**: spec-change
- **slug**: jobs-to-dotspecrunner
- **base-branch**: main
- **adr**: true

## 背景

現状 specrunner は machine-generated な state / log を XDG 配下に書いている：

- `~/.local/share/specrunner/jobs/<jobId>.json` (job state)
- `~/.local/state/specrunner/logs/<jobId>.log` (verbose log)

specrunner は **repo-bound なツール** であり、これらは「該当 repo に対する pipeline 実行履歴」という性格が強い。XDG 配下に置くと複数 repo を跨いだとき「どの repo の活動か」が file system 上で区別できず混在する。新規ユーザーが `ls` で発見できない、という発見性の問題もある。

設計感覚として、

- `specrunner/` (no dot) は **human-editable** な領域（spec / change / draft / adr）として既に運用されている
- 一方 jobs / logs は **machine-generated** で人間が直接編集しない

ため、`.git/` `.next/` `.cache/` 等の慣習に倣い `.specrunner/` (dot prefix) を新設して machine 領域を分離するのが筋。

## 要件

1. **`.specrunner/` 配下に machine state を集約する**
   - `.specrunner/jobs/<jobId>.json` — job state
   - `.specrunner/logs/<jobId>.log` — verbose log
   - `.specrunner/` はデフォルト `.gitignore` 対象（init / bootstrap で `.gitignore` に追記する）

2. **`config.jobs.location` で格納先を切り替え可能にする**
   - `"project"` (default): `<repo-root>/.specrunner/jobs/`, `<repo-root>/.specrunner/logs/`
   - `"xdg"`: 既存の `~/.local/share/specrunner/jobs/`, `~/.local/state/specrunner/logs/`
   - 解決ロジックは `src/util/xdg.ts` の `getJobsDir()` / `getVerboseLogDir()` を config-aware にする

3. **rules.md / project.md / README の path 表記を新パスに同期する**
   - `src/prompts/rules.ts:80-81` の path リテラル更新
   - `specrunner/project.md` の「状態管理」セクション更新

## スコープ外

- `JobState` の schema / format 変更（構造は現状維持、`modelUsage` も含めて既存どおり）
- cost / USD 換算 / price table / `usage.json` サマリ出力（token usage は既に `StepRun.modelUsage` に記録されており、別途サマリ file を作る要件は本 request に含めない）
- `.specrunner/` 配下を git commit するワークフロー（デフォルト除外、commit したい user が opt-in する余地は残すが本 request では扱わない）
- credentials / config の格納先変更（per-user / secret なので XDG_CONFIG_HOME のまま維持）
- worktree 内から parent repo の `.specrunner/` への書き込み戦略（既存の repo root 検出ロジックを踏襲、設計判断が必要なら別 request）
- 旧 XDG パスに残っている job state / log の取り扱い（移行・検出・警告など一切含めない）

## 受け入れ基準

- [ ] `.specrunner/jobs/<jobId>.json` がデフォルトで作成される（`config.jobs.location` 未設定時）
- [ ] `config.jobs.location: "xdg"` を設定すると従来パスに書かれる
- [ ] `.specrunner/logs/<jobId>.log` に verbose log が書かれる
- [ ] `specrunner init` / `bootstrap` 後の `.gitignore` に `.specrunner/` が含まれる
- [ ] rules.md / project.md / README の path 表記が新パスに更新されている
- [ ] `bun run typecheck && bun run test` が green

## Workflow Options

- enabled: []

## architect 評価済みの設計判断

- **`.specrunner/` vs `specrunner/.machine/`**: dot prefix 慣習（`.git`, `.next`, `.cache`）に揃えて前者を採用。`specrunner/` (human) と `.specrunner/` (machine) で領域分離が一目で分かる
- **デフォルト project / opt-out で XDG**: specrunner が repo-bound である以上 project 内が自然。複数 repo の混在を防ぐ
- **`.gitignore` 追記は tool が宣言する責任**: machine-generated state を `.gitignore` するのは慣習（terraform / vagrant / next.js 等）。`init` / `bootstrap` で append し、user が手で書く必要をなくす
