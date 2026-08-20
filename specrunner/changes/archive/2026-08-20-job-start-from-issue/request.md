# job start --from-issue: issue を request source として直接起動する CLI 契約

## Meta

- **type**: new-feature
- **slug**: job-start-from-issue
- **base-branch**: main
- **adr**: true

## 背景

issue 本文を request.md として実行する経路は現在 inbox（承認ラベル自動発火)しかない。CI 環境（GitHub Actions の workflow_dispatch 等）や手元から「この issue を今すぐ 1 本走らせる」には、呼び出し側が issue 取得 → slug 抽出 → draft 実体化 → `job start --issue <n>` を自前で組む必要があり、2 つの問題がある:

1. **fidelity comparator の空回り**: issue 本文を byte 同一で draft に転記しても、`--issue` だけでは issue-verbatim origin が立たず、issue fidelity gate が LLM comparator を実行する。同一文書同士の照合であり無意味なコスト。inbox は同じ理由で skip する仕組みを既に持っている。
2. **spec-runner 内部知識の漏出**: slug の抽出（Meta 行の parse）や draft の配置規約を呼び出し側スクリプトが知る必要があり、CLI の入力契約として閉じていない。

さらに CI 発火では、実行元 checkout の branch（Actions の Branch dropdown）と request の `base-branch` が独立に選べてしまい、「develop の CLI コードで main 基点の実装が走る」型の黙った食い違いが作れる。

issue 取得 → draft 実体化 → issue linkage → fidelity skip を spec-runner 自身の責務として `job start --from-issue <n>` に閉じ、呼び出し側（CI workflow / 手元）を「issue 番号を渡すだけ」にする。

## 現状コードの前提

- `src/cli/run.ts:45` — `runRunCore` は `issue?: number` と `inboxOrigin?: boolean` を options に持つが、CLI surface に露出しているのは `job start ... --issue <number>` のみ（`src/cli/command-registry.ts:835`）。`inboxOrigin` を立てる公開 flag は存在しない。
- `src/core/command/pipeline-run.ts:167-170` — `inboxOrigin === true` のとき `jobState.inboxOrigin = true` を設定。コメントでこの flag の意味は「issue body == request.md（転記乖離が存在しない）」と定義されている。
- `src/core/gate/issue-fidelity-gate.ts:106` — `inboxOrigin === true` なら fidelity comparator を skip し、skip ログを出して進む。
- `src/core/inbox/run-inbox.ts:397-400` — inbox の startJob effect は `writeDraft(repoRoot, slug, issueBody)` → `runRunCore(draftPath, { cwd, issue, inboxOrigin: true })` の 2 段。slug は issue 本文を request として parse した結果から得る（`src/core/inbox/planner.ts:134-137`）。
- `src/core/inbox/draft-writer.ts` — `writeDraft` は `src/core/request/store.js` の `write()` に委譲し、`specrunner/drafts/<slug>/request.md`（directory 形式）に書く。
- `src/core/runtime/local.ts:478-479` — job worktree は `origin/<baseBranch>` から作られる。実行元 checkout の HEAD branch は実装基点として使われず、request の `base-branch` と食い違っていても検出されない。
- `src/cli/inbox.ts:44-69` — CLI 層に GitHub token 解決（`resolveGitHubToken`）・origin 解決（`getOriginInfo`）・client 生成（`createGitHubClient`）の組み立てが既にあり、issue 取得に必要な部品は揃っている。

## 要求

### 1. `job start --from-issue <n>`

issue 番号を受け取り、以下を CLI の責務として一括実行する:

1. GitHub API で issue 本文を取得する（token / origin 解決は既存の CLI 層の組み立てと同じ経路）
2. 本文を request として parse し、slug を得る。parse 失敗（Meta 不備・slug 不正等）は副作用ゼロで明確なエラー終了
3. draft を実体化する（既存の inbox と同じ書き込み経路）
4. 通常の start を実行する。issue linkage（`--issue <n>` 相当）と issue-verbatim origin（fidelity comparator skip）を自動で立てる

### 2. inbox との経路統合

issue 本文 → draft 実体化 → start の連鎖を単一の core 関数に持ち、inbox の startJob effect と `--from-issue` の両方がそれを呼ぶ。同じ方針の実装を 2 箇所に置かない。統合は挙動保存の refactoring であり、inbox の既存テスト期待を書き換えないこと。

### 3. base-branch guard（--from-issue 時のみ）

`--from-issue` 起動時、実行元 checkout（repoRoot）の現在 branch が request の `base-branch` と不一致なら、job state 作成前に fail-closed で停止する。エラー文言は両方の値を明示する（例: `current branch "develop" does not match request base-branch "main"`）。detached HEAD も不一致として扱う。既存の起動経路（positional file/slug、inbox）の挙動は変えない。

### 4. flag の排他と直交

- `--from-issue` と positional `<file|slug>` の同時指定は usage エラー
- `--from-issue` と `--issue` の同時指定は usage エラー（from-issue が linkage を内包するため）
- `--detach` とは併用可能（通常の detach 契約がそのまま成立する）

### 5. state field の再利用

issue-verbatim origin の表現は既存の `jobState.inboxOrigin`（`src/state/schema/types.ts:476`）を再利用する。schema 変更・field rename はしない。

### 6. ヘルプ・guide の追随

`job start` の usage テキストと、CLI 組み込み guide の該当 topic（jobs / inbox のうち該当箇所）に `--from-issue` の契約（fidelity skip・base-branch guard・排他）を反映する。

## 受け入れ基準

- [ ] `--from-issue` 起動の job は issue fidelity gate で comparator が実行されない（skip 経路のテストで pin する）
- [ ] base-branch 不一致で: job state が作成されない・draft が残留しない・非ゼロ exit・両値を含むエラー文言（テストで pin する）
- [ ] 排他 usage エラー 2 系（positional 併用 / --issue 併用）がテストで pin される
- [ ] issue 本文の request parse 失敗時、draft・job state とも副作用ゼロでエラー終了する（テストで pin する）
- [ ] slug 占有時は既存の SlugOccupiedError 経路に乗る
- [ ] inbox の既存テストが無改変で green（経路統合が挙動保存であることの証拠）
- [ ] `bun run typecheck` / `bun run test` green

## スコープ外

- `.github/workflows/` の変更（別 PR #1014 で対応する）
- `inboxOrigin` field の rename・schema 変更
- inbox（schedule / ラベル自動化）の ephemeral runner 冪等性対応
- docs/operations.md の GitHub Actions 節の記述修正
- 既存起動経路（positional / inbox）への base-branch guard の適用
