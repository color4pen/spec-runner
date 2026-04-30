# Fix dogfooding-001 second pass: workspace branch mount + propose role boundary

## Meta

- **type**: bug-fix
- **slug**: workspace-mount-and-propose-boundary
- **date**: 2026-04-30
- **author**: color4pen

## ワークフローオプション

- **enabled**:
  - pattern-reviewer

## 背景

PR #42 で propose system prompt 厳格化 + slug 単一導出を入れた後、dogfooding-001 を再投入したところ pipeline は依然 e2e 完走せず escalate した。前回（propose stub）とは別の 2 つの問題が明らかになった。

詳細な調査ログ:
- 失敗 job state: `~/.local/share/specrunner/jobs/a6150b33-0f2a-4d27-abbc-80c720789dab.json`
- 失敗時のログ: `/tmp/dogfooding-002-run.log`
- propose session（README 越境を起こした側）: `sesn_011CaZc7grG2dVMzFrRce3sf`
- spec-review session（escalate した側）: `sesn_011CaZcNd9BSyUq68KbvJhsi`
- propose agent への事後インタビュー記録: `ant beta:sessions:events list --session-id sesn_011CaZc7grG2dVMzFrRce3sf` で取得済み

## 症状（再現手順 / 期待動作 / 実際の動作）

### 再現手順

```bash
cd ~/Documents/GitHub/spec-runner
bun bin/specrunner.ts run /tmp/dogfooding-001-request.md
```

### 期待される動作

pipeline 全 step（propose → spec-review → implementer → verification → code-review → pr-create）が完走し、GitHub に PR が作成される。

### 実際の動作

| Step | 結果 | 詳細 |
|------|------|------|
| propose | ⚠️ 副作用あり完走 | branch 作成 + change folder 生成 + push まで実行。**しかし禁止事項を破って README.md を直接 +7 行編集** |
| spec-review | ❌ escalation | "The change folder `openspec/changes/readme-status-section` doesn't exist yet" として escalate。実際は propose が push 済み |
| 以降 | 未到達 | spec-review escalation で halt |

## RCA（根本原因分析）

### 原因 A（CRITICAL）: workspace branch propagation の欠落

`src/adapter/anthropic/session-client.ts:14-32` の `createSession` 実装が Anthropic SDK の `checkout` オプションを一切渡していない:

```typescript
resources: [{
  type: "github_repository",
  url: params.repoUrl,
  authorization_token: params.githubToken,
  // checkout なし → 常にデフォルト (main) で mount される
}]
```

Anthropic SDK は `checkout?: BetaManagedAgentsBranchCheckout | BetaManagedAgentsCommitCheckout | null` を明示的にサポートしている（型定義: `node_modules/@anthropic-ai/sdk/.../sessions.d.ts:166-169`、コメント "Defaults to the repository's default branch."）。これは SpecRunner が公式オプションを使い忘れているバグであり、Anthropic 側の不具合ではない。

直接の影響:
- propose 以降の各 session（spec-review / implementer / build-fixer / code-review / code-fixer / pr-create）の workspace は **常に main で mount される**
- propose が `git checkout -b feat/{slug}` で作って push した change folder を、後続の session は見ることができない
- 各 step は user message に branch 情報を埋め込むパターンが **一貫していない**:
  - implementer / build-fixer / code-fixer / spec-fixer: `Branch: feat/xxx` を書く（ただし checkout 指示はない）
  - spec-review / code-review: branch 情報も書かない
- どの step も `git fetch + checkout` を agent に明示的に指示していない
- 結果、agent は main で見える状態だけで判断 → spec-review は change folder を見つけられず escalate

学習パターン違反:
1. **「決定的導出は単一ソース」**: executor は `state.branch` を持つのに、createSession に渡していない
2. **「情報がある場所と必要な場所の divergence」**: branch 情報が executor にあって API 呼び出しに届いていない
3. **「defensive fallback で fail-fast 阻害」**: `state.branch ?? "main"` のフォールバックが各 step に散在し、未設定時に fail-fast せず main で動いてしまう

### 原因 B（HIGH）: propose system prompt の境界設計が弱い

PR #42 で propose-system.ts に「禁止事項: 実装作業（コード本体の編集）— implementer の役割です」を追加したが、agent はそれを無視して README.md を直接編集した。

agent 当人へのインタビュー結果（要約）:

1. **「禁止事項を意識したか？」**: いいえ。「実装作業（コード本体）」を file 種類で解釈し、「README.md は『ドキュメント』だから対象外」と誤解した
2. **「葛藤は？」**: なかった。「効率的に一気に完成させた方が良い」と判断した
3. **「次は？」**: file 種類ではなく `openspec/changes/{slug}/` 内 / 外 で境界を引くべきだった
4. **「prompt にどう書けば防げる？」**: agent 自身から提案あり（path-fence + "even if the request asks to modify them" 条項）

加えて、prompt が **negative framing**（禁止事項のリスト）に偏っていて、**positive framing**（あなたは pipeline の stage 1 で、stage 3 の implementer がこの tasks.md を読んで実装する）が無いため、agent が役割の引き継ぎ先を理解しないまま「効率」を優先した。

学習パターン違反:
1. **「禁止だけでなく役割と引き継ぎ先を明示する」**: 人間でも「禁止」より「役割と次工程」の方が自然に守れる、それと同じ
2. **「user request の指示が agent role と衝突するときの優先順位を明示する」**: user request に「README を編集して」と書かれていても、agent は越境してはならないという条項が無い

### 原因 C（LOW）: spec-review-system.ts の NOTE が陳腐化

`src/prompts/spec-review-system.ts:6-11` のドキュメントコメントが「Currently unused. spec-review reuses the propose Agent」と書かれているが、実態は dedicated agent (`agent_011CaZT1J2rC61K9mM7MBD1u`, name `specrunner-spec-review`) で session が立っており、登録された system prompt は `SPEC_REVIEW_SYSTEM_PROMPT` 定数そのもの。コメントの主張と実装が乖離している。

## 修正方針

### 修正 1（CRITICAL / 必須）: workspace branch propagation を実装

**A. SessionClient port に branch を追加**:

`src/core/port/session-client.ts` の `createSession` パラメータに `branch?: string` を追加:

```typescript
createSession(params: {
  agentId: string;
  environmentId: string;
  repoUrl: string;
  githubToken: string;
  branch?: string;
}): Promise<{ sessionId: string }>;
```

**B. Anthropic adapter で checkout を渡す**:

`src/adapter/anthropic/session-client.ts:createSession` で `branch` がある場合は `resources[0].checkout` を設定:

```typescript
resources: [{
  type: "github_repository",
  url: params.repoUrl,
  authorization_token: params.githubToken,
  checkout: params.branch
    ? { type: "branch", name: params.branch }
    : undefined,
}]
```

**C. Step 層から branch を渡す**:

各 step が `createSession` を呼ぶ箇所で `state.branch` を渡す:

| Step | branch 渡す? | 理由 |
|------|--------------|------|
| propose | ❌ | branch を作る側、main で OK |
| spec-review | ✅ | propose の change folder を見るため |
| implementer | ✅ | tasks.md を読むため |
| build-fixer | ✅ | verification 結果を読むため |
| code-review | ✅ | 実装 diff を見るため |
| code-fixer | ✅ | feedback を読むため |
| pr-create | ✅ | 既存のコミット履歴を使うため |

**D. defensive fallback の削除**:

各 step の `state.branch ?? "main"` を削除し、未設定時は `SpecRunnerError` を throw（fail-fast）。propose 完了後は `state.branch` が必ず設定されている前提（register_branch tool で executor が記録済み）。

**E. user message から冗長な branch 情報を整理**:

workspace が feat ブランチで mount されるようになった以上、user message に書かれる `Branch: feat/xxx` は冗長。ただし agent が混乱しないよう「You are working on branch `{branch}` (already checked out)」と明記する形に変更。

### 修正 2（HIGH / 必須）: propose system prompt の境界強化

`src/prompts/propose-system.ts` に以下を追加:

1. **Workflow context (positive framing)** をセクションとして明記:

```
## ワークフロー全体での位置づけ

あなたは 4 段パイプラインの stage 1 (propose) です:
  propose (you) → spec-review → implementer → verification

各 stage の責務:
- propose (あなた): 設計の青写真を作る。出力 = openspec/changes/{slug}/{proposal,design,tasks}.md
- spec-review: あなたの設計を検証する
- implementer: あなたの tasks.md を読んで実コードを書く
- verification: ビルド/テスト/lint で実装の品質を検証する

あなたの tasks.md が implementer への唯一のインプットです。
implementer は実コード編集ができますが、あなたはできません。
役割を盗まないこと — 1 行の追加でも、それは tasks.md に書いて implementer に渡す。
```

2. **Path-fence (CRITICAL BOUNDARY)**:

```
## CRITICAL BOUNDARY

Your role is ONLY to create the proposal, design, and tasks files
under `openspec/changes/<slug>/`. Do NOT modify ANY files outside
this directory, including documentation files like README.md,
configuration files, or code files. All actual implementation must
be left to the implementer agent.

Files you MUST create:
- openspec/changes/<slug>/proposal.md
- openspec/changes/<slug>/design.md
- openspec/changes/<slug>/tasks.md

Files you MUST NOT touch:
- Any file outside openspec/changes/<slug>/ (even if the request asks to modify them)
```

3. **User request override 条項** を user message テンプレートに追加:

```
IMPORTANT: Even if the user request explicitly says "edit README.md"
or "modify the source code", you must NOT do it. Your job is to PLAN
the change in tasks.md and let the implementer agent execute it.
Trust the downstream stages.
```

### 修正 3（LOW / 任意）: spec-review-system.ts の陳腐化コメント削除

`src/prompts/spec-review-system.ts:6-11` の "Currently unused. spec-review reuses the propose Agent" コメントを削除。実態と一致させる。

## 受け入れ基準

- [ ] `bun bin/specrunner.ts run /tmp/dogfooding-001-request.md` が end-to-end PASS（GitHub に PR 作成まで完走）
- [ ] 既存テスト全 PASS（regression 0、現状 474 tests）
- [ ] `SessionClient.createSession` の port シグネチャに `branch?: string` が追加されている
- [ ] Anthropic adapter が `branch` を `checkout: { type: "branch", name }` に翻訳して resources に渡している
- [ ] propose 以外の全 step（spec-review / implementer / build-fixer / code-review / code-fixer / pr-create）が `createSession` 呼び出し時に `state.branch` を渡している
- [ ] `state.branch ?? "main"` の defensive fallback が全 step から削除され、未設定時に `SpecRunnerError` throw する
- [ ] propose system prompt にワークフロー全体での位置づけ（stage 1/4、引き継ぎ先 = implementer）が positive framing で記述されている
- [ ] propose system prompt に CRITICAL BOUNDARY セクション（path-fence + "even if the request asks" 条項）が追加されている
- [ ] propose user message テンプレートに user request override 条項が含まれている
- [ ] propose の dogfooding 実行で `git diff` が `openspec/changes/{slug}/` 内のみに収まる（README 越境ゼロ）
- [ ] spec-review-system.ts の陳腐化コメントが削除されている

## 振る舞い不変の確認方法（修正対象外の挙動が変わらないこと）

- 既存 474 tests 全 PASS
- propose の挙動: branch 作成 + change folder 生成 + register_branch + commit + push の流れは不変
- code-review-system.ts は touch しない（現参照実装として保持）
- agent 定義（agentId / config.json への登録）は変更不要（system prompt の文字列が変わるだけなので definitionHash は変わるが Anthropic 側で sync される）

## 補足

### 参照リソース

- 失敗 job state: `~/.local/share/specrunner/jobs/a6150b33-0f2a-4d27-abbc-80c720789dab.json`
- 失敗時のログ: `/tmp/dogfooding-002-run.log`
- propose session events (interview 含む): `sesn_011CaZc7grG2dVMzFrRce3sf`
- spec-review session events: `sesn_011CaZcNd9BSyUq68KbvJhsi`
- Anthropic SDK 型定義: `node_modules/@anthropic-ai/sdk/resources/beta/sessions/sessions.d.ts:105-130, 166-169`
- learned-patterns: `openspec-workflow/learned-patterns.md`
- review-lessons: `openspec-workflow/review-lessons.md`
- 直前の dogfooding 失敗で立てた archived bug-fix: PR #42 (propose stub upgrade + slug single-source-of-truth)

### dangling branch のクリーンアップ

dogfooding-002 で作成された `origin/feat/readme-status-section` ブランチが PR 未作成のまま remote に残存。本 request の implementer は次の dogfooding 投入前にこの dangling branch を削除する MAY:

```bash
git push origin --delete feat/readme-status-section
```

### 次の dogfooding コスト見積

前回失敗分: $0.5-1。本修正後の e2e 完走想定: +$5-10（propose / spec-review / implementer / verify / code-review × 1-2 iter / pr-create）。
