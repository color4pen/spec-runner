# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### spec.md
- 全 Requirement（SHALL/MUST/MUST NOT）の存在と normative keyword の確認
- 各 Requirement に対応する Scenario（Given/When/Then 形式）の有無を確認
- 前周 finding「GitHub API fetch 失敗が spec に未定義」の解消を確認 → **解消済み**
  - "Requirement: GitHub API fetch 失敗は副作用ゼロで非ゼロ exit しなければならない" が追加され、Scenario "fetch 失敗時に draft も job state も生成されない" が含まれる
- 合計 8 Requirement / 10 Scenario 確認

### tasks.md
- 前周 finding「T-02 の parsed.positional! 代入移動が明示されていない」の解消を確認 → **解消済み**
  - T-02 に「`parsed.positional` の参照（`requestMdPath` 代入）は from-issue 委譲 return の後…移動する」の bullet が追加されている
- T-01〜T-06 の Acceptance Criteria と spec.md Requirement の対応を確認

### test-cases.md
- TC-001〜TC-018 と対応 spec Scenario の突合
- Summary / Result カウントの整合確認
- spec.md に追加された Requirement（fetch 失敗）に対応する TC の有無を確認
  - **TC が存在しない**: design.md の `spec-fixer-deferred: fetch 失敗 TC 追加（F-002）` コメントで「test-cases.md への書き込みが拒否された」と明記されており、前周の medium finding が未解消のまま残っている
- TC-007 の priority 確認
  - **まだ `should`**: design.md の `spec-fixer-deferred: TC-007 priority should→must` コメントで同様に「書き込みが拒否された」と明記されており、前周の medium finding が未解消のまま残っている
- F-004（detach 子プロセス再 fetch 失敗）TC の有無を確認
  - **TC が存在しない**: design.md の `spec-fixer-deferred: detach 子プロセス再 fetch 失敗 TC（F-004）` コメントで同様に未追加と明記されている

### design.md
- D1〜D7 のデザイン決定と spec.md Requirement の整合確認
- 3 つの `spec-fixer-deferred` コメントを確認（TC-007 priority・F-002・F-004 が全て test-cases.md 未反映）

### ソースコード（fact-check）
- `src/core/gate/issue-fidelity-gate.ts:106` — `inboxOrigin === true` で comparator を skip する経路を確認
- `src/core/inbox/run-inbox.ts:378-401` — default startJob 実装（occupancy pre-check → writeDraft → runRunCore）を確認
- `src/util/git-exec.ts` — `gitExec()` が非ゼロ/spawn 失敗で null を返すことを確認（D4 の getCurrentBranch の根拠）
- `src/adapter/github/github-client.ts:670-682` — `getIssue()` が非 200 で `githubApiError` を throw することを確認（fetch 失敗挙動の根拠）
- `src/util/validation-patterns.ts` — `SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,63}$/` — slug バリデーションでパストラバーサルが防がれることを確認
- `src/core/request/store.ts:82-87` — `write()` が `path.join(cwd, DRAFTS_SUBDIR, slug)` を使用 — slug に SLUG_REGEX 適用済みのため安全
- `src/cli/command-registry.ts:540-547` — 現在の `RUN_JOB_FLAGS` に `from-issue` がないことを確認（実装前の baseline）

### セキュリティ検証
- Issue body（GitHub API からの外部データ）は `parseRequestMdContent` に渡され、必須 Meta の構造検証を受ける
- slug は SLUG_REGEX（`/^[a-z0-9][a-z0-9-]{0,63}$/`）でバリデーション済みのため draft path のパストラバーサルリスクなし
- Issue number は CLI parser が `integer, min: 1` で型検証
- GitHub token 解決は既存の `resolveGitHubToken` 経路と同一（inbox と同じ）
- 認証・入力バリデーション・OWASP Top 10 の主要リスク（injection, path traversal 等）の問題なし

## 検証できなかった項目

- `src/core/command/detach.ts` の `detachSelf` 内部で「子プロセスが同一 argv で再入する」挙動の完全トレース（子は argv を変えずに同じ `runFromIssue` に再入するため fetch/parse/guard を再実行するという設計方針は design.md D3 に記述されており妥当性は確認済み、実コードは未実装のため trace 不可）

## Findings 詳細

### F-1: TC-007 priority が still "should"（前周 medium finding 未解消）

test-cases.md TC-007 は `**Priority**: should` のまま。spec.md では `--from-issue + --detach` は "Requirement: --from-issue と positional / --issue は排他でなければならない" 配下の Scenario として記述されており、その Requirement 本文は `MUST` を含む。CI の主用途（detach + from-issue）が非必須テストのままであれば、実装で壊れても検出できない。

design.md の `spec-fixer-deferred` コメントは「実装者または次 step が TC-007 の priority を should から must に変更し、Summary/Result の must カウントを +1 すること」と指示している。修正は test-cases.md の以下 3 箇所:
1. TC-007 の `**Priority**: should` → `**Priority**: must`
2. Summary の `must: 15, should: 3` → `must: 16, should: 2`
3. Result YAML の `must: 15, should: 3` → `must: 16, should: 2`

### F-2: Fetch 失敗 TC（F-002）が test-cases.md に存在しない

spec.md に "Requirement: GitHub API fetch 失敗は副作用ゼロで非ゼロ exit しなければならない（MUST）" と対応 Scenario が追加されたが、test-cases.md に対応 TC が存在しない。design.md の `spec-fixer-deferred` コメントに追加すべき TC の仕様が書かれている:

> test-cases.md に integration/must の TC を追加すること: GitHubClient.getIssue が 404 で throw する mock で draft 不在・job state 不在・非ゼロ exit を assert する。

test-cases.md Summary / Result のカウントも更新が必要（+1 must, +1 total, +1 automated）。

TC-007 が must になることと合わせると最終カウントは Total: 20, Automated: 18, must: 17, should: 2 となる。

### F-3: F-004 detach 子プロセス再 fetch 失敗 TC が追加されていない

design.md の `spec-fixer-deferred` コメントに「test-cases.md に manual/could の TC を追加すること」と明記されているが、TC が存在しない。これは前周の decision-needed finding（low severity）で、design.md は「手動確認」として位置付けている。実装フェーズでリリース前確認として残すか、TC として明示するか判断が必要。
