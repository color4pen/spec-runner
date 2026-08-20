# --from の検証正本を core に一本化し CLI 静的 enum を撤去する

## Meta

- **type**: bug-fix
- **slug**: from-flag-core-validation
- **base-branch**: main
- **adr**: false

## 背景

`job resume --from` / `job reopen --from` の値検証が 2 箇所にある。CLI parser の静的 enum（`AGENT_STEP_NAMES + CLI_STEP_NAMES`）と、core の job 状態依存の検証（`buildAllowedStepSet` → `resolveResumeStep`）である。core は job が custom reviewers を持つ場合に `regression-gate` / `custom-reviewers` / 各 reviewer member 名を許可し（member 名は coordinator へ写像）、廃止 step の legacy alias（`build-fixer` / `test-materialize` → implementer）も受理する。しかし CLI の静的 enum がこれらを parser 段で `ARG_ERROR(2)` 拒否するため、core が持つ能力に到達できない。

実害: custom reviewers を持つ job が regression-gate で halt した際、`--from regression-gate` / `--from custom-reviewers` / `--from <member名>` がすべて CLI で "Invalid --from value" になり、gate へ operator 裁定を注入する resume 経路が塞がれる（issue #1023）。

正本は core の 1 箇所に置く。CLI parser は `--from` を任意文字列として受理し、検証は state を読んだ後の core（`buildAllowedStepSet(state.reviewers)` → `resolveResumeStep`）だけが行う。

## 現状コードの前提

- `src/cli/command-registry.ts:1061`（resume）と `:1197`（reopen）の `from` flag が `values: [...AGENT_STEP_NAMES, ...CLI_STEP_NAMES]` の静的 enum を持ち、列挙外の値を parser 段で `ARG_ERROR(2)` 拒否する
- `src/core/resume/resolve-step.ts:32-44` `buildAllowedStepSet(reviewers)` は reviewers が非空のとき `REGRESSION_GATE_STEP_NAME` / `CUSTOM_REVIEWERS_STEP_NAME` / 各 member 名を許可集合に加える
- `src/core/resume/resolve-step.ts:60-67` `mapMemberToCoordinator` は member 名を coordinator（custom-reviewers）へ写像する
- `src/core/resume/resolve-step.ts:19-22` `LEGACY_STEP_ALIASES` は `build-fixer` / `test-materialize` を implementer へ写像する（CLI enum はこれらも塞いでいる）
- `src/core/command/resume.ts:262-267` は `resolveResumeStep` の throw を catch し `PrepareError(1, "Failed to resolve resume step")` に包む（exit 1）
- `src/core/command/reopen.ts:222-227` も同形で `PrepareError(1, "Failed to resolve reopen step")` に包む
- `src/cli/command-registry.ts:368-373` resume の usage text は「composite steps (custom-reviewers fan-out, regression-gate) are not valid --from targets」と記載しており、core の実能力と矛盾する
- `src/cli/command-registry.ts:500` reopen の usage text は静的 step 一覧のみを列挙する
- `job resume --from-issue` 経路は flag をそのまま `runResumeCore` に渡すため、core 検証一本化がそのまま適用される（経路固有の変更は不要）

## 要件

1. `src/cli/command-registry.ts` の resume（:1061）と reopen（:1197）の `from` flag から静的 `values` 制約を外し、任意文字列として受理する。検証は core（`buildAllowedStepSet(state.reviewers)` → `resolveResumeStep`）のみが行う。
2. `--from` に不正な値を渡した場合の exit code は従来どおり `ARG_ERROR(2)` を維持する。現状 `resume.ts:262-267` / `reopen.ts:222-227` の catch は resolve 失敗を一律 exit 1 に包むため、`--from` が明示指定されていて resolve に失敗した場合は exit 2、`--from` 未指定で復帰点が決定できない失敗は従来どおり exit 1、と区別する。エラーメッセージには core が生成する利用可能 step 一覧（`resolveResumeStep` の throw メッセージ）を表示する。
3. usage text を実能力に合わせる: resume（:368-373）の「composite steps are not valid --from targets」注記を削除し、custom reviewers を持つ job では `regression-gate` / `custom-reviewers` / member 名（coordinator へ写像）も指定できる旨に置き換える。reopen（:500）の静的一覧にも同趣旨の注記を加える。`bite-evidence` の internal step 注記は維持する。

## スコープ外

- `buildAllowedStepSet` / `resolveResumeStep` / `mapMemberToCoordinator` の検証セマンティクス変更（core は既に正しい。触らない）
- findings-ledger / regression-gate の裁定接続（issue #1022、別 request）
- `--from-issue` 経路の固有変更（flag passthrough で自動適用）
- legacy alias（`build-fixer` 等）の整理・削除

## 受け入れ基準

- [ ] custom reviewers を持つ job で `job resume <slug> --from regression-gate` / `--from custom-reviewers` が CLI parser で拒否されず core 検証を通過することをテストで固定する
- [ ] custom reviewers を持つ job で `--from <member名>` が coordinator（custom-reviewers）へ写像されて resume されることをテストで固定する
- [ ] reviewers を持たない job で `--from regression-gate` が core で拒否され exit code 2 になることをテストで固定する
- [ ] 不正な `--from` 値（例: 存在しない step 名）の exit code が resume / reopen 両方で 2 であることをテストで固定する
- [ ] `--from` 未指定で復帰点が決定できない失敗は従来どおり exit 1 のまま（既存テストがあれば無変更で green、なければ 1 件固定する）
- [ ] resume の usage text から「composite steps ... are not valid --from targets」の記述が消え、動的 step の説明に置き換わっている
- [ ] 既存の resume / reopen テストが無変更で green
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- **検証正本を core に一本化（採用）**: 許可される step 集合は job の state（reviewers の有無）に依存するため、state を読まない CLI parser 段では正しく検証できない。静的 enum は「state 非依存の部分集合」しか表現できず、core 能力を塞ぐ偽陰性の源になる。
- **CLI enum を動的化する案（却下）**: parser 段で state を読んで enum を構築する案は、検証正本が 2 箇所のままになり、slug 解決前に state が読めない構造上の矛盾もある。
- **exit code の区別（採用）**: `--from` 明示指定の不正値は利用者の引数誤りなので `ARG_ERROR(2)`（parser 拒否時代の契約を維持）。`--from` 未指定での復帰点決定不能は job 状態の問題なので従来どおり exit 1。
