# Test Cases: progress.ts の出力を mask seam 経由にし B-7 を cli へ拡張する

<!-- FORMAT REQUIREMENTS:
Test Case heading format: `### TC-{NNN}: {Name}` (3-digit zero-padded, e.g. TC-001)

Required fields per test case:
  **Category**: unit | integration | manual
  **Priority**: must | should | could
  **Source**: reference to design.md or tasks.md section

GIVEN/WHEN/THEN structure (required for each test case):
  **GIVEN** <preconditions>
  **WHEN** <action>
  **THEN** <expected result>

Category determination:
  unit        — pure logic, validation, helper functions (automated)
  integration — DB operations, API endpoints, multi-module interaction (automated)
  manual      — UI/UX confirmation, visual verification, build artifact check (not automated)

Priority determination:
  must   — core functionality; if broken, the feature does not work
  should — important but core still works; edge cases, error handling
  could  — nice to have; performance, UX details

Summary section MUST appear immediately after the title with ALL 4 items:
  ## Summary
  - **Total**: {count} cases
  - **Automated** (unit/integration): {count}
  - **Manual**: {count}
  - **Priority**: must: {count}, should: {count}, could: {count}

Result section MUST appear at the very end as a YAML code block:
  ## Result
  ```yaml
  result: completed | partial | failed
  total: {count}
  automated: {count}
  manual: {count}
  must: {count}
  should: {count}
  could: {count}
  blocked_reasons: []
  ```

  result determination:
    completed — all testable behaviors are documented
    partial   — some cases could not be derived due to design ambiguity
    failed    — required design artifacts (design.md, tasks.md) are missing
-->

## Summary

- **Total**: 32 cases
- **Automated** (unit/integration): 32
- **Manual**: 0
- **Priority**: must: 29, should: 3, could: 0

---

### TC-001: progress.ts が maskSensitive を import する

**Category**: unit  
**Priority**: must  
**Source**: tasks.md T-01

**GIVEN** `src/cli/progress.ts` のソースコード  
**WHEN** import 文の一覧を確認する  
**THEN** `import { maskSensitive } from "../logger/stdout.js"` が存在する

---

### TC-002: progress.ts 内の全 process.stderr.write が maskSensitive でラップされている

**Category**: unit  
**Priority**: must  
**Source**: tasks.md T-01 AC

**GIVEN** T-01 適用後の `src/cli/progress.ts`  
**WHEN** `process\.stderr\.write\s*\(` を grep する  
**THEN** マッチする全行に `maskSensitive(` が含まれており、raw write が 0 件である

---

### TC-003: step:start イベントで step 名が maskSensitive を経由して出力される

**Category**: unit  
**Priority**: must  
**Source**: tasks.md T-01, request 要件 #1

**GIVEN** ProgressDisplay が non-quiet モードで初期化されている  
**WHEN** `step:start` イベントを `{ step: "my-step" }` で発火する  
**THEN** `process.stderr.write` の引数が `maskSensitive("[my-step] running...\n")` の形式で呼ばれる

---

### TC-004: step:complete イベントで step 名・elapsed が maskSensitive を経由して出力される

**Category**: unit  
**Priority**: must  
**Source**: tasks.md T-01

**GIVEN** ProgressDisplay が non-quiet モードで動作し、step:start 済みである  
**WHEN** `step:complete` イベントを `{ step: "my-step" }` で発火する  
**THEN** `process.stderr.write` の引数が `maskSensitive("[my-step] ✓ (Ns)\n")` 形式でラップされている

---

### TC-005: step:error イベントで step 名・elapsed が maskSensitive を経由して出力される

**Category**: unit  
**Priority**: must  
**Source**: tasks.md T-01

**GIVEN** ProgressDisplay が non-quiet モードで動作し、step:start 済みである  
**WHEN** `step:error` イベントを `{ step: "my-step", error: new Error("oops") }` で発火する  
**THEN** `process.stderr.write` の引数が `maskSensitive("[my-step] ✗ error (Ns)\n")` 形式でラップされている

---

### TC-006: pipeline:fail の reason が maskSensitive を経由して出力される

**Category**: unit  
**Priority**: must  
**Source**: tasks.md T-01, request 背景（p.reason への secret tail risk）

**GIVEN** ProgressDisplay が初期化されている  
**WHEN** `pipeline:fail` イベントを `{ reason: "some error text" }` で発火する  
**THEN** `process.stderr.write(maskSensitive("Pipeline failed: some error text\n"))` が呼ばれる

---

### TC-007: pipeline:fail の reason に secret が含まれる場合にマスクされる

**Category**: unit  
**Priority**: must  
**Source**: request 背景（p.reason への secret tail risk）、design D1

**GIVEN** `p.reason` に API キー等の secret パターン（例: `sk-ant-XXXXXX`）が含まれる  
**WHEN** `maskSensitive("Pipeline failed: sk-ant-XXXXXX\n")` が呼ばれる  
**THEN** secret 部分がマスクされた文字列が返り、raw な secret が stderr に出力されない

---

### TC-008: pipeline:complete で slug が maskSensitive を経由して出力される

**Category**: unit  
**Priority**: must  
**Source**: tasks.md T-01

**GIVEN** ProgressDisplay が slug `"my-slug"` で初期化されている  
**WHEN** `pipeline:complete` イベントを発火する  
**THEN** `process.stderr.write(maskSensitive("\nNext: specrunner job finish my-slug\n"))` が呼ばれる

---

### TC-009: verdict:parsed で verdict が maskSensitive を経由して出力される

**Category**: unit  
**Priority**: must  
**Source**: tasks.md T-01

**GIVEN** ProgressDisplay が non-quiet モードで動作している  
**WHEN** `verdict:parsed` イベントを `{ step: "s", outcome: { verdict: "pass" } }` で発火する  
**THEN** `process.stderr.write(maskSensitive("[s] verdict: pass\n"))` が呼ばれる

---

### TC-010: TTY モードで ANSI 制御文字（\r\x1b[K）も maskSensitive を経由し出力が不変

**Category**: unit  
**Priority**: must  
**Source**: tasks.md T-01, design D3, request 受け入れ基準「ANSI 制御含む見た目が不変」

**GIVEN** TTY モード（`isTTY: true`）で ProgressDisplay が動作している  
**WHEN** `step:complete` / `step:error` による `"\r\x1b[K"` 出力処理が実行される  
**THEN** `process.stderr.write(maskSensitive("\r\x1b[K"))` の形式で呼ばれ、出力は `"\r\x1b[K"` のままである（maskSensitive は token にマッチしないため identity）

---

### TC-011: TTY モードのハートビートで行内容が maskSensitive を経由して出力される

**Category**: unit  
**Priority**: must  
**Source**: tasks.md T-01

**GIVEN** TTY モード（`isTTY: true`）かつ default logLevel の ProgressDisplay でハートビートが発火する  
**WHEN** `renderHeartbeat()` が呼ばれる  
**THEN** `process.stderr.write(maskSensitive("\r" + paddedLine))` の形式で呼ばれる

---

### TC-012: 非 TTY モードのハートビートで行内容が maskSensitive を経由して出力される

**Category**: unit  
**Priority**: must  
**Source**: tasks.md T-01

**GIVEN** 非 TTY モード（`isTTY: false`）の ProgressDisplay でハートビートが発火する  
**WHEN** `renderHeartbeat()` が呼ばれる  
**THEN** `process.stderr.write(maskSensitive(line + "\n"))` の形式で呼ばれる

---

### TC-013: pipeline:iteration:start の出力が maskSensitive を経由する

**Category**: unit  
**Priority**: must  
**Source**: tasks.md T-01

**GIVEN** ProgressDisplay が non-quiet モードで動作している  
**WHEN** `pipeline:iteration:start` イベントを `{ step: "s", iteration: 1, maxIterations: 3 }` で発火する  
**THEN** `process.stderr.write(maskSensitive("[iter 1/3] starting s\n"))` が呼ばれる

---

### TC-014: pipeline:iteration:verdict の出力が maskSensitive を経由する

**Category**: unit  
**Priority**: must  
**Source**: tasks.md T-01

**GIVEN** ProgressDisplay が non-quiet モードで動作している  
**WHEN** `pipeline:iteration:verdict` イベントを `{ step: "s", iteration: 2, verdict: "pass", action: "done" }` で発火する  
**THEN** `process.stderr.write(maskSensitive("[iter 2] s verdict: pass → done\n"))` が呼ばれる

---

### TC-015: pipeline:iteration:exhausted の出力が maskSensitive を経由する

**Category**: unit  
**Priority**: must  
**Source**: tasks.md T-01

**GIVEN** ProgressDisplay が non-quiet モードで動作している  
**WHEN** `pipeline:iteration:exhausted` イベントを `{ step: "s", iteration: 3, maxIterations: 3 }` で発火する  
**THEN** `process.stderr.write(maskSensitive("[iter 3/3] retries exhausted on s, escalating\n"))` が呼ばれる

---

### TC-016: pipeline:summary の出力が maskSensitive を経由する

**Category**: unit  
**Priority**: must  
**Source**: tasks.md T-01

**GIVEN** ProgressDisplay が non-quiet モードで動作している  
**WHEN** `pipeline:summary` イベントを `{ step: "s", iterations: 2, finalVerdict: "pass" }` で発火する  
**THEN** `process.stderr.write(maskSensitive("Pipeline finished: s iterations=2, final verdict=pass\n"))` が呼ばれる

---

### TC-017: pipeline:cli-step の出力が maskSensitive を経由する（verdict あり / なし両方）

**Category**: unit  
**Priority**: must  
**Source**: tasks.md T-01

**GIVEN** ProgressDisplay が non-quiet モードで動作している  
**WHEN** `pipeline:cli-step` イベントを verdict あり `{ step: "s", verdict: "pass" }` および verdict なし `{ step: "s" }` でそれぞれ発火する  
**THEN** 各 `process.stderr.write` の引数が `maskSensitive(...)` でラップされた `[step] s: pass\n` / `[step] s\n` 形式である

---

### TC-018: maskSensitive は非 secret 文字列を identity として返す（出力内容不変）

**Category**: unit  
**Priority**: must  
**Source**: design D3, request 受け入れ基準「進捗表示の見た目が不変」

**GIVEN** step 名・elapsed・ツール名・ANSI 制御文字（`"\r\x1b[K"` 等）の非 secret 文字列  
**WHEN** `maskSensitive(str)` を呼ぶ  
**THEN** 入力文字列がそのまま返る（token pattern にマッチしないため identity として振る舞う）

---

### TC-019: B-7 test が src/cli/ を grep 対象に含む

**Category**: unit  
**Priority**: must  
**Source**: tasks.md T-02, request 要件 #2

**GIVEN** 更新後の `tests/unit/architecture/core-invariants.test.ts` の B-7 describe block  
**WHEN** テストコードを参照する  
**THEN** `src/cli/` に対して `process\.(stdout|stderr)\.write\s*\(` の grepE が実行されるコードパスが存在する

---

### TC-020: B-7 test の maskSensitive seam exemption が機能する

**Category**: unit  
**Priority**: must  
**Source**: tasks.md T-02, design D2

**GIVEN** grep 結果に `maskSensitive(...)` を含む行が存在する（注入テスト）  
**WHEN** seam exemption フィルタ `m.content.includes("maskSensitive")` を適用する  
**THEN** その行は candidates から除外され、violation として計上されない

---

### TC-021: maskSensitive なしの raw process.stderr.write が B-7 violation として検出される

**Category**: unit  
**Priority**: must  
**Source**: tasks.md T-02, T-04 regression guard

**GIVEN** `src/cli/` ファイルに `process.stderr.write("output")` という maskSensitive なし呼び出しが含まれると仮定した注入データ  
**WHEN** B-7 test の violation フィルタを適用する  
**THEN** その行が violation として検出される（テストが red になる）

---

### TC-022: B-7 test が src/core/ と src/cli/ の両方をマージして評価する

**Category**: unit  
**Priority**: must  
**Source**: tasks.md T-02

**GIVEN** 拡張後の B-7 describe block  
**WHEN** テストの実装コードを参照する  
**THEN** `src/core/` と `src/cli/` 双方の grepE 結果が統合されたうえで violation 判定が行われる

---

### TC-023: B-7 test は __tests__/ を含む行を除外する

**Category**: unit  
**Priority**: must  
**Source**: tasks.md T-02（既存の除外ロジックを cli/ 拡張後も継承）

**GIVEN** grep 結果にテストファイル（`__tests__/` パスを含む行）が混入する  
**WHEN** candidates フィルタを適用する  
**THEN** テストファイルの行は候補から除外される

---

### TC-024: T-01 適用後、拡張版 B-7 test が green になる

**Category**: integration  
**Priority**: must  
**Source**: tasks.md T-02 AC, T-03 AC, request 受け入れ基準

**GIVEN** progress.ts の全 `process.stderr.write` が `maskSensitive(...)` でラップ済みである  
**WHEN** 拡張後の B-7 test（`src/core/` + `src/cli/` を走査）を実行する  
**THEN** violation が 0 件でテストが green になる

---

### TC-025: src/cli/ で progress.ts 以外に B-7 違反が存在しない（grep authoritative）

**Category**: unit  
**Priority**: must  
**Source**: tasks.md T-03, request 要件 #3

**GIVEN** 実装前に `grep -rEn 'process\.(stdout|stderr)\.write\s*\(' src/cli/` を実行する  
**WHEN** progress.ts 以外のファイルへのマッチを確認する  
**THEN** progress.ts 以外にマッチするファイルが存在しない（存在する場合は allowlist に凍結済み）

---

### TC-026: allowlist に新規 B-7 エントリを追加せずにテストが通る

**Category**: integration  
**Priority**: should  
**Source**: tasks.md T-03, design D4

**GIVEN** T-01 で progress.ts の全 16 箇所を maskSensitive wrap した状態  
**WHEN** `bun run test` を実行する  
**THEN** `arch-allowlist.ts` に新規 B-7 エントリを追加することなくテストが green になる

---

### TC-027: bun run build が green

**Category**: integration  
**Priority**: must  
**Source**: tasks.md T-01 AC, T-04 AC

**GIVEN** T-01（maskSensitive import + wrap）を適用した後  
**WHEN** `bun run build` を実行する  
**THEN** ビルドエラーが発生しない

---

### TC-028: bun run typecheck が green

**Category**: integration  
**Priority**: must  
**Source**: tasks.md T-01 AC, T-04 AC

**GIVEN** T-01 を適用した後  
**WHEN** `bun run typecheck` を実行する  
**THEN** 型エラーが発生しない（maskSensitive の型シグネチャ `string → string` が `process.stderr.write` の引数と互換）

---

### TC-029: bun run lint が green

**Category**: integration  
**Priority**: must  
**Source**: tasks.md T-04 AC

**GIVEN** T-01 + T-02 を適用した後  
**WHEN** `bun run lint` を実行する  
**THEN** lint エラーが発生しない

---

### TC-030: bun run test が全て green

**Category**: integration  
**Priority**: must  
**Source**: tasks.md T-02 AC, T-03 AC, T-04 AC

**GIVEN** T-01 + T-02 + T-03 を適用した後  
**WHEN** `bun run test` を実行する  
**THEN** 全テスト（B-7 拡張後の core-invariants を含む）が pass する

---

### TC-031: 既存の progress.ts テストが変更なしで pass する

**Category**: integration  
**Priority**: should  
**Source**: design.md リスク「既存テストが maskSensitive import の追加で壊れない」

**GIVEN** progress.ts の既存テスト（`process.stderr.write` を spy している）が存在する  
**WHEN** T-01 の maskSensitive wrap を追加した後にテストを実行する  
**THEN** 非 secret 文字列に対して maskSensitive が identity で動作するため出力内容が変わらず、テストコードの変更なしに pass する

---

### TC-032: B-7 test 名が cli/ スコープ拡張を反映した名称になっている

**Category**: unit  
**Priority**: should  
**Source**: tasks.md T-02（test 名更新の明示要件）

**GIVEN** 更新後の `core-invariants.test.ts` の B-7 describe block  
**WHEN** describe 名を確認する  
**THEN** cli/ スコープが明示された名称（例: `"B-7: core/ and cli/ must not write to process.stdout/stderr directly"`）になっている

---

## Result

```yaml
result: completed
total: 32
automated: 32
manual: 0
must: 29
should: 3
could: 0
blocked_reasons: []
```
