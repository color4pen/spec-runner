# Code Review Feedback — iteration 001

## 検証した項目

- `git diff main...HEAD --stat` でスコープ確認（24 files changed）
- `src/adapter/claude-code/git-command-classifier.ts`（新規）— 分類ロジック全体
- `src/adapter/claude-code/agent-runner.ts`（変更）— allowedTools・guard 実装・writeScope 配線
- `src/core/port/agent-runner.ts`（変更）— AgentWriteScope インターフェース追加
- `src/core/step/step-context-builder.ts`（変更）— writeScope 計算・AgentRunContext 組み立て
- `src/util/paths.ts`（変更）— dotSpecrunnerDirRel 追加
- `src/adapter/claude-code/__tests__/git-command-classifier.test.ts`（新規）— TC-001〜TC-009
- `src/core/step/__tests__/step-context-builder.test.ts`（新規）— TC-039〜TC-042
- `src/util/__tests__/paths.test.ts`（変更）— TC-043〜TC-044
- `src/adapter/claude-code/__tests__/workspace-tool-guard.test.ts`（既存・本ブランチで未変更）
- `src/adapter/claude-code/__tests__/sandbox-scope.test.ts`（既存・本ブランチで未変更）
- `scripts/probes/write-scope-guard-probe.ts`（変更）— 5 シナリオ実装確認
- `specrunner/changes/permission-layer-git-write-denial/verification-result.md` — test green (8993 passed)
- `specrunner/changes/permission-layer-git-write-denial/design.md` — D1〜D6
- `specrunner/changes/permission-layer-git-write-denial/tasks.md` — T-01〜T-08
- `specrunner/changes/permission-layer-git-write-denial/test-cases.md` — TC-001〜TC-061

## 検証できなかった項目

- probe R5-a〜R5-e の実際の実行結果（ANTHROPIC_API_KEY が必要なため手元では未実行）
- DSM 検査（architecture/core-invariants.test.ts の実行結果）— verification-result.md で green 確認済みのため間接的に確認

## Findings 詳細

### F-01 [BLOCKER]: Bash が allowedTools に残り、本番 SDK 経路で git 変更 deny が機能しない

**証拠箇所**

`agent-runner.ts:558`:
```ts
const baseAllowedTools = ["Read", "Bash", "Grep", "Glob"];
```

`sandbox-scope.test.ts` TC-SB-02（本ブランチで未変更、維持されている）:
```ts
expect((capturedOptions!["allowedTools"] as string[])).toContain("Bash");
```

`agent-runner.ts:118-122`（実装者自身のコメント）:
```
// Bash is on allowedTools (autoAllowBashIfSandboxed: true preserves execution under sandbox);
// the Bash branch below provides direct-call classification (tested by unit tests and probes).
```

**問題**

SDK の実測済み挙動（design D1 前提）: allowedTools に載っている tool は `canUseTool` を素通りする。
Bash が allowedTools に残る限り、guard の Bash 分岐は実 SDK 実行では **一切呼ばれない**。
`git commit` 等が deny されるのは guard 関数を直接呼ぶ単体テスト内だけであり、
agent が実際に Bash tool を使う経路では deny は発生しない。

`design.md D1` は「probe R5-a を最初に走らせ、観測 A/B を確定してから実装挙動を決める」と定め、
`tasks.md T-01` は「T-01 を最初に実施し D1 の観測 A/B を確定してから T-02 以降を確定する」と
タスク順序制約を明記していた。本実装はこのゲートを通らずに Bash を allowedTools に残したまま進んでいる。

**受け入れ基準との照合**

- TC-037（must）: 「allowedTools に "Bash" が含まれない（typecheck && test で固定）」→ **違反**
- tasks.md T-06 AC: 「`allowedTools` が `"Bash"` を含まない（typecheck && test で固定）」→ **違反**
- R1（Bash を canUseTool 経路に載せ替える）→ **未達**
- R2（git 状態変更を全 agent step で deny）→ **本番未達**

tasks.md T-06 内のチェック項目が「`baseAllowedTools は ["Read", "Bash", ...] を維持（TC-SB-02 保存）`」
と「`allowedTools が "Bash" を含まない（typecheck && test で固定）`」を同時に [x] としており、
自己矛盾している。実態は前者（Bash 維持）が選択されているが、TC-037 のテストは存在しない。

---

### F-02 [BLOCKER]: guard 単体テスト TC-011〜TC-036 が未実装

**証拠**

`git diff main...HEAD --stat` に `workspace-tool-guard.test.ts` が含まれない。
同ファイルは本ブランチで変更されておらず、TC-FW-01〜TC-FW-07 しか存在しない。

`test-cases.md` の「テストファイル対応」テーブル:
> Guard (TC-011〜TC-036) | workspace-tool-guard.test.ts（拡張）

以下の must 優先テストケースが未実装:

| TC | 内容 |
|----|------|
| TC-011 | guard が状態変更 git Bash call を deny する |
| TC-012 | deny message に「commit は pipeline が合成する」と「読み取り系は許可」を含む |
| TC-013 | guard が読み取り git Bash call を allow し updatedInput を返す |
| TC-014 | guard が非 git Bash call を allow し updatedInput を返す |
| TC-015 | guard が mutation セグメントを含む複合コマンドを deny する |
| TC-017 | state.json への Write が deny される |
| TC-018 | .specrunner 配下への Write が deny される |
| TC-022 | scoped step で宣言外 Write が deny される |
| TC-023 | scoped step で宣言外 Edit が deny される |
| TC-025 | scoped step で宣言内 Write が allow され updatedInput を返す |
| TC-026 | scoped step で宣言内 Edit が allow され updatedInput を返す |
| TC-027 | guarded step で宣言していない保護正典 Write が deny される |
| TC-028 | spec.md / tasks.md / test-cases.md / request.md / attestation Write が deny される |
| TC-029 | guarded step で保護正典以外の worktree Write が allow される |
| TC-033 | allow 結果に updatedInput が含まれ元 input と同一（新 scope 経路） |

F-01 と組み合わせると、guard の Bash 分岐は本番 SDK では発火せず、
単体テストが唯一の検証手段であるにもかかわらず、その単体テストも存在しない。

受け入れ基準:「guard 単体テスト: scoped 宣言外 deny / 宣言内 allow、guarded 保護正典 deny /
その他 allow、pipeline 管理パス deny（全 step）、cwd 境界 deny（既存挙動保存）を固定する」→ **未達**

---

### F-03 [MAJOR]: ALWAYS_MUTATING リストが design D2 の仕様より不完全

**証拠**

`git-command-classifier.ts` の ALWAYS_MUTATING（実装）:
```
commit, push, add, reset, checkout, restore, clean, merge, rebase,
cherry-pick, rm, mv, am, apply, update-ref, filter-branch
```

`design.md D2` の ALWAYS_MUTATING（仕様）:
> `commit` `commit-tree` `push` `add` `reset` `restore` `checkout`
> **`switch`** `clean` `merge` `rebase` `cherry-pick` **`revert`** `rm` `mv` `am` `apply` **`pull`**
> `update-ref` **`update-index`** `filter-branch` **`fast-import`** **`gc`** **`prune`**

実装に存在しない設計列挙: `switch`、`revert`、`pull`、`commit-tree`、`update-index`、`fast-import`、`gc`、`prune`

特に `switch`（ブランチ切り替え = `checkout` と等価）と `pull`（fetch + merge）は
agent が誤用しやすく、deny されるべき操作である。現在は unknown subcommand 扱いで
`{ kind: "read-or-nongit" }` に倒れ、allow される。

TC-001 のテストケースは実装の ALWAYS_MUTATING と一致しているため green だが、
design の意図（`git switch main`、`git pull` が mutation）はカバーしていない。

---

### F-04 [MINOR]: TC-SB-02 と TC-037 が相互矛盾、かつ TC-037/TC-038 のテストが未実装

sandbox-scope.test.ts TC-SB-02 は `allowedTools` に `"Bash"` が含まれることをアサートし、
TC-037（must）は含まれないことを要求する。F-01 が修正されると TC-SB-02 は fail するため、
同時に TC-SB-02 の更新が必要。

TC-037・TC-038 に対応するテストが sandbox-scope.test.ts に存在しない（ファイル本ブランチ未変更）。

---

### F-05 [MINOR]: probe R5-a の観測 A/B 記録が未記録

`design.md D6` の probe 実装状況欄:
> 実 SDK 実行結果は `ANTHROPIC_API_KEY` を持つ環境で
> `bun scripts/probes/write-scope-guard-probe.ts` を実行後に追記する。

design.md に実行記録の追記はなく、TC-051（should）の完了条件を満たしていない。
probe コード（bash-canusetool-gate シナリオ）は実装されているが、実行・記録が未実施。

---

## 受け入れ基準ごとの充足状況

| 受け入れ基準 | 状況 |
|---|---|
| classifier 単体テスト（変更系 deny・読み取り系 allow・複合コマンド） | ✅ TC-001〜TC-009 実装・green |
| guard 単体テスト（scoped/guarded/managed パス/cwd 境界） | ❌ TC-011〜TC-036 未実装（F-02） |
| allow 経路が updatedInput パススルーを維持 | ⚠️ 既存 allow tests で部分カバー（新 scope 経路は F-02 により未テスト） |
| probe 実行記録（R5 5 シナリオ verdict） | ❌ コード実装あり、実行・記録なし（F-05） |
| 既存 write-scope / 合成 / egress テストが無改変で green | ✅ diff に変更なし、verification green |
| 破壊確認の記録 | ⚠️ classifier は有効だが guard テスト未実装のため guard 破壊確認なし |
| `typecheck && test` が green | ✅ verification-result.md（8993 passed） |
| allowedTools に Bash が含まれない（TC-037） | ❌ Bash 残存（F-01） |
| git 状態変更が本番 SDK 経路で deny される（R1/R2） | ❌ canUseTool が Bash に発火しないため未達（F-01） |
| buildStepContext writeScope threading（TC-039〜TC-042） | ✅ 実装・テスト green |
| dotSpecrunnerDirRel（TC-043〜TC-044） | ✅ 実装・テスト green |
| ALWAYS_MUTATING が design D2 列挙と一致 | ❌ switch/pull/revert 等 8 subcommand 欠落（F-03） |
