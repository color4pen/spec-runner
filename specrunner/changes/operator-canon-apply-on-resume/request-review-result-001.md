# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### 1. コード前提アサーション（全 5 件を実コードで確認）

**CANON_FINDING_ESCALATION hint（`src/core/step/commit-orchestrator.ts:369`）**  
実コード（lines 363–372）を読み、hint が「手動で修正し、job resume で再開してください」と案内しており、commit / push への言及がないことを確認。request の記述と一致。

**scoped 残余検査（`src/core/step/commit-push.ts`）**  
scoped モード（lines 447–504）: `getWorktreeChangedPaths(worktreeOnly=true)` → `findScopedCommitViolations` + `findWriteScopeViolations` → `quarantineViolationEvidence` → `restoreViolatedPaths` → `writeScopeViolationError` の流れを確認。step 開始前から存在する worktree 変更と step 自身の書込を区別せず、保護正典パスへの変更を検出すると退避 + 復元 + WRITE_SCOPE_VIOLATION halt することを確認。

**egress 照合（`src/core/step/commit-push.ts:runInlineEgressCheck`）**  
lines 352–381: `git rev-list HEAD --not --remotes=origin` を使用し、publish 範囲のすべての OID が `synthesizedCommits` 台帳に含まれることを要求する。operator の手 commit は push 済みなら照合外になるが、未 push の場合は EGRESS_UNKNOWN_COMMIT になることを確認。

**resume 入口（`src/core/command/resume.ts:ResumeCommand.prepare()`）**  
全 289 行を読み、worktree dirty 検査・operator 変更の取り込み機構が存在しないことを確認。CLI フラグ定義（`src/cli/command-registry.ts` lines 574–637）にも `--apply-canon` が存在しないことを確認。

**`appendSynthesizedCommit`（`src/state/schema/operations.ts:35–39`）**  
pure function で、引数 `state` を破壊変更せず新 state を返す。OID が既存台帳に含まれる場合は元 state を変更なしで返す（冪等）。request の "pure・冪等" 記述と一致。

### 2. 保護正典パスの定義確認（`src/core/step/write-scope.ts:protectedCanonPaths`）

```
requestMdPath(slug)
${folder}/spec.md
${folder}/design.md
${folder}/tasks.md
${folder}/test-cases.md
factCheckAttestationPath(slug)
```

R1 の「保護正典パスに限って」がこの集合を指すことを確認。canon escalation が発生する条件（conformance/judge が spec.md 等への fixable finding を返し、fixer がその path への書込を宣言していない）と整合する。

### 3. 設計整合性の確認

- `--apply-canon` commit が明示 pathspec（保護正典パスのみ）で作成されると、worktree がその経路でクリーンになる → 再開 step の write-scope 残余検査が衝突しなくなる（設計の意図と実装の整合が取れている）
- `appendSynthesizedCommit` で OID を台帳に記録すると、`runInlineEgressCheck` が `rev-list HEAD --not --remotes=origin` で見つけた commit を既知として認識できる
- R2 の fail-closed（flag なし resume + 保護正典 dirty → stop）は、現行の無言破棄を廃止する明確な改善
- architect 評価済み設計判断（explicit flag 必須・自動取り込み禁止）は `#893 台帳 = pipeline が構成した commit` の意味論を保つ観点で適切

### 4. 受け入れ基準の確認

7 項目すべてがテスト可能な具体的条件として記述されている。統合テスト（実 store + 実 git）が要求されており、機械検証として十分。

## 検証できなかった項目

None。すべての前提アサーションを実コードで確認できた。

## Findings 詳細

None。指摘事項なし。
