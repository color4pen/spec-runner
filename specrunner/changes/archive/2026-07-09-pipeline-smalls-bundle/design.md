# Design: pipeline 運用の小粒不具合 3 件の一括修正

## Context

運用中に観測した 3 件の独立した小粒不具合を一括修正する。

1. **build-fixer prompt の coverage gate 記述が旧仕様のまま**  
   verification の test-coverage phase は 2026-07-08 の変更で lcov 変更行照合に置き換わったが、build-fixer の system prompt は旧 TC-ID 照合 gate の手順のまま。fixer は実際の失敗内容（未実行変更行・実行率）と食い違う指示を受けており、gate 回避的修正（dead export 追加・テスト移設）が観測された。

2. **exit-guard が resumePoint を書かない**  
   `exit-guard.ts` の 3 経路（no-worktree / per-job / global scan）はいずれも `transitionJob(..., "awaiting-resume", ...)` を呼ぶが `resumePoint` を渡さない。`job ls` の escalation 発生元表示は `resumePoint` を一次情報源とし、不在時は履歴全走査にフォールバックするため、exit-guard で中断された job では解消済みの過去 escalation が現在の待機理由として誤表示される。

3. **worktree cwd からの view コマンドがクラッシュする**  
   `job ls` 等を job worktree 内から実行すると `repoRoot` が worktree root に解決され、`<worktreeRoot>/.git/specrunner-worktrees` の readdir が ENOTDIR で throw し Fatal になる（worktree の `.git` はファイル）。`job resume` には同問題に対する worktree cwd 拒否ガードが既に存在し、同一機構（`detectSpecrunnerWorktree` + `worktreeGuardError`）が流用できる。

現行コードの参照点:
- `src/prompts/build-fixer-system.ts:30-34` — test-coverage failed 時の手順（TC-ID 旧仕様）
- `src/prompts/code-fixer-system.ts` — coverage gate への言及なし
- `src/core/lifecycle/exit-guard.ts:65,131,152` — 3 箇所とも resumePoint を渡さない
- `src/state/schema.ts:107-113` — `ResumePoint { step: StepName, reason: string, iterationsExhausted: number }`
- `src/state/lifecycle.ts:24` — `transitionJob` の `patch` フィールドで resumePoint を上書きできる
- `src/core/step/executor.ts:412` — timeout 時に `patch.resumePoint` を書く先行例
- `src/store/job-state-store.ts:268-296` — `list()` が `<repoRoot>/.git/specrunner-worktrees` を readdir（ENOTDIR でクラッシュ）
- `src/cli/ps.ts:87` / `src/core/command/job-stats.ts:350` / `src/cli/job-show.ts:65` — view 系は cwd 由来の repoRoot で `JobStateStore.list` を呼ぶ
- `src/core/command/resume.ts:83-94` — `detectSpecrunnerWorktree` による worktree cwd 拒否ガード（既存）
- `src/core/worktree/detection.ts:100-122` — `detectSpecrunnerWorktree` 実装
- `src/errors.ts:235-241` — `worktreeGuardError` ファクトリ（既存）

## Goals / Non-Goals

**Goals**:
- build-fixer prompt の test-coverage failed 手順を現行 lcov 変更行 gate に合わせて書き直す
- build-fixer / code-fixer 両 prompt に coverage gate 回避の禁止規律を追加する
- exit-guard の 3 経路で、`state.step` が truthy のとき `resumePoint`（reason: "signal"）を書き込む
- `job ls`・`job stats`・`job show` を worktree 内 cwd から実行した場合、state scan 前に明示エラーで拒否する

**Non-Goals**:
- prompt 全体の再構成（変更は test-coverage 手順と禁止規律の追加のみ）
- coverage gate 本体・verification-result.md の書式の変更
- `ResumePoint` schema の変更（reason の enum 化を含む）
- `JobStateStore.list` の scan 挙動の変更（ENOTDIR の握り潰し不可）
- view 系以外のコマンド（job start / archive / cancel 等）への cwd 検証の追加
- codex adapter の prompt・挙動の変更

## Decisions

### D1: build-fixer step 4 を lcov 変更行 gate 手順に差し替える

**Rationale**: 旧手順（TC-ID 照合）は現行 gate と無関係なため、fixer が誤った方針で修正を試みる。現行の `changed-line-coverage.ts` が出力する失敗理由は「未実行変更行（file:line）」と「閾値未達（実行率・閾値付き）」の 2 種であり、正当な修正は「その行を実際に実行する実テストの追加」のみ。

**変更内容**:
- `## 修正手順` の step 4 を以下に差し替える:
  - `verification-result.md` の `## Phase: test-coverage` に記録された未実行変更行（file:line）と実行率を確認する
  - **その行を実際に実行する実テストを追加する** ことが唯一の正当な修正
  - テストの削除・移設、dead code / dead export の追加、coverage 設定（include / exclude / threshold）の編集は禁止
  - 正当な修正で解消できない場合は修正せず失敗のまま終える（escalation は pipeline の iteration 上限が担う）

**Alternatives considered**:
- `## 禁止事項` にだけ追記する案: test-coverage failed の正当手順が不明確なままのためリジェクト
- shared fragment（定数）化する案: 変更は 1 ファイル 1 箇所のためオーバーキル

### D2: code-fixer の `## 禁止事項` に coverage gate 回避禁止を追記する

**Rationale**: code-fixer も coverage gate 失敗を修正対象として受け取り得るため、同一の回避禁止規律が必要。code-review の finding 経由で coverage 設定編集や dead code 追加を指示する finding が来た場合に拒否させる。

**変更内容**:
- `## 禁止事項` に gate 回避項目（テスト削除・移設 / dead code 追加 / coverage 設定編集）を追加

**Alternatives considered**:
- shared fragment 化する案: build-fixer と code-fixer で文脈（lcov gate 手順 vs review finding 修正）が異なり文言も変わるため個別記述を選択

### D3: exit-guard の 3 経路で `patch.resumePoint` を条件付き追加

**Rationale**: `transitionJob` の `patch` は `Partial<Omit<JobState, ...>>` であり resumePoint を自由に設定できる（executor.ts の timeout パスが先例）。`state.step` は `string`（`StepName = string`）で型キャスト不要。

**変更内容**: 3 関数（`handleNoWorktreeExit` / `handlePerJobExit` / `handleGlobalExit`）の `transitionJob` 呼び出しに以下を追加:
```
patch: state.step
  ? { resumePoint: { step: state.step, reason: "signal", iterationsExhausted: 0 } }
  : undefined
```

**Alternatives considered**:
- reason の enum 化（"signal" | "timeout"）: `ResumePoint.reason` は `string` であり schema 変更を伴うためスコープ外
- global scan 経路だけ対応する案: 3 経路で同一問題が起きるため全経路対応が正しい

### D4: view コマンドの cwd 拒否ガードは既存 `detectSpecrunnerWorktree` + `worktreeGuardError` を流用

**Rationale**: `detectSpecrunnerWorktree` は `.git/specrunner-worktrees/` パターン解析で判定し、`worktreeGuardError` は `WORKTREE_GUARD` コード（exit 2）と main checkout 案内ヒントを含む。同機構を resume と統一することでユーザー体験・テスト容易性ともに向上する。

**変更内容**: `runPs` / `runJobShow` / `runJobStats` の各エントリーで、`JobStateStore.list` 呼び出しの前に worktree guard ブロックを挿入:
```
const wtResult = await detectSpecrunnerWorktree(cwd);
if (wtResult.isSpecrunnerWorktree) {
  const mainPath = wtResult.mainCheckoutPath ?? "<main checkout>";
  stderrWrite(worktreeGuardError("<コマンド名>", mainPath).message);
  stderrWrite(`Hint: Run from the main worktree: cd ${mainPath}`);
  return 2;
}
```
- `runPs`: cwd = `process.cwd()`（`opts.repoRoot` はテスト用 override のため guard では使わない）
- `runJobShow`: cwd = `process.cwd()`
- `runJobStats`: cwd = `opts.cwd`（既に cwd を引数で受け取っている）

**Alternatives considered**:
- `JobStateStore.list` で ENOTDIR を ENOENT 同様に握り潰す案: worktree 基準の誤った一覧を黙って返すためリジェクト（入口拒否が正しい層）
- `resolveRepoRoot()` の失敗を利用する案: worktree でも repoRoot は解決されてしまうため不十分

## Risks / Trade-offs

- **[Risk] prompt 変更がフィールドに即影響**: システムプロンプトの文言変更は次回 pipeline 実行から即時適用される。ただし変更は手順の更新（旧 gate → 新 gate）と禁止規律の追加のみで、エージェントの基本的な役割は変わらない。  
  *Mitigation*: テストで変更前の旧テキストが残っていないことを検証する。

- **[Risk] exit-guard の best-effort 性**: exit-guard 内はエラーを握り潰す設計のため、resumePoint の書き込みが失敗しても警告が出ない。  
  *Mitigation*: これは既存のトレードオフであり今回の変更スコープ外。resumePoint 追加で状況が悪化することはない。

- **[Risk] `runPs` の `opts.repoRoot` override と guard の整合**: テストは `opts.repoRoot` を使って tempDir を渡すが guard は `process.cwd()` を見る。テスト内で cwd がテスト tempDir でなければ guard は発火しない。  
  *Mitigation*: worktree guard のテストは `detectSpecrunnerWorktree` をモックして cwd を制御する。

## Open Questions

なし（architect 評価済みの設計判断が全 3 件の方向性を確定している）
