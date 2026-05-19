# Review Feedback — gh-cli-to-rest-api (iteration 1)

## Summary

実装は全体として丁寧で、design.md の D1-D8 を概ね忠実に実装している。型シグネチャ、field mapping、retry middleware の構造は正しく、orchestrator/preflight/pr-status は REST 化されており、テスト 2215 件が green。一方で **T-11d (retry/rate-limit の unit test 新設) が事実上未実施で、429 / Retry-After / X-RateLimit-Reset / X-GitHub-Api-Version / 5xx exponential backoff の挙動はテストで検証されていない**。さらに `verifyBranch` が 5xx exhaustion 時に silently `true` を返す behavioral regression、`src/core/gh/error.ts` の dead helper 残存、`src/cli/ps.ts` の `gh pr view` subprocess 残存など、scope の取りこぼしが複数ある。

## Findings

### [critical] T-11d / TC-RC-001..008 retry/rate-limit middleware に対する unit test が存在しない
- **file**: `tests/unit/adapter/github/` (期待: `github-client.test.ts` または同等ファイルが新設されるはずだった)
- **issue**: tasks.md T-11d は `[x]` でチェック済みだが、実際には `Retry-After`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `X-GitHub-Api-Version`, `API_VERSION = "2022-11-28"`, 429, exponential backoff のいずれにもアサーションするテストファイルが存在しない (`grep` で 0 件)。`tests/unit/adapter/github/` には `get-raw-file.test.ts` / `get-ref-sha.test.ts` / `verify-path.test.ts` の 3 ファイルのみで、これらは `mockHeaders.get` を一律 `null` にしており、新しい retry/rate-limit ロジックの分岐を踏まない。
- **影響範囲**: test-cases.md の TC-RC-001 (X-GitHub-Api-Version header), TC-RC-002 (Authorization header), TC-RC-003 (401 no retry), TC-RC-004 (429 Retry-After), TC-RC-005 (Retry-After 60s cap), TC-RC-006 (X-RateLimit-Reset wait), TC-RC-007 (5xx exponential backoff success), TC-RC-008 (retry exhausted) のすべての must が unverified。TC-RC-002 の `Authorization: token ${token}` フォーマットも、コード上は `Authorization: token ghp_...` でハードコードされており fetch mock の引数アサーションが無い。
- **suggestion**: `tests/unit/adapter/github/github-client-request.test.ts` を新規作成し、最低限 TC-RC-001..008 を fetch mock + sleepFn 注入で検証する。`mockFetch.mock.calls[i][1].headers` を直接覗いて X-GitHub-Api-Version / Authorization を確認すること。

### [critical] `verifyBranch` が 5xx retry exhaustion で `true` を返す regression
- **file**: `src/adapter/github/github-client.ts` (line 120-125)
- **issue**: `request()` が 5xx retry を 3 回使い切ると **最後の 5xx response を return する** (line 102-104: `return response`)。`verifyBranch` はそれを `resp.status !== 404` で評価するため、503 が返ってきた場合に `true` を返す。これは「branch exists」と誤判定する severe な silent regression。tasks.md T-02b でも「既存メソッドは現在 5xx で即 throw する」と挙動変化を明示しており、本来 throw すべき。
- **suggestion**: `verifyBranch` を以下に変更する:
  ```ts
  if (resp.status === 200) return true;
  if (resp.status === 404) return false;
  throw githubApiError(resp.status, `verifyBranch(${owner}/${repo}@${branch})`);
  ```
  あるいは `request()` が 5xx exhausted 時に response を返すのではなく throw に変える設計に統一する (こちらが望ましい — `getRawFile` を除く全 caller が 5xx を error として扱っているため)。

### [major] `request()` の 5xx exhaustion 後の振る舞いが caller ごとに不揃い
- **file**: `src/adapter/github/github-client.ts` (line 100-110)
- **issue**: 5xx を 3 回 retry した後 `return response` するが、callers の取り扱いがバラバラ:
  - `verifyBranch`: 503 → `true` (バグ、上記 critical 参照)
  - `getRefSha`: 503 → `throw githubApiError` (正)
  - `verifyPath`: 503 → `throw` (正)
  - `getRawFile`: 503 → `return null` (silently swallow — 既存挙動と整合だが妥当性は微妙)
  - `listPullRequests` / `getPullRequest`: 503 → `throw` (正)
  - `createPullRequest`: 503 → `throw` (正)
  - `mergePullRequest`: 503 → `{ merged: false, message }` を返す (escalation 経由でユーザに伝わるので妥当)
- **suggestion**: `request()` 内で 5xx exhausted 時に `githubApiError` を throw する仕様に統一すれば、全 caller の `if (resp.status !== 200) throw ...` ガードがそのまま機能して挙動が揃う。caller 側で 5xx を吸収したいケースは `getRawFile` の 404 retry のようにメソッド固有 logic で wrap すればよい。

### [major] retry exhausted 時に response.body を消費する前に再 read を試みる箇所がない (副次的だが)
- **file**: `src/adapter/github/github-client.ts` (line 102-104)
- **issue**: 5xx で `return response` した response は body が未消費なので caller が `.json()` / `.text()` を呼べる、これは OK。だが retry 直前に `Retry-After` ヘッダー以外の body を一切読まずに捨てている。例えば `X-Ratelimit-Used` の secondary rate limit (`Retry-After` なしで `documentation_url` を本文に含むケース) を判別できない。
- **suggestion**: P2。現状の挙動でも GitHub の standard rate limit には対応できるので blocker ではない。issue としてメモするに留める。

### [major] TC-RC-007 が要求する「2 回目 retry の sleep が 1 回目の 2 倍程度」を満たしていない可能性
- **file**: `src/adapter/github/github-client.ts` (line 417-420)
- **issue**: `jitterDelay(attempt)` は `1000 * 2^attempt + random*500` で、`attempt=0 → ~1000-1500ms`, `attempt=1 → ~2000-2500ms`, `attempt=2 → ~4000-4500ms`。これは仕様通り。ただし initial attempt が `attempt5xx=0` で sleep されるのは「1 回目失敗後 → attempt5xx=0 sleep → 2 回目試行」になる。tasks.md と test-cases.md の想定 ("base=1s, factor=2") とは整合している。ただし `attempt5xx++` の位置が sleep 後なので、5xx で 4 回試行する (initial + 3 retry) ことになる。TC-RC-008 が「合計 4 回」を期待しており、コードは正しい。**finding 自体は false positive、確認のみ**。

### [major] `src/core/gh/error.ts` (dead helper) と `gh auth login` 言及が残存している
- **file**: `src/core/gh/error.ts` (line 1-16)
- **issue**: `buildGhFailureMessage` は本リクエストの T-03 で auth hint を `specrunner login` のみに簡素化すべき関数だが、ファイル本体には依然 `Run 'specrunner login' or 'gh auth login' to re-authenticate.` という文字列が残っている。さらに `src/core/pr-create/runner.ts` は `core/gh/error.ts` を import せず独自の `buildFailureMessage()` を local 定義しているため、`buildGhFailureMessage` は **完全に dead code**。grep で他の caller も見当たらない。
- **suggestion**: (1) `src/core/gh/error.ts` ファイルごと削除、もしくは (2) 残すなら `gh auth login` 言及を消して `pr-create/runner.ts` から本 helper を再利用するよう統一する。dead code として残るのは過去にも指摘されている (`openspec-workflow/learned-patterns.md` line 1014)。

### [major] `src/cli/ps.ts` に `gh pr view` subprocess 呼び出しが残存
- **file**: `src/cli/ps.ts` (line 96-114)
- **issue**: `checkPrMerged()` 関数が `spawnCommand("gh", ["pr", "view", ...])` を呼び出している。Design.md の Goal「`gh` バイナリの install 前提を完全に除去する」と矛盾する。tasks.md T-14 の「`gh` の文字列が src/ 配下のプロダクションコードに残っていないことを grep で確認」も passing として扱われているが、実際には `src/cli/ps.ts:104` で残っている。`checkPrMerged` は `runPs()` から呼ばれるユーザ向けコマンドで、production code path。
- **suggestion**: `runPs` が `GitHubClient` を受け取れるよう signature を変更し、`checkPrMerged(job, githubClient)` を `githubClient.getPullRequest(owner, repo, prNumber)` 呼び出しに置換する。あるいは scope outside と判断するなら、tasks.md T-14 の AC を未達として記録し follow-up を切る。

### [major] `src/cli/command-registry.ts` の help 文字列に `gh pr view` 言及
- **file**: `src/cli/command-registry.ts` (line 78, 116)
- **issue**: `--pr=<num>        Reverse-lookup slug via gh pr view <num>` と書かれている。実装は REST API に置き換わったため description が嘘になっている。ユーザが見る help message なので user-facing inconsistency。
- **suggestion**: `Reverse-lookup slug via GitHub REST API (PR <num>)` 等に書き換える。

### [minor] `src/core/preflight.ts:97` のコメントが古い
- **file**: `src/core/preflight.ts` (line 97)
- **issue**: `// Step 2.5: GitHub token (both runtimes require it for PR creation / gh CLI)` というコメント。gh CLI 言及は無効。
- **suggestion**: `// Step 2.5: GitHub token (required for PR operations via REST API)` に書き換える。

### [minor] preflight.ts の冒頭 comment ブロックで `gh pr view` `gh / git binaries` `gh binary missing` の説明が古いまま
- **file**: `src/core/finish/preflight.ts` (line 1-23)
- **issue**: ファイル冒頭の責務コメント:
  - L10: `3. gh pr view success + state           → pr-status.ts` (→ `3. getPullRequest success + state`)
  - L14: `6. gh / git binaries available` (→ `6. git binary available`)
  - L17: `TC-105: gh pr view auth failure → escalation` (→ TC-105 の本質はそのまま、表現を `getPullRequest auth failure` に更新)
  - L21: `TC-121: gh binary missing → escalation` (TC-121 は test 側で git missing に書き換わっている)
- **suggestion**: REST API ベースの記述に書き換える。読者の認知負荷を下げる cleanup。

### [minor] `orchestrator.ts` の冒頭 comment にも古い記述
- **file**: `src/core/finish/orchestrator.ts` (line 1-18)
- **issue**: 「Phase 3: REST API squash merge」は正しいが、`spawnOrEscalate({ cmd: "gh", ... })` 言及が design.md / tasks.md には残らないものの header コメントには明示されていない。`finish/types.ts:7` の `Data returned from gh pr view for the feature PR.` も古い言及。
- **suggestion**: header comment と types.ts の docstring を REST API 表現に統一。

### [minor] dry-run plan の `admin-flag` 表示が誤解を招く
- **file**: `src/core/finish/orchestrator.ts` (line 549, 559)
- **issue**: `BLOCKED` のとき `admin-flag: yes (via admin token)` と表示するが、D4 で REST API には `--admin` 等価が無く「admin token を持っていれば暗黙的に bypass」という挙動。`yes` という表示は実際の dry-run plan を見たユーザに「`--admin` 相当の操作が走る」誤解を与える。
- **suggestion**: `admin-flag: implicit (REST merge uses token's admin privileges if available)` 等の説明的表現に変える。あるいは TC-PM-007 の「`merge-strategy: "REST API squash merge"`」だけで十分なら admin-flag 行を削除する。

### [minor] FINISH_USAGE の `--force` description も古い
- **file**: `src/cli/command-registry.ts` (line 81, 119)
- **issue**: `--force           Force merge even with failing checks (uses --admin)` と書かれている。`--admin` flag は REST API では存在しないので description が嘘。
- **suggestion**: `--force           Force merge even with failing checks (relies on admin token)` 等に書き換える。

### [minor] `force` flag が orchestrator.ts でほぼ未使用
- **file**: `src/core/finish/orchestrator.ts` (line 202, MergePhase3Params.force)
- **issue**: `mergeFeaturePrPhase3()` は `force` を引数で受け取るが、destructuring から `force` を抜いており実際に使われない (line 489)。`flags.force` を CLI 側で受けて UI に出すだけのフィールドになっている。
- **suggestion**: `--force` の意味づけが REST API では実質失われるなら orchestrator/preflight から該当 field を消すか、`force=true` のときの分岐 (例えば BLOCKED でも merge を試行する) を明示する。

### [minor] `request()` の `headers` 型キャストが緩い
- **file**: `src/adapter/github/github-client.ts` (line 55)
- **issue**: `const callerHeaders = (init.headers ?? {}) as Record<string, string>;` で `init.headers` を強制キャストしている。`RequestInit.headers` は `HeadersInit (= Headers | Record<string, string> | [string, string][])` なので、`Headers` インスタンスや配列形式で渡されると spread が壊れる。実用上は内部 caller しか居ないため問題化していないが、型安全性を損ねる。
- **suggestion**: header merge を `new Headers()` ベースに統一する、もしくは callers が必ず plain object を渡す制約を comment で明示する。

### [minor] `getRawFile` の retry が `request()` の 5xx retry と二重になっている
- **file**: `src/adapter/github/github-client.ts` (line 141-167)
- **issue**: tasks.md T-02b の注記通り意図的だが、5xx エラー時に `request()` 内部で 3 回 retry した後、さらに getRawFile が 404 として `maxRetries` (default 3) 回 retry する設計。実装は意図通りだが、5xx の場合に最大 3+1=4 回の API call が `maxRetries` 回繰り返され、worst case で 12-16 回程度になる可能性がある。
- **suggestion**: 5xx の case は `return null` で fast-fail するよう explicit 分岐を追加すれば、無駄な retry を避けられる。現状でも壊れてはいないので follow-up 扱いで OK。

### [minor] `mergePullRequest` の 200 path で `resp.json()` が常に成功する前提
- **file**: `src/adapter/github/github-client.ts` (line 366-368)
- **issue**: 200 時に `resp.json()` を呼ぶが、空 body / malformed JSON 時の error handling が無い。GitHub の merge endpoint は 200 で `{ sha, merged, message }` を返すのが仕様なので実用上は問題ないが、defensive coding として `.catch(() => ({}))` があったほうがよい。
- **suggestion**: `const data = (await resp.json().catch(() => ({}))) as { message?: string };` に変える。critical ではない。

### [nit] tasks.md の `[x]` 表示が実装と乖離
- **file**: `specrunner/changes/gh-cli-to-rest-api/tasks.md` (T-11d, T-14)
- **issue**: T-11d / T-14 が `[x]` でチェックされているが、上記 critical のとおり実装/テストが不足している。verification result も「passed」だが test 2215 件は既存テストが通っているだけで新規 TC-RC-001..008 を verify していない。
- **suggestion**: implementer が完了報告する前に test-cases.md の must を 1 件 1 件 grep でチェックするべき。今後のプロセス改善メモ。

## Test Coverage

### MUST scenarios (test-cases.md)

#### REST_CLIENT
- [ ] TC-RC-001: 全リクエストに `X-GitHub-Api-Version` ヘッダー (未実装)
- [ ] TC-RC-002: `Authorization: token` ヘッダー (未実装)
- [ ] TC-RC-003: 401 → 即 throw、retry なし (未実装)
- [ ] TC-RC-004: 429 → Retry-After 秒 wait (未実装)
- [ ] TC-RC-005: Retry-After 60 秒 cap (未実装)
- [ ] TC-RC-006: X-RateLimit-Remaining 0 → reset wait (未実装)
- [ ] TC-RC-007: 5xx exponential backoff 3 retry (未実装)
- [ ] TC-RC-008: 3 retry exhausted → throw (未実装)

#### FIELD_MAPPING
- [ ] TC-FM-001: mergeable_state: "clean" → "CLEAN" (直接テストなし、TC-PS 系で間接的に通過)
- [ ] TC-FM-002: mergeable_state: "blocked" → "BLOCKED" (直接テストなし)
- [ ] TC-FM-003: merged:true → "MERGED" (直接テストなし)
- [ ] TC-FM-004: state:"open" → "OPEN" (直接テストなし)
- [ ] TC-FM-005: mergeable:null → "UNKNOWN" (直接テストなし)

#### PR_CREATE
- [x] TC-PC-001: REST 経由で PR 作成 (TC-002 in pr-create/runner.test.ts)
- [x] TC-PC-002: 既存 OPEN PR → existing URL (TC-001 in pr-create/runner.test.ts)
- [x] TC-PC-003: PrCreateInput に githubToken なし (typecheck で担保)

#### PR_STATUS
- [x] TC-PS-001: fetchPrViewWithRetry が getPullRequest 使用 (preflight.test.ts)
- [x] TC-PS-002: mergeable UNKNOWN 時 retry (TC-CONFLICT-003 in finish-orchestrator.test.ts)
- [x] TC-PS-003: pollMergeStateAfterPush BLOCKED 検出 (TC-DIRTY-001 で DIRTY 経由検証、BLOCKED は要追加)

#### PR_MERGE
- [x] TC-PM-001: squash merge が REST 経由 (TC-FIN-BD-001 in finish-orchestrator.test.ts)
- [ ] TC-PM-002: 405 → { merged: false } (直接テストなし)
- [ ] TC-PM-003: 403 → permission denied message (直接テストなし)
- [ ] TC-PM-004: 保護されていないブランチで merge 成功 (整合的に動作、明示テストなし)

#### RESOLVE_TARGET
- [x] TC-RT-001: PR 番号 → head branch 解決 (TC-109 in finish-resolve-target.test.ts)
- [x] TC-RT-002: error message に gh 言及なし (resolve-target.ts line 121 で "specrunner login" 言及済、テストでは明示検証なし)

#### PREFLIGHT
- [x] TC-PF-001: checkBinaries が ["git"] のみ (TC-121 で git missing が verify される)
- [x] TC-PF-002: PreflightInput に githubClient/owner/repo (typecheck で担保)

#### DOCTOR
- [x] TC-DC-001: gh-cli.ts ファイル削除 (ファイルシステム確認済)

#### REGRESSION
- [x] TC-RG-001: finish-orchestrator.test.ts green
- [x] TC-RG-002: pr-create/runner.test.ts green
- [x] TC-RG-003: adversarial/resolve-target green
- [ ] TC-RG-005: production code に gh 文字列残存なし — `src/cli/ps.ts:104` に残存 (上記 finding 参照)

#### INTEGRATION
- [ ] TC-IT-001: gh なしで finish 完走 (専用テストなし、orchestrator テストで間接担保)
- [ ] TC-IT-002: CLI entry point で owner/repo 解決 (finish.ts のロジック自体に対する unit test なし)

## Verdict

- **verdict**: needs-fix

理由:
1. **CRITICAL**: TC-RC-001..008 (8 件の must テスト) が未実装で、retry/rate-limit/version header の振る舞いがテストでまったく担保されていない。tasks.md T-11d が `[x]` になっているのは虚偽。
2. **CRITICAL**: `verifyBranch` が 5xx exhaustion で `true` を返す silent regression。`verifyBranch` は spec-review pipeline の前提となる branch existence check で利用されており、503 を「存在する」と誤判定すると downstream の挙動が壊れる。
3. **MAJOR**: `src/cli/ps.ts:104` で `gh pr view` subprocess が残存。tasks.md T-14 AC「`gh` 文字列が production code に残らない」が未達。
4. **MAJOR**: `src/core/gh/error.ts` の `gh auth login` 言及と dead helper、`command-registry.ts` の help message、複数の comment が REST 化と乖離している。

優先度高い fix としては (1) → (2) → (3) → (4) の順。(1)(2) は behavior に直結するため次 iteration で必ず修正。(3)(4) は dead code/comment cleanup で並行作業可能。
