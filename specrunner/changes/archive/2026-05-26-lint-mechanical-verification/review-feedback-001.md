# Code Review Feedback — lint-mechanical-verification — iter 1

- **verdict**: needs-fix

---

## Summary

全体的に実装品質は高い。config schema validation・normalizeCommands・runner 分岐ロジック・dead code 修正・eslint 設定のすべてが仕様通りに動作しており、bun run lint / typecheck / test は green。ただし D6「failure output の表示ルール」の実装が未完成で、それに対応する must-priority test cases (E-01/E-02) も未カバーのため `needs-fix`。

---

## Findings

### F-01 — D6 failure message format が実装されていない（P2）

**場所**: `src/core/verification/runner.ts` の `runVerificationCommands()` および `writeVerificationResult()`

**問題**: design.md D6 は以下を明示している:

> failure output: `name` があれば「`Step '<name>' failed`」、無ければ command 自体を表示

しかし実装は failure を `## Phase: <label>` セクションヘッダーと位相テーブルで表現するのみで、`Step '<name>' failed` という文字列はどこにも生成されていない。test-cases.md の E-01/E-02 (both must-priority) も以下を要求している:

- E-01: `failure output に 'Step 'type' failed' が含まれる`
- E-02: `failure output に 'Step 'mypy' failed' が含まれる`

これらのテストは `runner-commands.test.ts` に存在しない。

**修正案**: 2 通りの解釈がある。設計意図を確認して対応を選択すること。

1. **interpretation A** (D6 をリテラルに解釈): 失敗した phase の `writeVerificationResult` 出力に `Step '<label>' failed` 行を追加する
2. **interpretation B** (D6 は「label として name を使う」という意味): E-01/E-02 の test cases を「phase field に label が設定されている」を確認するよう書き換え、D6 の記述を実装に合わせて clarify する

---

### F-02 — commands path の skipped message が不正確（P3）

**場所**: `src/core/verification/runner.ts` L145

```typescript
lines.push("_(skipped — script not found in package.json)_");
```

この行は `writeVerificationResult` で共有されており、commands path でのフェイルファスト skip にも同じメッセージが出力される。commands path での skip は「script not found」ではなく「先行コマンドが失敗したため skip」が正しい意味。

**修正案**: `writeVerificationResult` に `path: "commands" | "phases"` を渡すか、または skip 時の stdout メッセージをコールサイドで設定する。

---

### F-03 — spawnCommand の専用ユニットテストがない（P3）

**場所**: `tests/unit/verification/` — 対応する test file なし

test-cases.md の C-01/C-02/C-03 (all must-priority) は `spawnCommand` の動作を直接テストすることを想定している。現状は `runner-commands.test.ts` の TC-VR-01/TC-VR-02/TC-VR-04 で統合的にカバーされているが、`spawnCommand` 単体での exit code / shell operator 動作の検証がない。

TC-VR-04 が `"ruff check || true"` で `||` 演算子を間接的にテストしており、C-04 相当は実質カバーされている。しかし `spawnCommand("exit 0", ...)` / `spawnCommand("exit 1", ...)` での exit code 確認 (C-01/C-02) と `&&` 連結 (C-03) の明示的テストは欠損している。

---

### F-04 — verification-result.md が phase fallback 経路で生成されている（観察）

`specrunner/changes/lint-mechanical-verification/verification-result.md` の phase labels が `build`, `typecheck`, `test`, `lint` となっており、commands 経路 (labels = `bun run build`, `bun run typecheck`, ...) ではなく phase fallback 経路を使用している。`.specrunner/config.json` の `verification.commands` は設定済みだが、pipeline 実行時点の `deps.config` が commands path を渡せていなかった可能性がある。

H-02/H-03 の受け入れ基準（dogfood verify pipeline で commands 経路が実行される）を実際の pipeline 実行で検証できていない。実装コード自体は正しいため blocking ではないが、今後の dogfood 実行で commands path が確実に使われることを確認する。

---

## Test Coverage Summary

| Category | Must-priority | Covered |
|----------|--------------|---------|
| A (Config Schema Validation) | A-01〜A-10 | ✅ 全カバー (TC-VERIF-01〜08) |
| B (Command Normalization) | B-01〜B-04 | ✅ 全カバー (TC-CMD-01〜05) |
| C (Command Execution) | C-01, C-02, C-03 | ⚠️ 統合的カバーあり、専用テストなし |
| D (Verification Runner Branching) | D-01〜D-04, D-06, D-07 | ✅ 全カバー (TC-VR-01〜07) |
| E (Failure Output Display) | E-01, E-02 | ❌ 未カバー (F-01 参照) |
| F (Backward Compatibility) | F-01, F-02, F-03 | ✅ 全カバー (TC-VR-05〜06) |
| G (ESLint Setup) | G-01, G-02, G-03, G-04, G-06, G-07 | ✅ 実行確認済み |
| H (Dogfood Integration) | H-01, H-02, H-03 | ⚠️ H-01 ✅、H-02/H-03 実行未確認 (F-04 参照) |
| I (Documentation) | I-01, I-02 | ✅ 確認済み |

---

## Quality Observations (non-blocking)

- `src/core/verification/commands.ts` の `spawnCommand`: `child.on("error")` で reject せず resolve(exitCode:1) しているのは意図的な graceful handling として適切。
- `eslint.config.js` の `argsIgnorePattern` + `varsIgnorePattern: "^_"` は設計通り。
- `writeVerificationResult` の `iterNum = 1` コメント付きハードコードは既存挙動の継続で許容範囲（caller が full path を渡す設計のため）。
- dead code 11 件の修正はすべて確認済み。`bun run lint` exit code 0。
