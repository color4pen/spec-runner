# Regression Gate Result — operator-guide iteration 1

## Evidence

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| 1 | spec.md「コマンド実在」Scenario が抽出制限を明記していない | MEDIUM | ✅ Fixed |
| 2 | TC-013: merge/audit/setup/request/inject の 5 topic でコマンド実在検証がゼロ | MEDIUM | ✅ Fixed |
| 3 | guide --help summary 行の topic 一覧が GUIDE_TOPICS 非依存の手書き | LOW | ✅ Fixed |
| 4 | TC-009: runInit 統合でなく buildClaudeMdSnippet() 単体のみ検証 | LOW | ✅ Fixed |
| 5 | コメント「4 required fields」が実装と乖離 | LOW | ✅ Fixed |
| 6 | function JSDoc says 'All 4 fields' while implementation has 5 elements | LOW | ❌ Still present |

## Detail

### Finding 1 — FIXED

`specrunner/changes/operator-guide/spec.md` の「本文コマンドが registry で解決される」Scenario の
Given 句に「抽出対象は backtick 内の完全形 `specrunner <tokens>` のみ。shorthand 表記や backtick 外の
言及は検証対象外」が明記された。

### Finding 2 — FIXED

`src/core/command/__tests__/guide.test.ts` の末尾(line 602–669)に describe ブロック
`TC-013 direct: merge/audit/setup/request/inject topic コマンドが registry で解決される` が追加され、
5 topic の主要コマンド(`specrunner job ls` / `specrunner init` / `specrunner doctor` 等)を
`resolveCommand` で直接検証する assert が追加された。

### Finding 3 — FIXED

`src/cli/command-registry.ts` line 1493 の help.summary が
```
`  guide [topic]                   運用ガイドを表示 (topics: ${GUIDE_TOPICS.map((t) => t.name).join(" ")})`
```
に変更され、topic 一覧は `GUIDE_TOPICS` から動的に導出されている。手書き列挙は存在しない。

### Finding 4 — FIXED

`src/cli/__tests__/init-snippet.test.ts` が新規追加され、`runInit` → `stdoutWrite` の統合経路を
mock 経由で検証する integration test が実装された。`buildClaudeMdSnippet()` の内容が
`stdoutWrite` の call 引数に含まれることを `toContain` で固定している。

### Finding 5 — FIXED

`src/core/finish/escalation.ts` line 3 のファイル先頭コメントが
`TC-023: formatEscalation must include 5 required fields:` に変更済み。

### Finding 6 — STILL PRESENT (regression)

`src/core/finish/escalation.ts` line 16 の function-level JSDoc:

```ts
/**
 * Format an escalation block for stdout output.
 * All 4 fields are required and will always appear in the output.
 */
```

`All 4 fields` の記述が残っており、ファイル先頭コメント(5 fields)および実際の出力(5 要素)と
矛盾している。Finding 5 の対応でファイル先頭は修正されたが、関数 JSDoc は未修正のまま。
