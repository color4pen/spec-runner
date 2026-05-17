# agent の自主 commit を許容し prompt 規律と executor 寛容化の両建てで halt を防ぐ

## Meta

- **type**: spec-change
- **slug**: implementer-self-commit-tolerance
- **base-branch**: main
- **date**: 2026-05-17
- **author**: color4pen
- **issue**: #275

## 背景

`src/core/step/executor.ts:240-256` の commit-and-push 判定は以下の流れ:

```
git add -A
↓
git diff --cached --quiet  // exit 0 = staged 0 → halt (if requiresCommit)
↓
throw noCommitDetectedError
```

agent (= implementer 等) が step 完了前に自主的に `git add` + `git commit` を実行すると:

- agent 完了時点で working tree clean、HEAD は進んでいる
- pipeline の `git add -A` は何も拾わない
- `git diff --cached --quiet` exit 0 → 「implementer が file 編集してない」と halt 判定

### 観測実例

- request `finish-phase0-local-conflict-check` (PR #270 対応)
- implementer 完了時に `wip: Phase 0 local conflict check (6/6)` という agent 自主 commit が乗った
- 実装内容は正しい (643 行、test 含む)
- pipeline は staged 0 で halt → ユーザーは `git reset --soft HEAD^` + resume の手動介入が必要だった

### 構造的問題

prompt で「commit するな」と書いても agent は学習データの自然な挙動として step 完了時に commit してしまう。同型 pattern は #272 (delta spec 旧 path 違反) でも観測。**agent 行動への信頼を前提にしない構造的対策が必要**。

関連 issue: #275

## 目的

agent の自主 commit でも pipeline が halt しないように executor を寛容化する (副: prompt 規律でできるだけ綺麗な commit 履歴を保つ)。両建てで:

- **主 (構造補強)**: executor が「staged 0 でも HEAD が step 開始時点から進んでいれば ok」と判定するよう拡張
- **副 (規律強化)**: agent prompt で `git commit` / `git add` 禁止を明示し、できれば pipeline 規定 format で commit が打たれるよう促す

## 設計判断

1. **executor 寛容化を主対策に**: agent 行動への信頼を前提にしない。staged 0 でも HEAD が進んでいれば step が file 編集したと認める。
2. **prompt 規律も両建てで維持**: commit 履歴の format 統一 (= `<step>: <slug>`) のため。ただし「prompt 規律で完全に防ぐ」ことを期待しない (= 構造補強を主とする)。
3. **tool restriction (= adapter level で git commit を block) は不採用**: agent の試行錯誤を阻害する過剰防衛、issue #275 のスコープ外と明記済。
4. **判定ロジック改定**:
   - step 開始時の `git rev-parse HEAD` を保存
   - step 完了時に以下のいずれかを満たせば ok:
     - staged changes が 1 件以上 (= 現状と同じ)
     - HEAD が step 開始時から進んでいる (= agent が自主 commit 済)
   - 両方とも 0 (= file 編集が一切無い) なら halt (= `requiresCommit` の意味は維持)
5. **副次的に**: agent が部分 commit + 残り staged の混在状態も吸収可能 (= staged も commit する、HEAD 進みも認める)。
6. **対象 step の範囲**: `requiresCommit: true` を持つ全 AgentStep (= implementer / design / spec-fixer / code-fixer / build-fixer 等)。CliStep は元々 commit step を持たないため対象外。
7. **commit message format**: agent 自主 commit がある場合、その message が PR 履歴に残る (= `wip: ...` 等)。ただし PR merge は squash で 1 commit に潰されるため最終 main 履歴は影響なし。中間 commit message の混在は許容。

## 要件

### 1. executor の HEAD 比較判定追加

`src/core/step/executor.ts`:

- step 開始時 (= `runAgentStep` 冒頭) で `git rev-parse HEAD` を実行して保存
- `commitAndPush()` の判定ロジックを変更:
  - `git add -A` 実行 (現状維持)
  - `git diff --cached --quiet` で staged チェック (現状維持)
  - **新規**: staged 0 のとき、step 開始時 HEAD と現在 HEAD を比較
    - 現在 HEAD が進んでいる → agent 自主 commit と判定、push のみ実行 (= pipeline 側の commit はスキップ)
    - 両方とも変化なし → 従来通り `noCommitDetectedError` で halt (`requiresCommit: true` の場合)
- staged ありの場合は従来通り `<step>: <slug>` で commit + push
- 上記 HEAD 比較は `requiresCommit: true` を持つ AgentStep にのみ適用する。`requiresCommit: false` の AgentStep は staged 0 のとき HEAD 進みの有無に関わらず silent skip (= 既存挙動維持、HEAD 進みは無視)

### 1-b. managed adapter (agent-runner.ts) は本 request スコープ外 (= 既に対称実装済み)

`src/adapter/managed-agent/agent-runner.ts:354-362 / 471-479` の `requiresCommit` guard は **既に HEAD SHA 比較 (`getRefSha` before/after) で実装済み**で agent 自主 commit (= HEAD 進み) では halt しない。

加えて `src/core/step/executor.ts:207-209` で `if (deps.config.runtime === "local") { await this.commitAndPush(...); }` のとおり、`commitAndPush` (本 request 要件 1 の対象) は **local runtime 限定**で managed runtime では呼ばれない (= managed では agent 自身が commit+push する設計、`agent-runner.ts:340-344` で初期 message に commit/push 指示を inject)。

つまり:
- local runtime: agent は file edit のみ → executor.commitAndPush が commit+push (= 要件 1 の halt 問題対象)
- managed runtime: agent 自身が commit+push、guard は HEAD SHA 比較 (= 既に寛容、対象外)

本 request では managed adapter には**手を入れない**。executor.ts 側 (要件 1) のみが対象スコープ。

### 2. push のみ実行する経路の追加

agent が自主 commit した場合の処理:

- `git push origin <branch>` のみ実行 (commit はスキップ)
- 既存の push retry ロジック (5 秒スリープ + 2 回目試行) は流用
- event 通知: `commit:push` event は agent 自主 commit でも emit する (= 既存 event 監視と整合)

### 3. agent 自主 commit の検知ログ

可観測性のため、agent 自主 commit を検出した場合:

- pipeline ログに `Detected agent-authored commit(s) since step start; skipping pipeline commit and pushing as-is.` を出力
- state に新規 step result field (任意) は追加しない (= 既存 schema 不変)

### 4. prompt 規律の強化 (副対策) — 共通 fragment 方式

文言を 5 prompt に個別追記すると drift する。既存の `src/prompts/pipeline-rules.ts` (`PIPELINE_RULES` を review 系 prompt が `${PIPELINE_RULES}` で embed) と同じパターンで、commit 禁止規律を単一定数化して inject する。

#### 4-1. 共通 fragment の新規追加

`src/prompts/commit-discipline.ts` を新規作成:

```ts
/**
 * Git commit discipline rule injected into all `requiresCommit: true` step prompts.
 * Centralizes the "no manual git operations" rule so the wording does not drift
 * across implementer / spec-fixer / code-fixer / build-fixer / delta-spec-fixer.
 */
export const COMMIT_DISCIPLINE_RULE = `## git operations

あなたは file edit のみ行ってください。\`git add\` / \`git commit\` / \`git push\` の実行は禁止です。
commit / push は pipeline executor が一括で行います。違反して自主 commit してしまっても pipeline は halt せず agent commit を許容しますが、commit message format が pipeline 規定 (\`<step>: <slug>\`) から外れて履歴が読みづらくなるため、必ず file edit のみで完了してください。
`;
```

#### 4-2. inject 対象 (= `requiresCommit: true` の AgentStep 5 件、prompt ファイルは 4 件)

各 system prompt の冒頭付近 (= 「## パイプライン上の位置づけ」「## 役割」等の構造的な見出し位置) に `${COMMIT_DISCIPLINE_RULE}` を template literal で embed する:

- `src/prompts/implementer-system.ts`
- `src/prompts/spec-fixer-system.ts` (= **delta-spec-fixer もこの prompt を共有 import している** ため、ここへの 1 追記で `spec-fixer` / `delta-spec-fixer` の 2 step がカバーされる。`src/core/step/delta-spec-fixer.ts:7,27` で `SPEC_FIXER_SYSTEM_PROMPT` を import + `system:` に設定)
- `src/prompts/code-fixer-system.ts`
- `src/prompts/build-fixer-system.ts`

**`src/prompts/delta-spec-fixer-system.ts` は新規作成しない** (= 共有 prompt 設計を維持)。

import は `PIPELINE_RULES` と同じく `import { COMMIT_DISCIPLINE_RULE } from "./commit-discipline.js";` で揃える。

#### 4-3. スコープ外の prompt

`requiresCommit: false` の AgentStep (= `design` / `spec-review` / `code-review` / `test-case-gen` 等) は本 request スコープ外。元々 executor が commit/push を行わず halt も起きないため、本 fragment の inject 対象としない (= 別 issue の領分)。

#### 4-4. 期待効果

- 文言が 1 箇所、5 step が共有 → drift しない
- 将来「executor 寛容化挙動を伝える文言」を変えるとき 1 箇所修正で済む
- `PIPELINE_RULES` という前例があるので導入摩擦ゼロ、新規 abstraction 不要

「prompt で防ぐ」ことを期待しない。違反が発生しても要件 1〜3 の executor 寛容化で halt を防ぐ。

### 5. test

`tests/unit/step/executor.commit.test.ts` (新規 or 既存追加) に以下:

- TC: staged あり + HEAD 進みなし → 既存通り `<step>: <slug>` で commit + push
- TC: staged 0 + HEAD 進みなし + `requiresCommit: true` → `noCommitDetectedError` で halt (既存通り)
- TC: staged 0 + HEAD 進みあり (agent 自主 commit) → halt せず push のみ実行 (新規挙動)
- TC: staged あり + HEAD 進みあり (agent が部分 commit) → staged 分を `<step>: <slug>` で commit + 既存 commit と一緒に push
- TC: staged 0 + HEAD 進みなし + `requiresCommit: false` → silent skip (既存通り)
- TC: staged 0 + HEAD 進みあり + `requiresCommit: false` → silent skip (= HEAD 進みは無視、`requiresCommit: false` で push しない既存挙動維持)
- TC: agent 自主 commit 検出時の stdout ログ出力

`tests/pipeline-integration.test.ts` に以下を追加:

- TC: implementer が自主 commit して終了 → pipeline halt せず verification 以降へ進む (= 観測例 `finish-phase0-local-conflict-check` 相当の reproduction)

### 6. spec authority への反映

`specrunner/specs/step-execution-architecture/spec.md` (該当 capability) を MODIFIED で更新:

- 「executor は staged 0 のとき HEAD 進みを check し、HEAD が進んでいれば agent 自主 commit として push のみ実行する」を明文化
- 「両方とも変化なし + `requiresCommit: true` は halt」も維持

prompt 規律については spec 更新不要 (= prompt 文言は実装層、spec authority の対象外)。

## スコープ外

- adapter level の tool restriction (= agent runner で `git commit` を block) — 過剰防衛、issue #275 で明示的に除外
- commit message format の二重管理解消 (= agent commit と executor commit の format 統一)
- 既存 step 全体の責務境界再設計 (= #263 の領分)
- agent 自主 commit の取消し (= revert / amend で pipeline 規定 format に強制書き換え) — 履歴が読みにくくなる程度のコストは許容

## 受け入れ基準

- [ ] `src/core/step/executor.ts` の `commitAndPush` (= local runtime 専用) が staged 0 でも HEAD 進みを check する
- [ ] managed adapter (`agent-runner.ts`) は対象外 (= 既に HEAD SHA 比較で対称実装済み、本 request では変更しない)
- [ ] HEAD 進みあり → push のみ実行、halt しない (新規)
- [ ] staged あり → 従来通り `<step>: <slug>` で commit + push
- [ ] 両方とも変化なし + `requiresCommit: true` → halt (既存挙動維持)
- [ ] agent 自主 commit 検出時に pipeline ログにメッセージが出力される
- [ ] `src/prompts/commit-discipline.ts` に `COMMIT_DISCIPLINE_RULE` が新規追加されている
- [ ] `requiresCommit: true` の AgentStep 5 件 (implementer / spec-fixer / code-fixer / build-fixer / delta-spec-fixer) の system prompt に `${COMMIT_DISCIPLINE_RULE}` が embed されている (= prompt ファイル 4 件への追記、delta-spec-fixer は spec-fixer-system.ts の共有 import 経由でカバー)
- [ ] `src/prompts/delta-spec-fixer-system.ts` は新規作成しない (= 既存共有 prompt 設計を維持)
- [ ] inject 経路は既存 `PIPELINE_RULES` (`pipeline-rules.ts`) と同じ template literal embed パターンに準拠している
- [ ] 新規 unit test (executor.commit.test.ts) と integration test (pipeline) が pass
- [ ] 観測例 (`finish-phase0-local-conflict-check` の implementer 自主 commit) を再現する scenario test が halt せず完走する
- [ ] 既存 commit/push 関連 test が regression していない
- [ ] `bun run typecheck && bun run test` が green
- [ ] `specrunner/specs/step-execution-architecture/spec.md` が MODIFIED で更新されている

## Workflow Options

- enabled: []
