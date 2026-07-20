# Design: CI の package smoke を初回接触契約の assert に拡張する

## Context

開発検証（bun + TS ソース + repo root）と利用者の実運用（node + dist bundle + npx + 任意 cwd）は実変数がすべて異なる。既存の package smoke は起動確認だけで初回接触の契約を何も assert していないため、公開物にだけ現れる欠陥を dogfooding で構造的に検出できない。本 change はこの smoke を「packed tarball を fixture へ install し、`npx --no-install specrunner`（npm 利用者の実入口）で初回接触契約を歩くゲート」に拡張する。

現状コードの前提（確認済み）:

- **既存 smoke**: `.github/workflows/ci.yml:42-49` — `npm pack` → `mktemp` → `npm init -y` → tarball を `--omit=optional` で install → `./node_modules/.bin/specrunner --help` のみ。ワークフロー末尾の step で、`bun run build`（同 workflow の前段 step）が dist を生成した後に走る。
- **配布物**: `package.json` の `bin.specrunner = "dist/specrunner.js"`。`files = ["dist/", "README.md", "LICENSE"]`。`dependencies` は `@anthropic-ai/sdk` のみ。`@anthropic-ai/claude-agent-sdk` / `@openai/codex-sdk` は `optionalDependencies`。`tsup.config.ts` は単一 ESM バンドル（`splitting:false`）を `node20` 向けに出力し、この 3 SDK を `external`（遅延ロード）にする。エントリ `bin/specrunner.ts:1` は `#!/usr/bin/env node` shebang を持つため dist は node で実行される。
- **init**: `src/cli/init.ts:72-90` — `git rev-parse --show-toplevel` が非ゼロ / 起動不能なら、config（`getConfigPath()`）書き込みより**前**に `return 1`。`:93` 以降の config / `.gitignore` / `specrunner/drafts` / `specrunner/changes` の書き込みはすべて git repo ゲート通過後。`:163-176` で 4 項目を `logResult`（**stdout**、`<label>: <status>` 形式、status は `created` | `already exists`）に列挙する（merge 済み契約 init-reports-scaffold）。
- **init の provider 解決**: `src/cli/init.ts:24-40` `resolveInitProvider` は非 TTY で `"anthropic"` を無プロンプトで返し、TTY では対話プロンプトを出す。`init` は `--provider` flag も受ける（`src/cli/command-registry.ts:289-301`）。
- **request new**: `src/cli/command-registry.ts:358` が `ctx!.repoRoot!`（git 解決した repo root、`process.cwd()` ではない）を `executeNew` の cwd に渡す。`src/core/command/request-new.ts:49` → `src/core/request/store.ts:82-87` で `<repoRoot>/specrunner/drafts/<slug>/request.md`（ディレクトリ形式）へ書く。`requiresRepo: true`。成功メッセージ `Created: ...` は stderr、exit 0。
- **XDG / doctor**: `src/util/xdg.ts:8-19` `getConfigPath()` は `XDG_CONFIG_HOME` を尊重する。`src/cli/doctor.ts:209` で `ctx.configPath = getConfigPath()`。`src/core/doctor/checks/config/file-exists.ts:9,16` の `config-file-exists` check は `ctx.configPath` を stat し、存在かつ mode 0o600 で `pass`（win32 は perm チェック skip、存在すれば `pass`）。`src/config/store.ts:205-214` `saveConfig` は 0o600 で atomic write するため init 直後の config は `pass` 条件を満たす。`src/core/doctor/formatter.ts:112-147` `formatJson` は `results[]` に `name` / `status` を含む JSON を stdout へ出す。`src/cli/doctor.ts:225` は fail check があれば exit 1（token 不在時は github token 系 check が fail するため exit は常に 1 になり得る）。
- **doctor の optional 依存**: `src/core/doctor/checks/index.ts` が集約する common / local check は optional SDK（claude-agent-sdk / codex-sdk）を静的 import しない。local check（`claudeCodeTokenPresentCheck` / `codexCliCheck`）は token / CLI バイナリの有無を見るだけで npm SDK module をロードしない。よって `doctor --json` は `--omit=optional` install でも起動・出力できる。

これらの契約は現在 unit / contract テストが固定しているが、**dist bundle を node で実行しての成立**を歩くゲートは存在しない。

## Goals / Non-Goals

**Goals**:

- **G1**: 既存 smoke step を、packed tarball のみ（repo の TS ソース・bun 非依存）で初回接触契約を assert する step に置き換える。assert 対象は T1〜T5（受け入れ基準）。
- **G2**: assert 本体を repo 内の**ローカル実行可能なスクリプト**に切り出し、CI はそれを呼ぶだけにする。開発者が手元で同じ smoke を実行・デバッグできる。
- **G3**: fixture を `mktemp` 配下に作り、`XDG_CONFIG_HOME` / `HOME` を隔離して、runner / 開発者機の実 config・認証状態に依存しない。token 不在でも成立する assert のみで構成する。
- **G4**: 各 assert を個別に falsifiable にし、破壊確認（T6）が期待値反転で 1 つずつ落とせる構造にする。

**Non-Goals**（request のスコープ外を踏襲）:

- CI の他 job / step の変更（既存 build・test・lint 構成には触れない）。
- login / run など認証を要する経路の smoke（token 不在で成立しないため対象外。認証系は unit / 実運用 dogfooding が担う）。
- npm publish 経路（`publish.yml`）の変更。
- init / request new / doctor / XDG など**被 assert 側の製品挙動の変更**。本 change は既存契約を歩くだけで、`src/` の製品ロジックは変更しない。

## Decisions

### D1: assert 本体をローカル実行可能なシェルスクリプトに切り出し、CI は呼ぶだけにする

smoke の assert 本体を repo 内スクリプト `scripts/smoke/package-smoke.sh`（POSIX/bash）に置く。CI の該当 step はこのスクリプトを 1 行で呼ぶだけにする。スクリプトは `npm` / `node` / `git` / `mktemp` / coreutils のみを使い、`bun` と repo の `src/` を一切参照しない。

**Rationale**: workflow YAML への直書きだと、ローカルで再現・デバッグできず、YAML 内 bash は破壊確認（T6）も実質不可能。スクリプト化すれば開発者が同一の smoke を手元で回せ（G2）、各 assert を関数分割して個別に落とせる（G4）。

**Alternatives considered**:
- workflow YAML に直書き → 却下（ローカル再現不可・破壊確認不可、architect 評価で却下済み）。
- assert を vitest に書く → 却下。vitest 実行は bun / repo の TS を引き込み、「packed tarball + node のみ」（T5）の隔離が崩れる。smoke の主旨は**配布物を製品コードから切り離して歩く**ことにある。

### D2: tarball を fixture project 自身に install し、すべての CLI 実行を `npx --no-install specrunner` で行う

スクリプトの実行フロー:

1. **前提チェック**: `dist/specrunner.js` の存在を確認し、無ければ「先に build して dist を生成せよ」と明示エラーで停止する（スクリプトは build を担わない＝bun を呼ばない）。CI では前段 `bun run build` が dist を用意する。
2. **pack**: `npm pack` を temp ディレクトリ宛に実行し、生成された tarball のパスを解決する。
3. **install**: fixture 側へ install する — 非 git ディレクトリ（S1 用）と fixture git repo（S2 以降用）のそれぞれで `npm init -y` → `npm install --omit=optional <tarball>`。install 後、`node_modules/.bin/specrunner` が生成されていることを前提条件として検査する（`bin` 配線故障の即時検出）。
4. **assert**: 各 scenario は fixture 内の cwd（root または nested subdirectory）から `npx --no-install specrunner …` で CLI を叩く。

CLI 起動は常に `npx --no-install specrunner` — **npm 利用者が実際に打つコマンドそのもの**であり、`package.json` の `bin` 指定・shebang・`.bin/specrunner` 生成・npx の上方 node_modules 解決がすべて assert 経路に載る。`--omit=optional` を維持するのは、assert 対象の経路（init / doctor / request new / --help）が optional SDK に依存しないことを同時に証明するため（Context の doctor 依存分析）。

**Rationale**: smoke の主題は「利用者の実入口の成立」である。`node <dist>` 直叩きは dist の実行可能性しか証明せず、`bin` 配線・shebang・実行権限が壊れても green になる（旧 smoke が持っていた `./node_modules/.bin/specrunner` の確認すら失う）。install を fixture 自身に置くのは、npx の解決が「その project に install された CLI」という実運用と一致するため。

**Alternatives considered**:
- 別ディレクトリに install して `node <dist>` を直接叩く → 却下。npm 利用者の実入口（bin 配線 / shebang / npx 解決）を迂回し、それらの故障を smoke が検出できない。
- `./node_modules/.bin/specrunner` を直接叩く → 可（bin 配線は載る）が、npx の上方解決（subdirectory からの起動で使われる実経路）が載らないため `npx --no-install` を採る。
- optional 込みで install → 却下。assert 経路が optional SDK 非依存であることの証明を失い、install も重くなる。

### D3: fixture は mktemp 配下に作り、XDG_CONFIG_HOME / HOME を隔離し、非対話で起動する

各 scenario は `mktemp -d` 配下に fixture（git repo / repo 外ディレクトリ / 隔離 XDG）を作る。CLI 起動時に `XDG_CONFIG_HOME` と `HOME` を temp のパスへ差し替え、runner / 開発者機の実 config・認証を参照させない。CLI 呼び出しはすべて非対話にする（`init` は `--provider anthropic` を渡し、かつ `< /dev/null` で stdin を非 TTY 化して provider プロンプトのハングを防ぐ）。スクリプトはトップで `set -u` と失敗検知を用い、意図的な非ゼロ exit（T1）は `set -e` で誤って中断しないよう明示的に exit code を捕捉する。

**Rationale**: XDG / HOME を隔離しないと、開発者機の既存 config が `config-file-exists` を無条件に pass させ（隔離 XDG 契約 T3 を無意味化）、また repo 外 init の「XDG 配下も空のまま」の assert（T1）も成立しなくなる。provider プロンプトは TTY で発火するため、非 TTY 化しないとローカル対話実行でスクリプトがハングする。

**Alternatives considered**:
- token 系 env（`GITHUB_TOKEN` 等）も明示 unset → 任意（防御的に採ってよい）。ただし本 smoke は per-check 判定（D4）で token 有無に非依存な assert のみを選ぶため、unset は必須ではない。XDG / HOME 隔離を主とする。

### D4: doctor は全体 exit code ではなく該当 check の status で判定する（T3）

隔離 XDG で `init` した後の `doctor --json` の stdout を node で JSON parse し、`results[]` から `name === "config-file-exists"` のエントリを取り出して `status === "pass"` を assert する。doctor の**プロセス全体 exit code は判定に使わない**。

**Rationale**: token 不在環境では github token 系 check が fail し doctor は常に exit 1 を返す（`src/cli/doctor.ts:225`）。全体 exit で判定すると XDG 契約と無関係に固定 fail になり、assert が意味を失う。per-check status なら XDG 契約だけを切り出して観測できる（architect 評価で全体 exit 判定は却下済み）。JSON parse は node の `-e` ワンライナーで行い、`jq` 等の外部依存を持ち込まない。

**Alternatives considered**:
- 全体 exit code で判定 → 却下（上記、token 不在で常時 fail）。
- 人間可読出力を grep → 却下。フォーマットが不安定で per-check の status 抽出が脆い。`--json` の `name`/`status` が安定契約（`formatter.ts:122-137`）。

### D5: scenario 分割と観測点 — 共有 fixture による逐次ユーザーセッション

各受け入れ基準を scenario 関数にし、machine-greppable な PASS/FAIL 判定行を出して、1 つでも失敗したらスクリプト全体を非ゼロ exit させる。fixture は 2 つ: **F1（非 git の install dir、S1 専用）**と **F2（git init 済み fixture repo + origin stub、S2 以降が共有）**。F2 上の scenario（S2 → S2b → S2c → S3 → S4）は**実ユーザーの逐次セッションを写した順序依存の連続**であり、前段の状態（init 済み config・scaffold）を意図的に引き継ぐ。init の 2 回目 already-exists や半初期化の補完は、まさに「同一環境での時系列」でしか検証できない契約である。

- **S5 / help（T5・先頭で実行）**: `npx --no-install specrunner --help` が exit 0 で `Usage: specrunner` を出す。bin 配線 / shebang / npx 解決の生存確認を最初に行う。
- **S1 / repo 外 init（T1、F1・独立）**: 非 git の install dir を cwd、隔離 XDG（空）で `init`。観測: exit 非ゼロ / `specrunner/` も `.gitignore` も無い / `$XDG_CONFIG_HOME/specrunner/config.json` 不在。`GIT_CEILING_DIRECTORIES` で git の上位探索を封じる。
- **S2 / 初回 init（T2、F2）**: subdirectory（`sub/deep`）から `init`。観測: exit 0 / root に scaffold / subdir に入れ子なし / **4 項目すべての `created` 報告**。
- **S2b / 2 回目 init（T2、F2 継続）**: 同条件で再実行。観測: **4 項目すべての `already exists` 報告**（冪等）。
- **S2c / 半初期化（T2、F2 継続）**: scaffold と `.gitignore` を削除して再実行。観測: config は `already exists`、他 3 項目は `created` — 分離報告の正しさ。
- **S3 / doctor 同値 + XDG 契約（T3、F2 継続）**: `doctor --json` を root と subdirectory の両方から実行。観測: per-check（name/status）集合の同値 / `config-file-exists === "pass"`（全体 exit code は不使用、D4）。
- **S4 / subdirectory request new（T4、F2 継続）**: subdirectory から `request new <fixed-slug>`（非対話）。観測: root 側に request.md / subdir に入れ子なし。

**Rationale**: 当初は「scenario ごとの独立 fixture・順序非依存」を志向したが、issue の正典が要求する init 3 相（初回 / 2 回目 / 半初期化）と doctor 同値は**状態を引き継ぐ逐次セッションそのもの**であり、独立 fixture では表現できない。破壊確認の局所性は、期待値反転が当該 assert 行だけを落とすこと（実測: 反転 1 箇所 = FAIL 1 件）で維持される。install を fixture ごとに繰り返さないため実行時間も抑えられる。

**Alternatives considered**:
- scenario ごとに独立 fixture を立て直す → 却下。2 回目 init / 半初期化 / root-sub 同値が検証不能になるか、fixture 準備コード内で init を「再現」することになり、検証対象（実 CLI の時系列挙動）を fixture 構築が代行してしまう。
- origin stub を置かない → 却下。fixture が「origin を持つ実プロジェクト」から乖離し、`github-origin` check の分だけ doctor 結果が実運用と離れる。stub は `https://github.com/example/fixture-app.git` の URL 設定のみでネットワークに触れない。

### D6: CI 配線とローカル起動口

`.github/workflows/ci.yml:42-49` の既存 `Package smoke test` step を、`scripts/smoke/package-smoke.sh` を呼ぶ step に置き換える（step は 1 つのまま、他 step は不変）。step は前段 `bun run build`（dist 生成）の後に位置させる。加えて `package.json` の `scripts` に、このスクリプトを呼ぶ薄い convenience エントリ（例 `smoke`）を additive に足す（build / test / lint script は変更しない）。ローカルでは `bash scripts/smoke/package-smoke.sh`（または convenience script）で同一の smoke を実行できる。

**Rationale**: CI と開発者が**同一のアーティファクト**（1 本のスクリプト）を実行することが G2 の核心。step を 1 つに保ち他 step を触らないことでスコープ外制約を守る。

**Alternatives considered**:
- CI 専用ロジックとローカル用ロジックを分ける → 却下。二重管理で drift し、「CI green だがローカルで再現不能」を招く。

## Risks / Trade-offs

- **[Risk] `--omit=optional` install で doctor / init が起動時に optional SDK を要求して落ちる** → Mitigation: Context の依存分析どおり、assert 経路（init / doctor / request new / --help）は optional SDK を静的 import しない。仮に将来この前提が崩れれば smoke が S3/S5 で即 fail し、配布物のリグレッションとして可視化される（smoke 自身が検知器）。
- **[Risk] mktemp の親が偶発的に git repo 配下（開発者機で `$TMPDIR` が repo 内等）だと、repo 外 init（S1）が「repo 内」と誤認される** → Mitigation: fixture 親を `GIT_CEILING_DIRECTORIES` に設定し、git の上位探索を temp 境界で止める。加えて S1 実行前に「fixture dir が repo 外である」ことを `git rev-parse` で確認し、そうでなければ環境エラーとして明示 fail する。
- **[Risk] init の provider プロンプトが TTY 実行でハングする** → Mitigation: D3 のとおり `--provider anthropic` + `< /dev/null` で非対話固定。
- **[Risk] `set -e` が S1 の意図的な非ゼロ exit で早期中断する** → Mitigation: 意図的失敗を許す scenario では exit code を明示捕捉（`if ! cmd; then ...` / `rc=$?`）し、`set -e` に依存しない失敗判定にする。
- **[Trade-off] スクリプトは dist を自前で build しない（bun 非依存を守るため）** → 結果として「先に build する」前提が要る。CI は前段 step が満たし、ローカルは開発者が build 済み dist を用意する運用にする。前提未達時は明示エラーで停止（D2-1）するため沈黙失敗にはならない。
- **[Trade-off] tarball 実 install はネットワーク（`@anthropic-ai/sdk` 取得）を要する** → CI / 通常の開発環境は接続前提のため許容。オフライン開発機での実行は制約となるが、smoke の目的（配布物の初回接触）上、実 install は不可欠。

## Open Questions

なし。スクリプト配置（`scripts/smoke/package-smoke.sh`）・判定形式（per-check status / machine-greppable PASS-FAIL 行）・非対話化・隔離方針は本設計で確定させ、spec の Scenario と実装で固定する。
