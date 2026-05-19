# Code Review Findings — gh-cli-to-rest-api (iteration 2)

## Summary

iter 1 で指摘した critical 2 件 (retry/rate-limit middleware の unit test 不在、`verifyBranch` の 5xx silent regression) と major 3 件 (`src/cli/ps.ts` の `gh pr view` 残存、`src/core/gh/error.ts` の dead helper、`command-registry.ts` の help 文字列) はすべて修正済。`github-client-request.test.ts` (301 行) が新設され TC-RC-001..008 を網羅、`request()` は 5xx 枯渇時に `githubApiError` を throw する仕様に変更され caller 全体で挙動が揃った。

残課題は次の通り:

1. **must テスト 5 件 (TC-FM-001..005) の直接検証が依然不在** — 既存テストは `getPullRequest` の戻り値を mock し直接 internal 形式を返しているため、`mergeable_state` / `merged_at` / `head.ref` といった REST API field から internal 形式への mapping が GitHubApiClient 境界では 1 度も実測されていない。`mapPrState` / `mapMergeable` も unit test の網にかかっていない。
2. **must テスト 3 件 (TC-PM-002 / TC-PM-003 / could TC-PM-006) も同様** — `mergePullRequest` の 403 / 405 / 409 → `{ merged: false }` 分岐に対する直接 unit test が存在しない (全 mock が `merged: true` のみ)。
3. **iter 1 で minor 指摘された stale comment / dead config がそのまま** — `preflight.ts` 冒頭ブロック、`orchestrator.ts:549` の `admin-flag: yes (via admin token)` 表記、`force` flag の MergePhase3Params 上での未使用、`src/core/preflight.ts:97` の "gh CLI" 言及、`pr-create.ts:5` の "spawn gh CLI" 言及、`resolve-target.ts:7` の "gh pr view" 言及。
4. **pr-create step が `owner: ""` / `repo: ""` を fallback として渡せる** — `StepDeps` で optional のため、CI route で実行時 silent failure (URL は `/repos//.../pulls`) になりうる。production code path では cli/run.ts 経由で必ず set されるが、guard が無いので future regression の窓口になる。

主要な production 挙動は正しく動作しており typecheck/test も green。critical 級の問題は残っていないが、test-cases.md must スコープの数件が依然 unverified である点と、iter 1 minor の cleanup が放置されている点を需要に応じて記録する。

## Findings

### F-001: TC-FM-001..005 (must) の field mapping unit test が直接実施されていない
- **severity**: major
- **file**: `tests/unit/adapter/github/` (期待: `github-client-pr.test.ts` または同等で `getPullRequest` の REST→internal mapping を実測する unit test)
- **description**: test-cases.md の TC-FM-001 (`mergeable_state: "clean"` → `mergeStateStatus: "CLEAN"`), TC-FM-002 (`blocked` → `BLOCKED`), TC-FM-003 (`merged: true` → `state: "MERGED"`), TC-FM-004 (`state: "open"` → `state: "OPEN"`), TC-FM-005 (`mergeable: null` → `mergeable: "UNKNOWN"`) はすべて must 優先度だが、GitHubApiClient の `getPullRequest()` に raw REST レスポンス (`mergeable_state` / `merged_at` / `head.ref` / `mergeable: boolean | null` 形) を流し込んで実際の mapping を verify する unit test が存在しない。既存の `tests/unit/core/finish/preflight.test.ts` 等は `getPullRequest` を mock 化し、すでに internal 形式 (`mergeStateStatus: "CLEAN"`) を返す形にしているため、`mapPrState` / `mapMergeable` 関数および `data.mergeable_state.toUpperCase()` の分岐は一度も走らない。grep で `mergeable_state` / `merged_at` の文字列はテストコードに 0 件。`bun run test` は green になるが iter 1 で `Risk 1` として記録された "`null` を `"UNKNOWN"` に mapping する" の整合性が壊れても検知できない。
- **suggestion**: `tests/unit/adapter/github/github-client-pr.test.ts` を新設し、fetch mock が raw REST response を返した場合に GitHubApiClient.getPullRequest() の戻り値が internal 形式に変換されることを 5 ケース最低限 verify する。`getPullRequest("o","r",1)` を 1 回呼んで、response body に `{state:"closed", merged:true, merged_at:"2024-...", mergeable_state:"clean", mergeable:null, head:{ref:"feat/x"}}` を渡し、戻り値が `{state:"MERGED", mergeStateStatus:"CLEAN", headRefName:"feat/x", mergeable:"UNKNOWN"}` であることを 1 ケースで網羅できる。

### F-002: TC-PM-002 / TC-PM-003 (must) と TC-PM-006 (should) の merge 失敗分岐に unit test がない
- **severity**: major
- **file**: `tests/unit/adapter/github/` (期待: `github-client-pr.test.ts` で `mergePullRequest` の 403 / 405 / 409 ハンドリングを verify)
- **description**: test-cases.md の TC-PM-002 (`405 → { merged: false }`), TC-PM-003 (`403 → permission denied メッセージ`), TC-PM-006 (`409 → { merged: false }`) を直接 verify するテストが存在しない。`mergePullRequest` 呼び出しを mock しているテスト全 31 箇所はすべて `{ merged: true }` のみで、`{ merged: false }` を返すケースは 0。`src/adapter/github/github-client.ts:382-395` の 403 / 405 / 409 分岐は production 上では reachable だが unit test での coverage がない。
- **suggestion**: F-001 と同じファイルで `mergePullRequest` に対し fetch mock が 200 / 403 / 405 / 409 / 500 を返すケースを並べ、戻り値が `{ merged, message }` 形で期待通りであることを verify する (4-5 ケース)。最低限 must の 405 / 403 は必須。

### F-003: `outputDryRunPlan` の `admin-flag: yes (via admin token)` 表記が misleading のまま
- **severity**: minor
- **file**: `src/core/finish/orchestrator.ts:549`
- **description**: iter 1 で指摘した「REST API には `--admin` 等価 flag がなく admin token の暗黙 bypass で動く (D4)」という事実に対し、dry-run plan 出力は依然 `admin-flag: yes (via admin token)` と表示する。`yes` は `--admin` flag が立った旧 gh CLI 時代の文言を引きずっており、REST API では存在しない概念。ユーザに「`--admin` 相当の操作が走る」と誤解させる。
- **suggestion**: `admin-flag: implicit (REST merge uses token's admin privileges if available)` 等の説明的表現に変える、または admin-flag 行を削除して `merge-strategy: "REST API squash merge"` の 1 行で済ませる。

### F-004: `force` flag が `mergeFeaturePrPhase3` で未使用のまま
- **severity**: minor
- **file**: `src/core/finish/orchestrator.ts:202`, `:475`, `:488`
- **description**: `MergePhase3Params.force: boolean` を引数として受け取るが destructuring (line 489: `const { prNumber, githubClient, owner, repo, slug, baseBranch, sleepFn } = params;`) で `force` を抜いており実際に使われない。iter 1 で同件を指摘。REST API merge では `--admin` flag が消えたため `--force` の意味づけが実質失われており、CLI flag だけが残って behavior に影響しないゴーストになっている。
- **suggestion**: (a) `mergeFeaturePrPhase3` から `force` field を削除、CLI 側の `--force` flag は次回 release で deprecate アナウンスし削除、または (b) `force=true` の場合に `BLOCKED` でも merge を試行する分岐を明示的に書き加えて意味を回復する。今 release では (a) が無難。

### F-005: pr-create step が `owner: ""` / `repo: ""` を fallback として渡す
- **severity**: minor
- **file**: `src/core/step/pr-create.ts:45-46`
- **description**: `StepDeps` は `owner?: string` / `repo?: string` (optional) なので、step が `runPrCreate` を呼ぶ際 `deps.owner ?? ""` / `deps.repo ?? ""` でフォールバックしている。production の `cli/run.ts` → `LocalRuntime.buildDeps` 経路では常に非空文字列が入るので現状壊れていないが、empty string が渡ると GitHub API URL が `https://api.github.com/repos//.../pulls` となり 404 (`Not Found`) で silent failure し、`buildFailureMessage` の hint に流れる。`if (!deps.githubClient) throw` の隣に `if (!deps.owner || !deps.repo) throw` を足せば、future regression の早期検知になる。
- **suggestion**: `pr-create.ts:35` の `githubClient` ガードに合わせて `owner` / `repo` の必須チェックを足す。あるいは `StepDeps` の `owner` / `repo` を必須に変える (pr-create を呼ぶ context は常に PR step なので妥当)。

### F-006: 各 module 冒頭の責務 docstring が REST 化前のまま (iter 1 minor の積み残し)
- **severity**: minor
- **file**: 複数
  - `src/core/finish/preflight.ts:10`: `3. gh pr view success + state` → `getPullRequest success + state`
  - `src/core/finish/preflight.ts:13`: `6. gh / git binaries available` → `6. git binary available`
  - `src/core/finish/preflight.ts:17`: `TC-105: gh pr view auth failure → escalation` → `getPullRequest auth failure`
  - `src/core/finish/preflight.ts:21`: `TC-121: gh binary missing → escalation` (TC-121 は test 側で git missing にリライト済)
  - `src/core/finish/preflight.ts:78` (comment): `(git only — gh CLI is no longer required)` は OK だが、ファイル冒頭ブロックの説明と整合させる
  - `src/core/finish/orchestrator.ts:5`: `Destructive ops: git commit / git push / gh pr merge` — `gh pr merge` を `REST API merge` に
  - `src/core/finish/types.ts:7`: `Data returned from gh pr view for the feature PR.` → `Data returned from getPullRequest for the feature PR.`
  - `src/core/preflight.ts:97`: `// Step 2.5: GitHub token (both runtimes require it for PR creation / gh CLI)` → `// Step 2.5: GitHub token (required for PR operations via REST API)`
  - `src/core/finish/resolve-target.ts:7`: `TC-109: --pr <num> → gh pr view → headRefName → ...` → `getPullRequest → headRefName`
  - `src/core/step/pr-create.ts:5`: `Calls runPrCreate() to spawn gh CLI` → `Calls runPrCreate() to call GitHub REST API`
- **description**: REST API 化が完了しているがコード comment が gh CLI 時代のまま。読者が file を初めて読んだ際に「gh CLI を呼んでいる」と誤解する。
- **suggestion**: 各 file の冒頭 docstring と inline comment を REST API ベースの表現に書き換える。動作には影響しないため低優先度。

### F-007: `mergePullRequest` の 200 path で `resp.json()` が空 body 時に throw する可能性 (iter 1 minor の再掲)
- **severity**: minor
- **file**: `src/adapter/github/github-client.ts:378`
- **description**: 200 時に `const data = (await resp.json()) as { message?: string };` を呼ぶ。GitHub の merge endpoint は規約上 `{ sha, merged, message }` を返すので実用上は壊れないが、test mock や proxy 経由で空 body / malformed JSON を受けると unhandled exception になり caller の `try { mergeResult = await ... } catch (err) { ... }` に飛んでしまう (= 「merge は成功したのに escalation が出る」見かけ上の regression)。
- **suggestion**: 一行で defensive にする: `const data = (await resp.json().catch(() => ({}))) as { message?: string };` (line 390 と同パターン)。

### F-008: `request()` の header 型キャストが緩い (iter 1 minor の再掲)
- **severity**: minor
- **file**: `src/adapter/github/github-client.ts:55`
- **description**: `const callerHeaders = (init.headers ?? {}) as Record<string, string>;` で `init.headers` を強制キャストしている。`RequestInit.headers` の正規型は `HeadersInit (= Headers | Record<string, string> | [string, string][])`。callers が plain object 以外を渡すと spread が想定通り動かない。現在 caller は内部のみで plain object が確実だが、`@anthropic-ai/claude-agent-sdk` 越しに渡る将来の経路 (もしくは middleware 拡張) で破壊される可能性。
- **suggestion**: `new Headers()` ベースに統一する、もしくは `request()` の `init.headers` 引数の型を `Record<string, string>` に絞ったローカル `init` 型に変える。

## Test Coverage

### MUST scenarios (test-cases.md)

#### REST_CLIENT (8/8 covered by new file `github-client-request.test.ts`)
- [x] TC-RC-001: X-GitHub-Api-Version header
- [x] TC-RC-002: Authorization: token header
- [x] TC-RC-003: 401 → throw, no retry
- [x] TC-RC-004: 429 → Retry-After wait + retry
- [x] TC-RC-005: Retry-After 60s cap
- [x] TC-RC-006: X-RateLimit-Remaining=0 → reset wait
- [x] TC-RC-007: 5xx exponential backoff 3 retry
- [x] TC-RC-008: 5xx exhausted → throw

#### FIELD_MAPPING (0/5 must directly verified; F-001)
- [ ] TC-FM-001: mergeable_state: "clean" → "CLEAN"
- [ ] TC-FM-002: mergeable_state: "blocked" → "BLOCKED"
- [ ] TC-FM-003: merged: true → "MERGED"
- [ ] TC-FM-004: state: "open" → "OPEN"
- [ ] TC-FM-005: mergeable: null → "UNKNOWN"

#### PR_CREATE (3/3 must covered)
- [x] TC-PC-001: REST 経由で PR 作成 (TC-002)
- [x] TC-PC-002: 既存 OPEN PR → existing URL (TC-001)
- [x] TC-PC-003: PrCreateInput に githubToken なし (typecheck)

#### PR_STATUS (3/3 must covered)
- [x] TC-PS-001: fetchPrViewWithRetry が getPullRequest 使用 (preflight.test.ts)
- [x] TC-PS-002: mergeable UNKNOWN retry (finish-orchestrator.test.ts)
- [x] TC-PS-003: BLOCKED 検出 (DIRTY 経由)

#### PR_MERGE (1/4 must directly verified; F-002)
- [x] TC-PM-001: squash merge 成功 (TC-FIN-BD-001)
- [ ] TC-PM-002: 405 → { merged: false } (直接テストなし)
- [ ] TC-PM-003: 403 → permission denied メッセージ (直接テストなし)
- [x] TC-PM-004: 保護されていないブランチで merge 成功 (TC-PM-001 で間接的に担保)

#### RESOLVE_TARGET (2/2 must covered)
- [x] TC-RT-001: PR 番号 → head branch 解決 (TC-109)
- [x] TC-RT-002: error message に gh 言及なし (resolve-target.ts:121)

#### PREFLIGHT (2/2 must covered)
- [x] TC-PF-001: checkBinaries が ["git"] のみ (TC-121)
- [x] TC-PF-002: PreflightInput に githubClient/owner/repo (typecheck)

#### DOCTOR (1/1 must covered)
- [x] TC-DC-001: gh-cli.ts ファイル削除 (filesystem 確認済)

#### REGRESSION (3/3 must covered)
- [x] TC-RG-001: finish-orchestrator.test.ts green
- [x] TC-RG-002: pr-create/runner.test.ts green
- [x] TC-RG-003: adversarial/resolve-target green
- [x] TC-RG-005: production code に gh 残存なし (`src/cli/ps.ts` の `gh pr view` も REST 化済を確認)

#### INTEGRATION (1/2 must covered)
- [x] TC-IT-001: gh なしで finish 完走 (orchestrator テストで間接担保)
- [x] TC-IT-002: CLI entry point で owner/repo 解決 (finish.ts:97-105 + integration test)

### Must coverage summary
- Total must: 33
- Direct coverage: 25
- Missing direct verification: 8 (TC-FM-001..005 + TC-PM-002 + TC-PM-003 + INTEGRATION の 1 件は間接担保のみ)

## Verdict

- **verdict**: needs-fix

理由:
- iter 1 で指摘した critical 2 件 + major 3 件は完全に解消されており、production 挙動の血流は正しい。
- 残課題は (1) must テスト 7 件の直接 verification 不足 (F-001 + F-002) と (2) iter 1 minor の cleanup 積み残し (F-003〜F-008) の 2 ジャンル。critical/重大な behavior bug は無い。
- 一見 `approved` でも構わないが、test-cases.md の must スコープを「直接 verify されていない」状態で merge すると、将来 `mapPrState` / `mapMergeable` / `mergePullRequest` の 403/405 分岐に regression が入った時に検知できない。test-cases.md は仕様の一部であり must は契約と同義なので、`needs-fix` (F-001 + F-002 だけでも対応) を推奨する。
- F-003 ～ F-008 は minor で blocking ではない。F-001 + F-002 を片付けるタイミングでまとめて cleanup できれば望ましいが必須ではない。

優先度: **F-001 → F-002** (must coverage) を最優先で対応。F-003 ～ F-008 は同 PR で序でに直すか別 issue 切り出しでも可。
