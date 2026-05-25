# Spec Review Result: remove-xdg-mode

- **verdict**: needs-fix
- **reviewer**: spec-reviewer
- **date**: 2026-05-24

---

## Summary

request の意図・設計方針・delta spec の構造はいずれも明確で、実装可能な品質に近い。ただし **`verbose-execution-log` delta spec の未更新箇所**が spec と実装の乖離を生む可能性があるため、修正が必要。

---

## Findings

### [MUST FIX] F1: `verbose-execution-log` delta spec — "logger 層の抽象化" Requirement が未更新

**場所**: `specrunner/changes/remove-xdg-mode/specs/verbose-execution-log/spec.md`

**問題**: delta spec は "ログファイルの配置と形式" Requirement のみを更新しているが、baseline の "logger 層の抽象化" Requirement には以下の記述が残る:

```
- `src/util/xdg.ts` に `resolveXdgStateDir()` ヘルパーを追加して `~/.local/state/specrunner/logs/` パス解決を集約する
```

この Requirement が未 MODIFIED のまま残ると、本 change 適用後の authority spec に「`resolveXdgStateDir()` が verbose log パス解決に使われる」という虚偽の記述が残る。tasks.md Task 1 では `resolveXdgStateDir()` の扱いを "test で使っているため export は残す（確認して不要なら削除）" と曖昧にしているが、いずれにせよ verbose log のパス解決目的ではなくなるため、spec は更新が必要。

**修正方針**: delta spec に `## Requirements` の `### Requirement: logger 層の抽象化` を追加し、`resolveXdgStateDir()` の verbose log 用途の記述を削除。また `initVerboseLog(repoRoot, jobId)` の signature 変更を本 Requirement に反映する。

---

### [SHOULD FIX] F2: tasks.md Task 7 — managed.ts 対応が TODO のまま

**場所**: `specrunner/changes/remove-xdg-mode/tasks.md` Task 7

**問題**: managed runtime の `storeFactory` 更新について「managed runtime は job state を書かないので影響なしか確認」と TODO が残っている。設計判断を implementer に委ねると、実装時に誤った対応をするリスクがある。

**修正方針**: design.md で managed runtime が `cwd` を持つか / job state を書かないかを確認し、Task 7 の managed.ts チェックボックスを「影響なしのため変更不要」または「要変更」のどちらかに確定する。

---

### [SHOULD FIX] F3: tasks.md Task 8 — `src/state/store.ts` の扱いが不確定

**場所**: `specrunner/changes/remove-xdg-mode/tasks.md` Task 8

**問題**: "deprecated wrappers に `repoRoot` parameter 追加（or 削除を検討、呼び出し元次第）" という記述は implementer が追加で調査・判断する必要を生む。

**修正方針**: 呼び出し元を確認済みであれば「削除する」または「引数追加する」のどちらかに確定して記述する。

---

## Approved Items

- request の背景・廃止理由（構造的脆弱性 + 利用者希薄）は明確で、アーキテクチャ上妥当
- design.md の D1（repoRoot parameter injection）は純粋関数化・テスト容易性・依存可視化の観点でいずれも適切
- `cli-config-store` delta spec: "設定ファイルは固定スキーマに従う" Requirement の header が baseline と一致しており MODIFIED として正しく処理される。`jobs` 廃止後の無視挙動のシナリオも網羅されている
- `job-state-store` delta spec: "ジョブ状態ファイルは固定パスに保存される" を repoRoot parameter 方式に正しく置換。XDG mode シナリオと setJobsLocation 前提シナリオが削除されている
- `verbose-execution-log` delta spec の "ログファイルの配置と形式" Requirement は XDG 分岐の削除と `initVerboseLog(repoRoot, jobId)` への変更が正確に記述されている
- 受け入れ基準はすべて検証可能な形式で記述されており、テスト対象が明確
- スコープ外（旧 XDG state file の移行・config/credentials パス変更・worktree 書き込み戦略）の明示は明確で実装スコープの滲み出しリスクが低い
- security: XDG silent fallback の削除は予測可能パスへの一本化であり、セキュリティ上のリグレッションなし。`git rev-parse` による repoRoot 取得は repo-bound tool として想定内

---

## Required Changes Before Approved

1. `specs/verbose-execution-log/spec.md` に `### Requirement: logger 層の抽象化` の MODIFIED 版を追加（`resolveXdgStateDir()` verbose 用途の削除 + `initVerboseLog(repoRoot, jobId)` の signature 反映）
2. `tasks.md` Task 7 の managed.ts TODO を確定した記述に更新
3. `tasks.md` Task 8 の `state/store.ts` 対応を確定した記述に更新（"or 削除を検討" を解消）
