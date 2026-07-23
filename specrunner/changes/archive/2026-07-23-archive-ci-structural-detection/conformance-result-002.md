# Conformance Result — archive-ci-structural-detection — iter 2

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### 1. tasks.md — 全チェックボックス完了確認

T-01〜T-05 の全チェックボックスが `[x]` でマークされていることを確認した。

### 2. design.md — 設計判断 D1〜D5 の実装照合

**D1（時間観測でなく構造判定）**

`merge-then-archive.ts` L634–639: `cachedCiPresence === undefined` のとき `archiveSha` の有無で
分岐し、`detectWorkflowCiPresence({ spawn, cwd: recordDir, ref: archiveSha })` を呼ぶ。
grace window は検査のトリガ点として保持されるが、それ単独では CI-less 結論を出さない。

**D2（テキストレベルトリガ検出、YAML parser なし、fail-closed バイアス）**

`workflow-ci-detection.ts` L29–30 のパターン:
```
/(?:^|[\s,[{'"])push(?:[\s,:\]}'"]|$)|(?:^|[\s,[{'"])pull_request/m
```
が design.md 推奨パターンと一致。`pull_request` は prefix マッチなので `pull_request_target` /
`pull_request_review` も CI-present 判定になる（TC-013, TC-014 で確認）。
`package.json` diff は空（依存追加なし）。

**D3（独立モジュール、注入 SpawnFn）**

`workflow-ci-detection.ts` は `SpawnFn` のみ import。GitHubClient・orchestrator の import なし。
引数 `{ spawn, cwd, ref }` だけで動作し、unit テストでケードフェイク spawn により独立検証できる。

**D4（`"none"` branch への配線、fail-closed gate）**

L617–671: grace 超過 + 非 BLOCKED の場合のみ `cachedCiPresence` を参照。
CI-less → 既存 "Assuming CI-less repo" ログ + `break` を保持。
CI-present → deadline 超過なら escalation; 未超過なら `sleepFn + continue`。
`success` / `failure` / `pending` / `BLOCKED` パスは無変更。

**D5（`archiveSha === undefined` → fail-closed）**

L635–636: `archiveSha === undefined` のとき `detectWorkflowCiPresence` を呼ばず
`{ present: true, reason: "inspection-failed" }` を直接設定。
TC-015 で `lsTreeCallCount == 0` を直接アサートして確認。

### 3. spec.md — Requirements / Scenarios 照合

**Requirement 1（構造判定、local git only、at-most-once）**

- `SHALL` / `MUST` 節:
  - 構造判定のみ（時間でない）: D1 + 実装で確認
  - local git のみ: `workflow-ci-detection.ts` は `spawn("git", ...)` のみ呼ぶ
  - at-most-once: `cachedCiPresence` 変数で cache、TC-016 が `lsTreeCallCount == 1`
    を 4 ポーリングイテレーションにわたって直接アサート

- Scenario 1（push/pull_request → fail-closed → escalation）: TC-001 ✓  
- Scenario 2（workflow なし → merge）: TC-002 ✓  
- Scenario 3（schedule のみ → CI-less → merge）: TC-003 ✓  
- Scenario 4（archiveSha 不在 → fail-closed）: TC-015 ✓

**Requirement 2（依存追加なし、テキスト検出）**

- `SHALL` / `MUST` 節:
  - テキストレベル、YAML parser なし: regex 実装で確認
  - push/pull_request トークンで CI-present 十分: TC-007, TC-008 ✓
  - 過検出は CI-present 側: fail-closed バイアス確認

- Scenario（local git only）: `detectWorkflowCiPresence` に GitHub API 引数なし ✓  
- Scenario（package.json 無変更）: `git diff main...HEAD -- package.json` が空出力 ✓

### 4. request.md — 受け入れ基準照合

| 基準 | 確認方法 | 結果 |
|------|---------|------|
| push/pull_request workflow → grace 超過後も merge しない → escalation（テスト固定） | TC-001 | ✓ |
| workflow なし → grace 超過後 merge（テスト固定） | TC-002 | ✓ |
| schedule のみ → CI-less 判定（テスト固定） | TC-003 | ✓ |
| 新規 package 依存なし | `git diff main...HEAD -- package.json` 空 | ✓ |
| `typecheck && test` green | verification-result.md: build/typecheck/test/lint/coverage 全 passed | ✓ |

### 5. T-03（fail-closed timeout escalation）追加確認

`merge-then-archive.ts` L655–661 の escalation text:
- `failedStep: "merge gate (CI-present: no checks appeared)"` — pending-timeout と異なる識別子
- `detectedState` に "push/pull_request workflow is present" / "not merged (fail-closed)" を含む
- `resumeCommand: specrunner job archive --with-merge ${slug}` を含む

TC-018 がこの 3 点をアサート:
- `expect(esc).toMatch(/push|pull_request/)` ✓
- `expect(esc.toLowerCase()).toMatch(/not merged|no merge|fail.closed|did not merge/)` ✓
- `expect(esc).toContain(\`specrunner job archive --with-merge ${FAKE_SLUG}\`)` ✓

TC-019 で `mergePullRequest` / `runPostMergeCleanup` / `markJobArchived` すべて未呼び出しを確認。

## 検証できなかった項目

None.

## Findings 詳細

指摘なし。実装は request.md 受け入れ基準・spec.md Requirements/Scenarios・design.md 全設計判断に適合する。
