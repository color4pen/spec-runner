# Spec Review Result

## 検証した項目

### 1. operator 適用内容の確認（前回 F1 / F2 の解消状況）

**F1 の解消確認**:  
`git diff HEAD~1 HEAD` で operator 適用 commit の内容を確認。T-04 の hint 文字列が
`"git commit / git push の手動操作は不要です。"` →
`"手動の git 操作 (commit / push) は不要です。"` に変更されていることを確認。
文字列 `"手動の git 操作 (commit / push)"` が `git commit` / `git push` を部分文字列として含まないことを
Python で検証済み（どちらも `False`）。`--apply-canon` を含むことも確認（`True`）。  
→ **F1 解消**。

**F2 の解消確認（部分）**:  
T-01 実装指示本文に `Throw on any git failure（fail-closed — spec-review F2）` 追記を確認。  
design.md D3 に同旨の説明追記を確認。  
→ 本文・設計層は更新済み。

### 2. T-01 Acceptance Criteria と T-07 TC-U4 の検証

T-01 **Acceptance Criteria**（tasks.md line 29）の現状:

```
- `detectCanonDirtyPaths` returns `[]` (not throws) when `git status` fails.
```

T-07 **TC-U4**（tasks.md line 174）の現状:

```
- [ ] **TC-U4**: `detectCanonDirtyPaths` returns `[]` (not throws) when `git status` exits non-zero.
```

上記は operator 適用 commit で**更新されていない**。  
T-01 本文「Throw on any git failure」と直接矛盾する。

### 3. spec.md アサーションの検証

spec.md の Scenario "hint text guides operator to --apply-canon" の negative assertion:
```
**And** `state.error.hint` does NOT contain `git push` or `git commit`
```
T-04 の新 hint 全文: `"...手動の git 操作 (commit / push) は不要です。"` は
`git push` / `git commit` を部分文字列として含まない（Python 検証済み）。  
→ spec.md との矛盾なし。

### 4. design.md の整合性

D3 に `git status 失敗は throw（fail-closed — spec-review F2）` を確認。本文と設計の整合は取れている。

### 5. spec.md、request.md の再精読

新規矛盾なし。operator 適用後の変更で spec.md は更新されていないことを確認（更新不要）。

### 6. T-06 / T-07 の受け入れ基準とテストカバレッジ

TC-R5 が hint の negative assertion を未テスト（OB-1 継続）。ただし hint 文字列自体は
`git commit` / `git push` を含まないため、低リスク。

---

## 検証できなかった項目

- `src/core/resume/` 配下の既存ファイルとの循環依存（前回と同様、architect 評価済みとして採用）。
- `git commit` 実行時の git user 設定がテスト環境で担保されているか（実装細目、spec レベル外）。

---

## Findings 詳細

### F3: T-01 Acceptance Criteria と T-07 TC-U4 が F2 fix の実装仕様（throw）と矛盾する

**問題**:  
T-01 実装本文は `Throw on any git failure（fail-closed）` と明記されているが、
同タスクの **Acceptance Criteria**（line 29）および T-07 **TC-U4**（line 174）は
`"returns [] (not throws) when git status fails"` と fail-open 挙動を期待するまま更新されていない。

実装者が Acceptance Criteria / TC-U4 に従って実装・テストすると:

1. `git status` 失敗時に `[]` を返す fail-open 実装を書く
2. TC-U4 は「throws しない（[] を返す）」ことをアサートするため、fail-open 実装でパスする
3. F2 fix 意図（fail-closed 保証）が機能しないまま全テストが green になる

→ R2「無言破棄の廃止」が `git status` 失敗経路で条件付き保証のままになる。

**修正箇所**:

- T-01 Acceptance Criteria (tasks.md line 29):  
  `returns [] (not throws)` → `throws an Error` に変更
- T-07 TC-U4 (tasks.md line 174):  
  `returns [] (not throws) when git status exits non-zero` → `throws when git status exits non-zero (mocked spawnFn returns non-zero exit)` に変更

---

### 観察事項（ブロックではない）

**OB-1: TC-R5 が spec.md の negative assertion を未カバー（継続）**  
TC-R5 に `assert(!hint.includes("git push"))` の対称テストがない。hint 文字列が実際に
`git push` / `git commit` を含まない実装となっている前提では低リスクだが、  
実装段階で hint 文言が変更された際に回帰しやすい。

**OB-3: R2 fail-closed 停止時点でジョブ状態が "running" になる（継続）**  
T-03 の apply-canon ゲートは "transition to running" ブロック後に実行されるため、
`--apply-canon` なしの dirty 停止で `PrepareError(1)` を throw するとジョブが `running` のまま残る。  
stale-detection が次回 resume で自動復旧するため機能的問題はないが、
design.md の Risks にこの経路が明示されていない。
