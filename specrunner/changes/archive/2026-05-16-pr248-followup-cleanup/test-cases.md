# Test Cases: pr248-followup-cleanup

## Overview

PR #248 followup の dead code 削除と test 品質改善に対するテストシナリオ。
機能変更はなく、すべて structural / documentation の整理が対象。

---

## TC-001: runGhPrCreate の完全削除

- **Category**: Dead Code Removal
- **Priority**: must
- **Source**: Task 1 / 受け入れ基準

### TC-001-A: シンボル削除の確認

**GIVEN** `src/core/gh/pr.ts` が削除されている  
**WHEN** `grep -r "runGhPrCreate" src/ tests/` を実行する  
**THEN** 0 hit であること（シンボルがどこにも残っていない）

### TC-001-B: 型定義の削除確認

**GIVEN** `src/core/gh/pr.ts` が削除されている  
**WHEN** `grep -r "GhPrCreateInput\|GhPrCreateResult" src/ tests/` を実行する  
**THEN** 0 hit であること

### TC-001-C: ファイル削除後の typecheck

**GIVEN** `src/core/gh/pr.ts` が削除されており、他のファイルから import がない  
**WHEN** `bun run typecheck` を実行する  
**THEN** エラーなく green で完了すること

---

## TC-002: createRuntime の githubToken required 化

- **Category**: API Safety / Compile-time Safety
- **Priority**: must
- **Source**: Task 2 / 受け入れ基準

### TC-002-A: signature から default 値が消えている

**GIVEN** `src/core/runtime/factory.ts` が編集されている  
**WHEN** `grep "githubToken" src/core/runtime/factory.ts` を実行する  
**THEN** `githubToken: string = ""` ではなく `githubToken: string` の形で定義されていること（`= ""` が存在しない）

### TC-002-B: production caller は引き続き明示的に値を渡している

**GIVEN** `src/cli/run.ts` と `src/cli/bootstrap.ts` が `resolveGitHubToken()` の結果を `createRuntime` に渡している  
**WHEN** `bun run typecheck` を実行する  
**THEN** エラーなく green で完了すること

### TC-002-C: factory テストが第 6 引数 "" を渡している（TC-RT-001）

**GIVEN** `tests/unit/core/runtime/factory.test.ts:48` が `createRuntime(buildLocalConfig(), "/repo", githubClient, repo, undefined, "")` の形で呼ばれている  
**WHEN** `bun run test tests/unit/core/runtime/factory.test.ts` を実行する  
**THEN** テストが全件 green で完了すること

### TC-002-D: factory テストが第 6 引数 "" を渡している（TC-RT-002, TC-RT-003）

**GIVEN** `tests/unit/core/runtime/factory.test.ts:60` と `tests/unit/core/runtime/factory.test.ts:72` が `createRuntime` の第 6 引数に `""` を渡している  
**WHEN** `bun run typecheck` を実行する  
**THEN** エラーなく green で完了すること

---

## TC-003: ManagedRuntime constructor の githubToken required 化

- **Category**: API Safety / Compile-time Safety
- **Priority**: must
- **Source**: Task 3 / 受け入れ基準

### TC-003-A: signature から default 値が消えている

**GIVEN** `src/core/runtime/managed.ts` が編集されている  
**WHEN** `grep "githubToken" src/core/runtime/managed.ts` を実行する  
**THEN** `private readonly githubToken: string = ""` ではなく `private readonly githubToken: string` の形で定義されていること

### TC-003-B: managed テストが第 6 引数 "" を渡している（全 5 箇所）

**GIVEN** `tests/unit/core/runtime/managed.test.ts` の `new ManagedRuntime(...)` 呼び出し 5 箇所（lines 53, 67, 80, 97, 114）に第 6 引数 `""` が追加されている  
**WHEN** `bun run typecheck` を実行する  
**THEN** エラーなく green で完了すること

### TC-003-C: managed テストが引き続き全件 pass する

**GIVEN** `tests/unit/core/runtime/managed.test.ts` が `""` を明示的に渡している  
**WHEN** `bun run test tests/unit/core/runtime/managed.test.ts` を実行する  
**THEN** テストが全件 green で完了すること

### TC-003-D: factory → ManagedRuntime への token 受け渡しが正しい

**GIVEN** `src/core/runtime/factory.ts` が `githubToken` を required で受け取り `ManagedRuntime` に転送している  
**WHEN** `bun run typecheck` を実行する  
**THEN** エラーなく green で完了すること

---

## TC-004: TC-041 description の更新

- **Category**: Test Documentation Quality
- **Priority**: should
- **Source**: Task 4 / 受け入れ基準

### TC-004-A: description テキストが新挙動を反映している

**GIVEN** `tests/unit/config/runtime-config.test.ts:344` が編集されている  
**WHEN** `grep "TC-041" tests/unit/config/runtime-config.test.ts` を実行する  
**THEN** description が `"TC-041: checkConfigComplete always returns null (GitHub token check moved to runPreflight)"` またはこれに相当する新挙動を語る文言であること

### TC-004-B: 旧 description が残っていない

**GIVEN** `tests/unit/config/runtime-config.test.ts` が編集されている  
**WHEN** `grep "githubToken\|GITHUB_TOKEN" tests/unit/config/runtime-config.test.ts` を実行する（description 行のみ確認）  
**THEN** TC-041 の describe/it テキストに旧挙動（GitHub token check）を示す表現が残っていないこと

### TC-004-C: テストが引き続き green

**GIVEN** TC-041 の description のみが変更され、テストロジック自体は変更されていない  
**WHEN** `bun run test tests/unit/config/runtime-config.test.ts` を実行する  
**THEN** テストが全件 green で完了すること

---

## TC-005: TC-CRED-004 への file mode assert 追加

- **Category**: Test Coverage Improvement
- **Priority**: must
- **Source**: Task 5 / 受け入れ基準

### TC-005-A: 0o600 assert が追加されている

**GIVEN** `tests/core/credentials/github.test.ts` の TC-CRED-004 ブロックが編集されている  
**WHEN** `grep "0o600\|0777\|mode" tests/core/credentials/github.test.ts` を実行する  
**THEN** `expect(stat.mode & 0o777).toBe(0o600)` またはこれに相当する mode assert が存在すること

### TC-005-B: assert が saveCredentials 呼び出し直後に配置されている

**GIVEN** TC-CRED-004 の it ブロック内に `fs.stat(credPath())` と mode assert が追加されている  
**WHEN** テストコードを目視確認する  
**THEN** `saveCredentials` の呼び出し後、`loadCredentials` の前に mode assert が配置されていること

### TC-005-C: TC-CRED-004 が green で pass する

**GIVEN** mode assert が追加されており、`saveCredentials` が実際に 0o600 でファイルを書き込む実装になっている  
**WHEN** `bun run test tests/core/credentials/github.test.ts` を実行する  
**THEN** TC-CRED-004 を含む全テストが green で完了すること

### TC-005-D: mode assert が実装のバグを検出できる（回帰防止）

**GIVEN** `saveCredentials` が将来 0o644 等の安全でない mode でファイルを書く実装に変更されたと仮定する  
**WHEN** `bun run test tests/core/credentials/github.test.ts` を実行する  
**THEN** TC-CRED-004 が fail し、mode の退行を検出できること（設計上の期待）

---

## TC-006: loadCredentials catch block コメントの修正

- **Category**: Code Documentation Quality
- **Priority**: should
- **Source**: Task 6 / 受け入れ基準

### TC-006-A: 旧コメントが消えている

**GIVEN** `src/core/credentials/github.ts` の catch block が編集されている  
**WHEN** `grep "treat as empty" src/core/credentials/github.ts` を実行する  
**THEN** 0 hit であること（旧コメントが残っていない）

### TC-006-B: 新コメントが意図を説明している

**GIVEN** `src/core/credentials/github.ts` の catch block が編集されている  
**WHEN** `grep -A2 "Malformed JSON" src/core/credentials/github.ts` を実行する  
**THEN** `resolveGitHubToken` と env-var fallback / throw の流れを説明するコメントが存在すること

### TC-006-C: 動作変更がない

**GIVEN** コメントのみが変更されており、catch block の実装コードは変更されていない  
**WHEN** `bun run test tests/core/credentials/github.test.ts` を実行する  
**THEN** credentials 関連テストが全件 green で完了すること

---

## TC-007: 全体 typecheck & test green

- **Category**: Integration
- **Priority**: must
- **Source**: Final Verification / 受け入れ基準

### TC-007-A: typecheck が green

**GIVEN** Tasks 1–6 の変更がすべて適用されている  
**WHEN** `bun run typecheck` を実行する  
**THEN** 型エラーが 0 件でコマンドが正常終了すること

### TC-007-B: 全テストが green

**GIVEN** Tasks 1–6 の変更がすべて適用されており、テスト呼び出しの引数修正と assert 追加が完了している  
**WHEN** `bun run test` を実行する  
**THEN** 全テストスイートが green で完了すること（既存 pass テストが regression しない）
