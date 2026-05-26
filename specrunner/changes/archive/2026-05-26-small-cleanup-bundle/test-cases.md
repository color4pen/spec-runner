# Test Cases: small-cleanup-bundle

## #370: module-boundary spec の grep pattern 更新

### TC-MB-01: grep pattern が新 SDK 名に更新されている

- **Category**: spec correctness
- **Priority**: must
- **Source**: tasks.md Task 1 / request.md 受け入れ基準

**GIVEN** `specrunner/specs/module-boundary/spec.md` の変更が適用されている  
**WHEN** L42 の grep pattern を確認する  
**THEN** pattern は `@anthropic-ai/(sdk|claude-agent-sdk)` である

---

### TC-MB-02: 旧パターン `claude-code` が L42 から削除されている

- **Category**: spec correctness
- **Priority**: must
- **Source**: tasks.md Task 1 / request.md 受け入れ基準

**GIVEN** `specrunner/specs/module-boundary/spec.md` の変更が適用されている  
**WHEN** L42 の grep pattern を確認する  
**THEN** `claude-code` は alternation に含まれない（`sdk|claude-agent-sdk` のみ）

---

### TC-MB-03: L39 の prose が新 SDK 名を参照している

- **Category**: spec correctness
- **Priority**: must
- **Source**: tasks.md Task 1（prose 更新）

**GIVEN** `specrunner/specs/module-boundary/spec.md` の変更が適用されている  
**WHEN** L39 の Requirement prose を確認する  
**THEN** `@anthropic-ai/claude-agent-sdk` が記載されている  
**AND** `@anthropic-ai/claude-code` への参照が削除されている

---

### TC-MB-04: L51–54 の独立 scenario は変更されていない（スコープ外）

- **Category**: scope guard
- **Priority**: should
- **Source**: request.md スコープ外

**GIVEN** `specrunner/specs/module-boundary/spec.md` の変更が適用されている  
**WHEN** L51–54 付近の「Claude Code SDK imports concentrated in claude-code adapter」scenario を確認する  
**THEN** `@anthropic-ai/claude-code` の参照はそのまま残っている（本 request では変更しない）

---

### TC-MB-05: `@anthropic-ai/claude-agent-sdk` を直接 import する core ファイルが guard に引っかかる

- **Category**: functional correctness (guard が有効か)
- **Priority**: should
- **Source**: request.md 背景 #370（false-negative 修正の目的）

**GIVEN** `src/core/` 配下のファイルが `@anthropic-ai/claude-agent-sdk` を import している  
**WHEN** 更新後の grep pattern (`grep -rE "from ['\"]@anthropic-ai/(sdk|claude-agent-sdk)" src/core/`) を実行する  
**THEN** そのファイルがマッチし exit code 0 が返る（= guard が機能する）

---

## #406: ensureDotSpecrunnerGitignore の Exception 行 dedup

### TC-GI-12: `!.specrunner/config.json` の重複行が 1 行に集約される

- **Category**: functional correctness
- **Priority**: must
- **Source**: tasks.md Task 3 / request.md 受け入れ基準

**GIVEN** `.gitignore` が以下の内容を持つ:
```
.specrunner/*
!.specrunner/config.json
node_modules/
!.specrunner/config.json
```
**WHEN** `ensureDotSpecrunnerGitignore()` を実行する  
**THEN** `.gitignore` 内の `!.specrunner/config.json` 行はちょうど 1 行である  
**AND** `.specrunner/*` 行も 1 行である  
**AND** `node_modules/` は保持される

---

### TC-GI-13: Exception dedup は先頭出現を保持する（first-occurrence ルール）

- **Category**: functional correctness
- **Priority**: must
- **Source**: design.md D2（first occurrence を keep）

**GIVEN** `.gitignore` が以下の内容を持つ:
```
.specrunner/*
!.specrunner/config.json
dist/
!.specrunner/config.json
```
**WHEN** `ensureDotSpecrunnerGitignore()` を実行する  
**THEN** `.gitignore` に `!.specrunner/config.json` が 1 行だけ残る  
**AND** その行は `dist/` より前（先頭出現位置）にある

---

### TC-GI-14: glob と exception 両方が重複している場合に両方が dedup される

- **Category**: functional correctness
- **Priority**: should
- **Source**: design.md D2 / 既存 Step 2 との組み合わせ

**GIVEN** `.gitignore` が以下の内容を持つ:
```
.specrunner/*
!.specrunner/config.json
node_modules/
.specrunner/*
!.specrunner/config.json
```
**WHEN** `ensureDotSpecrunnerGitignore()` を実行する  
**THEN** `.specrunner/*` が 1 行、`!.specrunner/config.json` が 1 行のみ残る

---

### TC-GI-15: Exception 行のみが重複（glob は重複なし）の場合も正しく dedup される

- **Category**: edge case
- **Priority**: should
- **Source**: tasks.md Task 3

**GIVEN** `.gitignore` に `.specrunner/*` が 1 行、`!.specrunner/config.json` が 3 行ある  
**WHEN** `ensureDotSpecrunnerGitignore()` を実行する  
**THEN** `!.specrunner/config.json` は 1 行だけ残る  
**AND** `.specrunner/*` は 1 行のまま変化しない

---

### TC-GI-16: Exception dedup 後も idempotency が維持される

- **Category**: idempotency
- **Priority**: must
- **Source**: request.md 背景 #406（idempotency の不完全修正）

**GIVEN** 重複 Exception 行を含む `.gitignore` に対し `ensureDotSpecrunnerGitignore()` を 1 回実行した後の状態がある  
**WHEN** `ensureDotSpecrunnerGitignore()` をもう 1 回実行する  
**THEN** `.gitignore` の内容は変化しない

---

## 全体品質ゲート

### TC-QG-01: typecheck が green

- **Category**: build quality
- **Priority**: must
- **Source**: request.md 受け入れ基準

**GIVEN** 本 change の全変更が適用されている  
**WHEN** `bun run typecheck` を実行する  
**THEN** exit code 0 で完了する

---

### TC-QG-02: テストスイートが green

- **Category**: build quality
- **Priority**: must
- **Source**: request.md 受け入れ基準

**GIVEN** 本 change の全変更が適用されている  
**WHEN** `bun run test` を実行する  
**THEN** 全テストが pass し exit code 0 で完了する  
**AND** TC-GI-12 が新規テストとして含まれている
