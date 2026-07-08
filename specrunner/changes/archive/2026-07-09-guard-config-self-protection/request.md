# fast pipeline のガード構成データを自己保護する

## Meta

- **type**: spec-change
- **slug**: guard-config-self-protection
- **base-branch**: main
- **adr**: true

## 背景

fast pipeline の forbidden surfaces は `.specrunner/config.json` に宣言される（外出しは 2026-07-06 の fast-scope-config で導入）。この結果、ガードの構成データ（`pipeline.fast.forbiddenSurfaces`、および verification の `coverage` 宣言）が、fast pipeline の agent が編集可能な mutation surface の内側に置かれている。

agent が worktree 内で `.specrunner/config.json` から surface 宣言を削除しても、config 自身はどの forbidden surface にも一致しないため conformance は breach を検出しない。その PR が merge されると、以後の全 fast run が無防備になる（run を跨ぐ自己解除経路）。実行中の run 自体は preflight が main checkout 側の config を先読みするため安全であり、危険なのは merge 後の後続 run である。

また、`job resume` は cwd から repoRoot を解決して config を読むため、job worktree 内から resume すると agent が改変した config が guard 判定前に読まれ得る。

対策は 2 点: (1) config 自身を forbidden surface として宣言する、(2) worktree 内からの resume を拒否する。

## 現状コードの前提

- `.specrunner/config.json:18-24` — `pipeline.fast.forbiddenSurfaces` に public-types / persisted-format / state-transitions の 3 surface が宣言され、config 自身を保護する surface は無い
- `src/core/preflight.ts:48-49` — run 開始時の config は起動 cwd から `resolveRepoRoot` → `loadConfig` で解決される
- `src/core/command/resume.ts:209-213` — resume も `resolveRepoRoot(cwd)` の結果から `loadConfig` する。worktree 内の cwd では worktree 側の `.specrunner/config.json`（checkout 済み・agent 編集可能）が読まれる
- `src/core/worktree/manager.ts:56` — job worktree は main repo の `.git/specrunner-worktrees/` 配下に作られる
- `tests/unit/core/pipeline/resolve-scope.test.ts:357-410` — dogfooding テストは実ファイルの `.specrunner/config.json` を読み、`surfaces.some((s) => s.id === ...)` の加算安全な形で 3 surface の宣言を固定している（surface 追加で壊れない）
- `tests/unit/core/step/fast-scope-checkpoint.test.ts:211-240` — config 解決済み scope で StepExecutor + ConformanceStep を駆動して breach 検出を固定するテスト形式が既にある

## 要件

1. `.specrunner/config.json` の `pipeline.fast.forbiddenSurfaces` に、config 自身（path: `.specrunner/config.json`）を保護する surface を追加する（id 例: `guard-config`）
2. dogfooding テストに新 surface の宣言を固定する assert を追加する
3. fast pipeline の job が `.specrunner/config.json` を変更した場合に conformance checkpoint が breach を検出することを、既存の fixture テスト形式（fast-scope-checkpoint.test.ts）に従ってテストで固定する
4. specrunner の job worktree（`.git/specrunner-worktrees/` 配下）内の cwd から `job resume` が起動された場合、config を読み込む前に明示エラーで拒否する。エラーメッセージには main checkout 側から再実行する案内を含める

## スコープ外

- standard / design-only pipeline への scope 宣言の追加
- conformance / escalation / capability gate 機構本体の変更
- resume 以外のコマンド（job start / archive 等）への cwd 検証の追加
- config の hash 照合・署名などの改竄検知機構

## 受け入れ基準

- [ ] fast job が `.specrunner/config.json` を変更した fixture で conformance が breach を検出することがテストで固定される
- [ ] dogfooding テストが guard-config surface の宣言（id と path）を固定する
- [ ] worktree 内 cwd からの `job resume` が config 読み込み前に明示エラー（exit 非 0、main checkout への案内を含む）になることをテストで固定する
- [ ] main checkout からの `job resume` は従来どおり動作する（既存テスト無変更で green）
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **採用**: worktree 内 resume は「拒否」する。判定は機械的（cwd の実パスが `.git/specrunner-worktrees/` 配下か）で、agent や運用者の判断場面を増やさない。通常 runbook（main checkout から resume）とも整合する
- **却下**: worktree path から main root を導出して config を読み替える「リダイレクト」案 — no-worktree mode やカスタム配置で分岐が増え、「どの config が読まれたか」が cwd に依存して不透明になる
- **却下**: config の hash を job state に記録して resume 時に照合する案 — 改変の検知はできるが、並行 merge による正当な config 変更との区別に判断が必要になり、escalation が増える
- **却下**: forbiddenSurfaces を registry 側ハードコードに戻す案 — per-repo 宣言の利点（fast-scope-config の導入意図）を失う
