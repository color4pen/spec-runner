# ADR-20260602: GitHub host を adapter-contained にし port を host 非依存に保つ／構造 ADR の置き場を新設

## ステータス

accepted（B-10 は歯を足すまで提案）

## コンテキスト

spec-runner は GitHub.com + 作者個人の OAuth app に強く結合している（`api.github.com` 直書き 9 箇所、`GITHUB_CLIENT_ID` baked-in、`GitHubClient` port が唯一の VCS seam）。この結合を「どこで・どの粒度で」外すかの構造判断。

## 決定

### D1: GitHub host / baseURL を adapter-contained にする（port 不変・別 provider port を作らない）

host / baseURL は composition-root が config から adapter に注入する（`createGitHubClient` 引数）。`GitHubClient` port は host を露出せず不変。host 変更の影響は adapter + comp-root 配線に閉じる（B-2 の延長 ＝ 外部 endpoint host も adapter に封じ込め）。multi-provider の別 port は作らない（実装 1 つの port は `model.md` §1「未使用 port を入れない」に反する。port 境界は既にあり、実需が出た時に generalize）。

### D2: host↔token 束縛を不変条件として導入（B-10 提案）

token は紐づく host にしか送らない（github.com 用 token を別 host へ漏らさない）。B-6（subprocess へ秘密を渡す入口の集約）とは別系統の credential 封じ込め（B-6 = 入口 / B-10 = 送信先 host の取り違え防止）。歯（`core-invariants.test.ts`）を足すと同時に `model.md` §4 へ昇格する。

### D3: credential 解決 seam に subprocess 委譲と host 引数を許容

token 解決（`core/credentials`、domain）が外部 CLI への subprocess 委譲と target host を持てる。subprocess の env は B-6 seam（`util/env-filter` の `stripSecrets` 経由 spawn）、取得 token の出力は B-7 seam（`logger` の `maskSensitive`）を通す。resolver は spawn 依存 + host 引数を持つ（判定系 B-5 でなく I/O 系）。

### D4（governance）: 構造 ADR の置き場を `architecture/adr/`（out-of-loop）に新設

構造判断の ADR を `architecture/adr/` に置く（pipeline が構造の根拠を自己書換えできないよう、architecture/ 全体と同じ out-of-loop）。`/architecture/` は CODEOWNERS で覆われる。書き方は README。

## 構造的含意

- 新 port 不要。`GitHubClient` port 不変。層をまたぐ新 edge を生まない。
- 影響層: `adapter/github` + `auth/`（adapters）/ `config`（shared-kernel）/ `core/credentials`・`core/doctor`（domain）。
- B-6 の call-site が 1 つ増、出力は B-7 経由、B-10 を §4 へ昇格。§3 closure / B-1〜B-9 は不変。

## 検討した代替案

- multi-provider の別 port を今作る — 却下（未使用 port、trust model が GitHub 形で provider ごと再設計、実需不在）。
- B-10 を歯なしで §4 に追記 — 却下（歯と同時昇格）。
- host を port interface に露出 — 却下（port が host 概念で汚染、B-2 が緩む）。

## 結果

- **Positive**: host 変更の blast radius が adapter + comp-root に閉じ、GHES 等へ port 不変で向けられる。credential 封じ込めが B-6（入口）+ B-10（送信先）で対称化。構造 ADR が out-of-loop 化。
- **Negative**: `config` に host 設定追加、`core/credentials` / `doctor` に host 配線。resolver に seam 1 つ増。

## References

- gh manual — environment: https://cli.github.com/manual/gh_help_environment
- 関連 ruling: `finish-respect-branch-protection`
