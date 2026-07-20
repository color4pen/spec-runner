# Tasks: CI の package smoke を初回接触契約の assert に拡張する

実装対象:
- `scripts/smoke/package-smoke.sh`（新規 — assert 本体。`npm`/`node`/`git`/`mktemp`/coreutils のみ。`bun` と repo `src/` を参照しない）
- `.github/workflows/ci.yml`（既存 `Package smoke test` step の置き換えのみ。他 step 不変）
- `package.json`（`scripts` に convenience エントリを additive 追加。build/test/lint script は不変）

被 assert 側の製品コード（init / doctor / request new / xdg 等 `src/`）は変更しない。既に merge 済みの契約を歩くだけ。

共通の実装前提（design D2〜D5）:
- 起動は常に `npx --no-install specrunner` 形式（npm 利用者の実入口 = `bin` 配線・shebang・`.bin/specrunner` 生成を通る経路）。install は fixture project 自身へ `npm install --omit=optional <tarball>`。
- CLI 呼び出しは非対話（`init` は `--provider anthropic` かつ `< /dev/null`）。
- 各 scenario は `mktemp` 配下の専用 fixture を持ち、`XDG_CONFIG_HOME` / `HOME` を temp へ隔離する。
- 各 assert は machine-greppable な PASS/FAIL 判定行を出し、1 つでも失敗したらスクリプト全体を非ゼロ exit させる。意図的な非ゼロ exit を扱う scenario では exit code を明示捕捉する（`set -e` に依存しない）。

## T-01: smoke スクリプトのハーネス（pack → install → dist 解決）を実装する

- [x] `scripts/smoke/package-smoke.sh` を新規作成し、実行権限を付与する。冒頭コメントに用途・ローカル実行方法（`bash scripts/smoke/package-smoke.sh`）・「bun / src を参照しない」旨を書く。
- [x] `set -u`（必要に応じ `pipefail`）を設定し、意図的失敗 scenario と衝突しない失敗判定方針を採る。
- [x] リポジトリ root を解決し、`dist/specrunner.js` の存在を前提チェックする。無ければ「先に build して dist を生成せよ」と明示エラーで非ゼロ exit（スクリプトは build を担わない＝`bun` を呼ばない）。
- [x] `npm pack` を temp ディレクトリ宛に実行し、生成 tarball のパスを解決する。
- [x] fixture project（非 git dir と git repo の 2 つ）で `npm init -y` → `npm install --omit=optional <tarball>` を実行し、`node_modules/.bin/specrunner` の生成を前提条件として検査する。以後の CLI 実行はすべて `npx --no-install specrunner`。
- [x] scenario 共通のヘルパ（隔離 env での起動、PASS/FAIL 判定行の出力、失敗集計と最終 exit）を用意する。
- [x] スクリプト終了時に temp ディレクトリ・生成 tarball を後片付けする（trap 等）。

**Acceptance Criteria**:
- スクリプト単体で `bash scripts/smoke/package-smoke.sh` としてローカル起動でき、dist 未 build 時は明示エラーで停止する。
- install 後、`node <解決した dist> --help` が起動できる（後続 scenario の前提）。
- スクリプト内に `bun` の呼び出しと `src/` への参照が存在しない。

## T-02: S1 — repo 外 init の非ゼロ exit と無書き込み（T1）

- [x] `mktemp` 配下に「git repo でない」fixture ディレクトリと、空の隔離 `XDG_CONFIG_HOME` を用意する。`GIT_CEILING_DIRECTORIES` を fixture 親に設定し、実行前に fixture が repo 外であることを `git rev-parse` で確認する（repo 内なら環境エラーで fail）。
- [x] fixture を cwd、隔離 XDG/HOME で `node <dist> init --provider anthropic < /dev/null` を実行し、exit code を明示捕捉する。
- [x] assert: exit code が非ゼロ / fixture 直下に `specrunner/` も `.gitignore` も無い / `$XDG_CONFIG_HOME/specrunner/config.json` が不在。

**Acceptance Criteria**:
- repo 外 init が非ゼロ exit し、cwd と隔離 XDG のいずれにも書き込みが無いことが assert される。
- この assert は他 scenario と独立に評価され、単独で PASS/FAIL 判定行を出す。

## T-03: S2 — subdirectory init の root 着地・入れ子なし・created 報告（T2）

- [x] `mktemp` 配下に `git init` した fixture repo を作り、subdirectory（例 `sub/deep`）と空の隔離 `XDG_CONFIG_HOME` を用意する。
- [x] subdirectory を cwd、隔離 XDG/HOME で `node <dist> init --provider anthropic < /dev/null` を実行し、stdout を捕捉する。
- [x] assert: exit 0 / `<root>/specrunner/drafts` と `<root>/specrunner/changes` が存在 / `<subdir>/specrunner` が不在 / stdout に created の項目報告（例 `specrunner/drafts: created`）を含む。

**Acceptance Criteria**:
- subdirectory init が exit 0 で scaffold を repo root に作り、subdirectory 配下に入れ子の `specrunner/` を作らないことが assert される。
- stdout の created 項目報告の存在が assert される。

## T-04: S3 — 隔離 XDG → init → doctor --json の config-file-exists = pass（T3）

- [x] `mktemp` 配下に `git init` fixture と空の隔離 `XDG_CONFIG_HOME` を用意し、その XDG で `node <dist> init --provider anthropic < /dev/null` を実行する。
- [x] 同 XDG・fixture root cwd で `node <dist> doctor --json` を実行し、stdout を捕捉する。
- [x] node のワンライナー（`node -e`、`jq` 等の外部依存を使わない）で JSON を parse し、`results[]` から `name === "config-file-exists"` を取り出す。
- [x] assert: 取り出した check の `status === "pass"`。doctor プロセス全体の exit code は判定に使わない。

**Acceptance Criteria**:
- 隔離 XDG で init 済みの状態に対し、`doctor --json` の `config-file-exists` check が `pass` であることが per-check status で assert される。
- 判定に doctor の全体 exit code を使っていない（token 不在でも成立する）。

## T-05: S4 — subdirectory request new の root 着地・入れ子なし（T4）

- [x] `mktemp` 配下に `git init` fixture と subdirectory を用意する（固定 slug を用いる。例 `smoke-request-fixture`。`/^[a-z0-9][a-z0-9-]{0,63}$/` に適合すること）。
- [x] subdirectory を cwd に `node <dist> request new <slug>`（非対話、`< /dev/null`）を実行し、exit code を捕捉する。
- [x] assert: exit 0 / `<root>/specrunner/drafts/<slug>/request.md` が存在 / `<subdir>/specrunner` が不在。

**Acceptance Criteria**:
- subdirectory からの request new が repo root 側に request.md を作り、subdirectory 配下に入れ子の `specrunner/` を作らないことが assert される。

## T-06: S5 — help 維持（T5）と CI / ローカル起動口の配線

- [x] `node <dist> --help` が exit 0 で usage を出すことを assert する（既存起動確認の維持）。
- [x] `.github/workflows/ci.yml` の既存 `Package smoke test` step（現 `:42-49`）を、`scripts/smoke/package-smoke.sh` を呼ぶ step に置き換える。step 名を契約 assert を表す名前に更新する。step は前段 `bun run build`（dist 生成）より後に位置させる。他 job / step は変更しない。
- [x] `package.json` の `scripts` に、スクリプトを呼ぶ薄い convenience エントリ（例 `"smoke": "bash scripts/smoke/package-smoke.sh"`）を additive に追加する。既存 build/test/lint script は変更しない。

**Acceptance Criteria**:
- `--help` 起動確認が smoke に含まれ、スクリプトが packed tarball と node のみで動く（`bun` / repo `src/` 非参照）。
- CI の smoke step がスクリプト呼び出しに置き換わり、他 step は不変。
- ローカルで `bash scripts/smoke/package-smoke.sh`（または convenience script）から同一 smoke を実行できる。

## T-07: 破壊確認（T6・ローカル）

- [x] S1〜S4 の各 assert について、期待値を意図的に反転（または前提を壊す）して、その scenario の assert が実際に fail することを 1 つずつ確認する。
- [x] 各破壊が対象 scenario だけを落とし、他 scenario の評価を巻き込まないこと（個別 falsifiable）を確認する。
- [x] 確認後、すべての反転を元に戻し、スクリプトが全 scenario PASS で終了することを確認する。

**Acceptance Criteria**:
- 各 assert が反転時に実際に fail し、対象 scenario に帰属して落ちることが確認され、確認後に元へ戻されている。

## T-08: 検証（T7）

- [x] `bun run build` で dist を用意した状態で `bash scripts/smoke/package-smoke.sh` が全 scenario PASS で exit 0 になることを確認する。
- [x] `bun run typecheck`（tsc）が green であることを確認する。
- [x] `bun run test`（vitest）が green であることを確認する。
- [x] 変更が `scripts/smoke/package-smoke.sh`・`.github/workflows/ci.yml` の該当 step・`package.json` の scripts 追加に限られ、被 assert 側の製品コード（`src/`）や他 CI step を変更していないことを確認する。

**Acceptance Criteria**:
- smoke スクリプトがローカルで全 scenario green、`typecheck && test` が green。
- CI（本 smoke を含む）が green になる想定で、スコープ外（他 step / 製品コード / publish.yml）に変更が無い。
