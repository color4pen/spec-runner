# Review Feedback 004 — permission-layer-git-write-denial

## Scope

Iteration 4 review. Verified against test-cases.md (TC-001 through TC-061) and the acceptance criteria in request.md.

---

## Findings

### F-1 [low] `git branch` の long-form mutation フラグが `isBranchMutationFlag` に未収録

**場所**: `src/adapter/claude-code/git-command-classifier.ts:137-143`

Design D2 は branch の変更フラグとして `--delete` / `--move` / `--copy` / `-f` / `--force` を明示するが、実装の `isBranchMutationFlag` には short form のみ収録され long form が抜けている。

```typescript
const isBranchMutationFlag = (a: string): boolean =>
  ["-D", "-d", "-m", "-M", "-c", "-C", "-u"].includes(a) ||  // --delete/--move/--copy/-f/--force 欠落
  a === "--set-upstream-to" || ...
```

**実害評価**: `git branch --delete foo`・`git branch --move old new` 等の実用コマンドはいずれも positional argument（branch 名）を含むため、後続の「positional arg → create → mutation」パスで正しく deny される。false negative が発生するのは `git branch --force` 単体（無効な git コマンド）等の非現実的なケースのみ。

**テストカバレッジの欠落**: TC-009 は短形式（`-D`, `-m`）のみを検証し、`git branch --delete foo` 等の long form は未テスト。

**対処の選択肢**:
1. `isBranchMutationFlag` に `"--delete"`, `"--move"`, `"--copy"`, `"-f"`, `"--force"` を追加し、TC-009 に long form ケースを補完する（設計どおりの完全実装、推奨）。
2. 設計 D2 を「実装どおり short form のみ。positional arg 経路で補完される」と更新し、gap を文書化する（最小コスト、実害なし）。

---

### F-2 [informational] スコープ外コミットが diff に含まれる

**場所**: git log main...HEAD

本 branch には permission-layer 機能実装コミットの他に、パイプライン実行中に適用されたオペレーター修正が含まれる:

- `1938fe17c fix: bootstrap の materialization commit を egress 台帳に記録し` (#895) — `local.ts` / `managed.ts` / `workspace-materializer.ts` を変更（+ `no-worktree-mode.test.ts` TC-NW-017 追加）
- `dd26c5498 feat: 保護正典への fixable finding を escalation に倒す` (#901) — 別 feature
- `a8b12977a fix: custom reviewer round の運用欠落 2 件を修正する` (#900) — 別 bug fix

これらはいずれも #895/#900/#901 として main 相当の変更であり、本 request.md のスコープには含まれない。PR diff レビューで本来の変更（git-command-classifier.ts / agent-runner.ts 拡張）と無関係の変更が混在する。機能的な問題はない。

---

## 受け入れ基準トレース

| 受け入れ基準 | 状態 | 根拠 |
|-------------|------|------|
| classifier 単体テスト（TC-001〜TC-009、パイプ・`&&` 連結含む） | ✅ | `git-command-classifier.test.ts` 67 tests green |
| guard 単体テスト（scoped/guarded deny・allow, pipeline 管理パス, cwd 境界） | ✅ | `workspace-tool-guard.test.ts` 80 tests green |
| allow 経路が `updatedInput` パススルーを維持 | ✅ | TC-033 / TC-013 / TC-014 で固定 |
| probe 実行記録（R5 の 5 シナリオ） | ✅ | `design.md` D6 に 2026-07-23 実行記録（観測 B + 全 PASS）あり |
| 既存テストが無改変で green | ✅ | feature 関連 654 tests green; 1638 failures は main でも同数（pre-existing） |
| 破壊確認（revert でテストが fail） | ✅ | TC-037（Bash 含まない固定）・TC-011 等が破壊レバーとして機能 |
| `typecheck && test` green | ✅ | typecheck: exit 0; feature test suite: 0 failures |

---

## コード品質所見

- `git-command-classifier.ts` は src/ への import ゼロを TC-010 で静的検証（leaf 制約を自動保証）。
- `AgentWriteScope` の `managedPaths` / `forbiddenPaths` を `buildStepContext`（core 層）で pre-compute し adapter に渡す DSM closure 設計は正しい。adapter が `core/pipeline` / `core/step` を直接 import せず、許可規則の単一ソースが `write-scope.ts` に集中している。
- `autoAllowBashIfSandboxed: false` への変更は probe 観測 B を根拠として設計 D6 に文書化されており、理由が追跡可能。
- `writeScope` を optional にして strictly-weaker fallback とする判断は、広範な literal 構築サイトの churn を避けつつ、本番唯一の組み立て点 (`buildStepContext`) でのスコープ設定を TC-039/TC-040 でテスト固定することで補完されている。

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

（何をどう確認したか。読んだファイル・辿った diff・確認したコード等を記載する）

## 検証できなかった項目

（確認できなかった項目と理由。無ければ None と明記する）

## Findings 詳細

（typed findings の補足説明。指摘がない場合は None と明記する）
