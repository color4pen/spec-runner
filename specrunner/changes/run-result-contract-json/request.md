# run / resume の終端結果を機械可読な --json 契約で出す

## Meta

- **type**: new-feature
- **slug**: run-result-contract-json
- **base-branch**: main
- **adr**: true

## 背景

`run` / `resume` の終端は今、3つの意味の違う結末が exit code に潰れている（`src/core/command/runner.ts` の `handleResult`）:

- `awaiting-archive`（PR を生成して正常終了）→ exit 0
- `awaiting-resume`（escalation・loop 枯渇・crash・signal 中断＝**人を待つ／再実行すべき**が混在）→ exit 1
- `failed` → exit 1

結果（PR URL・verdict・次アクション）は人間向け文字列で stderr/stdout に出るだけで、**機械可読な契約が無い**（`run`/`resume` に `--json` が無い。`doctor`/`request review` は既に `--json` を持つ）。

このため、CI など無人でこの CLI を起動する側が「PR ができたのか / 人の判断を待っているのか / 恒久的に失敗したのか」を **exit code だけでは区別できず**、stderr を grep するしかない。spec-runner は「PR を供給する非同期ジョブ」であり、起動側が終端を機械可読に判別できることが CI 連携の前提になる。

## 要件

1. `run` / `job start`（canonical）/ `resume` に `--json` フラグを追加し、終端結果を構造化 JSON で stdout に出力する。`run` は `job start` の alias だが command registry 上は別エントリで flags を独立定義するため、両エントリに `--json` を追加する。
2. JSON は終端の種別を機械可読に表す。最低限の種別: `pr-created`（PR 生成・正常終了）/ `awaiting-human`（人の判断待ち＝escalation・loop 枯渇）/ `failed`（恒久失敗・crash 含む）。
3. JSON に終端判定に必要な最小情報を含める: 種別、PR URL（あれば）、slug / jobId、停止時の step、停止事由（あれば）。
4. exit code は現行の 0 / 1 / 2 を変えない（JSON field で種別を表す。既存の `EXIT_CODE` 契約・`run || exit 1` 前提の呼び出しを壊さない）。
5. `--json` 未指定時の人間向け出力（現行の文字列）は不変。

## スコープ外

- exit code の多値化（種別は JSON field で表し、exit code は据え置く）。
- `awaiting-resume` の内部表現（discriminated union 化等）の再設計。終端の**出力契約**のみを対象とし、state スキーマは変えない。
- `job ls` / `job show` の `--json`（本 request は run/resume の終端契約に限定）。
- CI / GitHub Actions 側のワークフロー定義（本契約を消費する側は別 request `ci-async-job`）。

## 受け入れ基準

- [ ] `run --json` / `job start --json` / `resume --json` が終端で構造化 JSON を stdout に出す（alias・canonical の両 registry エントリに flag が定義される）。
- [ ] JSON の種別が `pr-created` / `awaiting-human` / `failed` を区別する（escalation・loop 枯渇は `awaiting-human`、crash・恒久失敗は `failed`）。
- [ ] JSON に PR URL（あれば）・slug・jobId・停止 step・停止事由が含まれる。
- [ ] exit code が現行（0 / 1 / 2）と変わらない。
- [ ] `--json` 未指定時の人間向け出力が不変。
- [ ] `bun run typecheck && bun run test` が green。

## architect 評価済みの設計判断

- **終端契約は exit code でなく stdout JSON で表す**。exit code を増やすと `EXIT_CODE`（`src/errors.ts`）の既存契約と `run || exit 1` 前提の呼び出しが壊れる。`doctor` / `request review` が既に持つ `--json` パターンの一貫適用とし、新しい抽象は導入しない。
- **終端→出力の写像点は `handleResult`（`src/core/command/runner.ts`）に集約する**。現在ここが status（`awaiting-archive` / `awaiting-resume` / `failed`）→ exit code を決めているので、同じ1点で JSON 種別も決める。写像を散らさない。
- **種別の対応付け**: `awaiting-archive`→`pr-created`、`awaiting-resume` のうち escalation / loop 枯渇→`awaiting-human`、crash / signal / 恒久 `failed`→`failed`。`awaiting-resume` に潰れている事由の区別は、停止事由（`resumePoint` / `error`）から導出する（state スキーマは変えない＝出力時の分類に留める）。
- run/resume は `process.exit(code)` で終わる one-shot。JSON は exit 前に stdout へ最終出力する（人間向け progress は stderr、機械向け結果は stdout、の分離を保つ）。
- `--json` フラグは `run`（alias）と `job start`（canonical）の両 registry エントリの flags に定義する（両者は別エントリだが `runRun` を共有するため、出力処理自体は共有経路で1回実装する）。
- 本 request は state を変えず終端の出力契約のみ追加するため、`awaiting-resume` の多重定義の解消（`resume-simplify`）とは独立に進められる。
- 本変更は層・依存方向・不変条件を変えない（composition-root の出力整形の追加）。architecture authority の先行変更は要さない。
