# `job archive --with-merge` の `none`（check 未出現）早期マージを grace 待しで塞ぐ

## Meta

- **type**: spec-change
- **slug**: with-merge-none-grace
- **base-branch**: main
- **adr**: false

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

## 背景

`job archive --with-merge`（`src/core/archive/merge-then-archive.ts`）の wait ループは、check rollup が `none`（head commit に check run / combined status が一つも無い）の時、その場で merge へ進む（`rollup.state === "success" || rollup.state === "none"` → ループ break → merge）。

これは2つの状況を区別していない:

- **CI が無い repo**（恒久的に `none`）→ merge は正しい。
- **push / force-push 直後で CI の check がまだ作成されていない**（一時的に `none`）→ CI 開始前に early-merge してしまう。

rebase-finish は `git push --force-with-lease` 直後に `--with-merge` を呼ぶため、後者の窓を踏む。CI ありの repo でも、この一瞬だけ「green まで待つ」が機能せず CI 開始前に merge されうる。本 repo は private + 非 Team account のため branch protection を強制できず、GitHub 側で塞げない。tool 側で塞ぐ必要がある。

## 要件

### 1. 初回 `none` を即 merge せず grace 待しする

rollup が `none` の時、その場で merge へ進まない。grace 期間内は poll interval ごとに再取得し、check の出現を待つ。

- grace 内に check が出現（state が `pending` / `failure` / `success` になる）→ 既存の wait ループ判定に従う（pending→待つ / failure→escalation / success→merge）。
- grace 期間を超えても `none` のまま → CI が無い repo と判断して merge へ進む。

### 2. grace を有限・bounded にし、main の wait timeout と独立させる

grace は「初回 check 出現」を待つためのもので、**main の wait timeout（`mergeWaitTimeoutMs`、`null` = 無制限を含む）とは別**に bounded にする。

- これにより、CI が無い repo で `mergeWaitTimeoutMs: null`（無制限）を設定していても、grace 経過後に merge され、**永久 hang しない**。
- grace の長さは **60 秒の固定ハードコードデフォルト**とする（CI の check 作成に十分）。**不変のハードコード定数とし、config 化はしない**（過剰なため）。

## スコープ外

- 待つ check の subset / allowlist 選択（全 check 待ちのまま。本 repo は PR check が `ci` 1個で問題にならず YAGNI）。
- `pending` / `failure` / `success` / `DIRTY` / `BLOCKED` の既存挙動。
- archive 本体（`src/core/archive/orchestrator.ts`、client-closed）。

## 受け入れ基準

- [ ] 初回 `none` で即 merge せず、grace 期間 check の出現を待つ
- [ ] grace 内に check が出現したら既存の wait ループ判定（pending→待つ / failure→escalation / success→merge）に合流する
- [ ] grace 経過後も `none` なら merge へ進む（CI 無し repo）
- [ ] grace は `mergeWaitTimeoutMs: null`（無制限）設定でも bounded で、CI 無し repo が永久 hang しない
- [ ] 変更は `merge-then-archive.ts` に閉じ、archive 本体（`orchestrator.ts`）は GitHubClient(port) 非依存（client-closed）を維持する
- [ ] grace 挙動（要件1・2：初回 none の grace 待し・check 出現での合流・grace 経過後の merge・無制限 timeout でも bounded）をカバーする unit test が追加されている（`sleepFn` / `nowFn` injectable で時間経過を制御）
- [ ] `bun run typecheck && bun run test` が green
