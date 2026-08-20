# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 現状コード前提の事実確認

- `src/cli/run.ts:43-46` — `runRunCore` の options に `inboxOrigin?: boolean` を確認。
- `src/cli/command-registry.ts:540-547` — `RUN_JOB_FLAGS` に `from-issue` は未定義、`--issue` / `--detach` は存在。
- `src/cli/command-registry.ts:830` — `job start` の `args: [{ required: true }]` を確認。
- `src/cli/command-registry.ts:553-585` — `runJobHandler` 冒頭で `const requestMdPath = parsed.positional!` を代入していることを確認。
- `src/core/command/pipeline-run.ts:133` — `this.runtime.assertNoDuplicateLiveJob?.(cwd, slug)` が `bootstrapJob` 前に呼ばれる（slug 占有時はジョブ state 未生成）。
- `src/core/command/pipeline-run.ts:167-170` — `inboxOrigin === true` → `jobState.inboxOrigin = true` の配線を確認。
- `src/core/gate/issue-fidelity-gate.ts:106` — `inboxOrigin === true` → comparator skip の経路を確認。
- `src/core/inbox/run-inbox.ts:378-401` — inbox `startJob` effect: occupancy pre-check → `writeDraft` → `runRunCore(..., { inboxOrigin: true })` の 2 段を確認。
- `src/core/inbox/__tests__/run-inbox.test.ts` — inbox テストは `effects.startJob` を注入モックでテスト。default effect 内部は直接叩かないため、T-01 の統合後も既存テスト無改変で green が成立することを確認。
- `src/util/git-exec.ts:39-51` — `gitExec` は非ゼロ exit で `null` を返す。`symbolic-ref --short -q HEAD` が detached HEAD で非ゼロ → `null` を確認。D4 の helper 実装が可能。
- `src/cli/inbox.ts:36-69` — `loadConfigWithOverlay` → `resolveGitHubToken` → `getOriginInfo` → `createGitHubClient` の組み立てを確認。`from-issue.ts` で同列の組み立てが可能。
- `src/parser/rules/slug-required.ts` — `SLUG_REGEX = /^[a-z0-9][a-z0-9-]{0,63}$/` を確認。スラグ経由のパストラバーサル（`/` / `..`）は parse 失敗で副作用ゼロ終了する。
- `src/cli/flag-parser.ts:179-191` — `positionalDef.required === false` のとき FlagParseError を投げない動作を確認。T-02 の optional 化が機能する。
- `src/errors.ts` — `EXIT_CODE.ARG_ERROR = 2`、`SLUG_OCCUPIED` → `ARG_ERROR`。`BASE_BRANCH_MISMATCH` は未定義（T-04 で追加予定）。
- `src/adapter/github/github-client.ts:670-682` — `getIssue` が非 200 で `githubApiError` を throw することを確認。`GITHUB_API_ERROR` は `EXIT_CODE_MAP` に未登録 → exit code 1（GENERAL_ERROR）。
- `src/core/inbox/draft-writer.ts` — `writeDraft` は `store.write()` に委譲することを確認。
- `src/core/command/guide.ts:24-83` — guide `jobs` topic に `--from-issue` の記述は未存在（T-05 で追加予定）。
- `src/core/command/detach.ts:42-57` — `isDetachedChild` / `stripDetachFlag` の実装を確認。detach 親で fetch/parse/guard → slug 確定 → `detachSelf` → 子再入 → 再 fetch/parse/guard → `materializeDraftAndStart` の経路が設計通り成立する。

### spec.md 要件の完全性確認

- 6 要件すべてにシナリオが存在し、SHALL / MUST が要件本文に含まれていることを確認。
- 各シナリオの GWT が Layer-1 振る舞いとして記述されていることを確認。

### test-cases.md のカバレッジ確認

- request.md の受け入れ基準 7 項目 vs TC-001〜TC-018 を照合。
- TC-001〜TC-010 が spec.md Scenario に 1:1 対応することを確認。
- TC-011〜TC-017 が design.md / tasks.md 由来の追加 TC であることを確認。
- TC-015 / TC-018 が gate TC として typecheck / test green を pin することを確認。

### セキュリティ観点

- **アクセス制御**: GitHub token は env/config 経由で解決、CLI 引数での受け渡しなし。inbox と同一経路で新たなリスクなし。
- **パストラバーサル**: `SLUG_REGEX` が `/` / `..` を含むスラグを parse 段階で拒否。draft write 前に副作用ゼロで停止する。
- **プロンプトインジェクション**: issue 本文はエージェントへの instructions として渡される（inbox と同リスクプロファイル）。本 feature が新たな注入経路を追加するわけではない。

## 検証できなかった項目

- `parseRequestMdContent` の各 validate 失敗ケースの網羅（`requestMdInvalidError` は exit code 2 = ARG_ERROR であることは確認済み。シナリオ別の検証は実装テストで確認）。
- `materializeDraftAndStart` の具体的な配置ファイル（tasks.md で「配置は挙動非依存」としているため対象外）。
- GitHub Actions との実際の統合動作（スコープ外: 別 PR #1014）。

## Findings 詳細

### F-001: TC-007（--from-issue + --detach 併用）が "should" 優先度 — CI 主用途の経路が非必須テスト

**severity**: medium | **resolution**: fixable
**file**: `specrunner/changes/job-start-from-issue/test-cases.md`

この feature の第一動機は「CI（workflow_dispatch）から issue 番号だけで起動する」であり、CI では `--detach` との併用が必須パターン。`--from-issue --detach` の実行経路は：

1. 親: fetch → parse → base-branch guard → detachSelf → exit 0
2. 子: 再入 → fetch → parse → guard → materializeDraftAndStart

という from-issue 固有の 2-process シーケンスであり、positional `--detach` 経路（`resolveSlugForDetach` → `detachSelf`）とは異なる実装パスを通る。TC-007 が "should" のままでは、CI 主用途の経路が実装後テストなしでシップされる可能性がある。

**修正**: TC-007 の Priority を `should` → `must` に変更する。

---

### F-002: GitHub API fetch 失敗（404/401/ネットワーク断）が spec に未定義

**severity**: medium | **resolution**: fixable
**file**: `specrunner/changes/job-start-from-issue/spec.md`

spec.md の parse 失敗要件は `parseRequestMdContent` の throw を対象とするが、その前段の `getIssue()` fetch 失敗（存在しない issue 番号 → 404、token 失効 → 401、ネットワーク断）は未定義。

実装上は fetch 失敗も `writeDraft` より前なので副作用ゼロ終了は成立する。しかし：
- `GITHUB_API_ERROR` は `EXIT_CODE_MAP` 未登録のため exit code が 1（GENERAL_ERROR）になり、ユーザーが修正可能な入力誤り（issue 番号不正）に ARG_ERROR（2）が返らない
- エラー文言・exit code の契約がテストで pin されない

test-cases.md にも fetch 失敗シナリオが存在しない。

**修正案（2 択）**:
1. spec.md に「fetch 失敗（issue 不存在・認証失敗）は副作用ゼロで非ゼロ exit する」要件を追加し、TC として pin する（parse 失敗と同等の扱い）。
2. issue 番号不正（404）を `ARG_ERROR` へ mapping するエラーコードを追加し spec に明示する。

---

### F-003: T-02 の `parsed.positional!` 代入移動が tasks に明示されていない

**severity**: low | **resolution**: fixable
**file**: `specrunner/changes/job-start-from-issue/tasks.md`

現在の `runJobHandler` は冒頭で `const requestMdPath = parsed.positional!;` を非 null 断言で代入（command-registry.ts:554）。T-02 で positional を `required: false` に変えると、`--from-issue` 呼び出し時に `parsed.positional` は `undefined` になる。

T-02 は「冒頭に exclusivity 検査を追加」「runFromIssue へ委譲し return する」と記述しており意図は読み取れるが、「`requestMdPath` の代入を from-issue ルーティングの**後**に移動する」とは明示していない。実装者が非 null 断言をそのまま冒頭に残すと `--from-issue` 呼び出しで実行時エラーになる。

**修正**: T-02 に「from-issue 委譲の後（positional が確実に存在するパス）でのみ `parsed.positional` を参照する」旨を 1 行追記する。

---

### F-004: detach 子プロセスの再 fetch 失敗シナリオが未検証

**severity**: low | **resolution**: decision-needed
**file**: `specrunner/changes/job-start-from-issue/test-cases.md`

design.md Risks に「detach で issue を二度 fetch/parse/guard する」ことが記載されており「冪等で追加コストは軽微」として許容されている。ただし「親 fetch 成功 → exit 0 を返す → 子再 fetch 失敗（issue 削除・編集・ネットワーク断）」のシナリオは TC に存在しない。このケースでは親は exit 0（登録完了）を返すが、子はエラー終了し job が実際には存在しない状態になる。これは positional 経路には存在しない from-issue 固有のリスクである。

**オプション**:
1. **設計上のトレードオフとして許容し TC なしのまま進める** — design Risks の記述を免責根拠とする。fail-closed のために親で guard が必要なことに起因する固有リスクであり、追加テストの実装コストが見合わない場合は許容。
2. **手動 TC（category: manual, priority: could）として記録する** — test-cases.md に追加し、リリース前に一度は手動確認する。
