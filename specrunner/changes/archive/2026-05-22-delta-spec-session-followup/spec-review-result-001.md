# Spec Review Result: delta-spec-session-followup

- **verdict**: approved
- **reviewer**: spec-reviewer
- **date**: 2026-05-22

---

## Summary

intra-step follow-up prompt primitive の追加仕様として網羅性・整合性・セキュリティ要件を確認した。delta spec の format 規律違反はなく、設計判断は一貫している。3 点の注意事項を記録するが、いずれも blocker ではない。

---

## Format Validation (rules.md 準拠)

全 4 ファイルを確認。

| ファイル | ## Requirements | ### Requirement: | #### Scenario: | SHALL/MUST | Removed/Renamed 形式 |
|---|---|---|---|---|---|
| agent-runner-port/spec.md | ✅ | ✅ | ✅ | ✅ | 不要 (追加のみ) |
| step-execution-architecture/spec.md | ✅ | ✅ | ✅ | ✅ | 不要 (追加のみ) |
| claude-code-runtime/spec.md | ✅ | ✅ | ✅ | ✅ | 不要 (追加のみ) |
| managed-agent-runtime/spec.md | ✅ | ✅ | ✅ | ✅ | 不要 (追加のみ) |

旧形式 (`## ADDED/MODIFIED Requirements`) は使用されていない。各 Requirement と最初の Scenario の間にコードブロックはない。

---

## Coverage Assessment

### request.md → delta spec のトレーサビリティ

| 要件 | delta spec |
|---|---|
| `AgentRunContext.followUpPrompt?: string` 追加 | agent-runner-port/spec.md ✅ |
| `AgentStep.followUpPrompt?: string` 追加 | step-execution-architecture/spec.md ✅ |
| executor の ctx への転記 | step-execution-architecture/spec.md ✅ |
| ClaudeCode adapter 2 段実行 (resume 方式) | claude-code-runtime/spec.md ✅ |
| Managed adapter SSE 経路 2 段実行 | managed-agent-runtime/spec.md ✅ |
| Managed adapter polling 経路 2 段実行 | managed-agent-runtime/spec.md ✅ |
| DesignStep への format self-fix followUpPrompt 設定 | step-execution-architecture/spec.md ✅ |
| modelUsage adapter native (Codex 加算 / Claude cumulative) | design.md D6 + tasks.md T-06 (※後述) |
| timeout 単一 AbortController | claude-code-runtime/spec.md ✅ / managed-agent-runtime/spec.md ✅ |
| graceful degradation (managed sendUserMessage 失敗) | managed-agent-runtime/spec.md ✅ |
| shared 純粋関数の境界 (adapter → shared 一方向) | tasks.md T-04 に定義 ✅ |

受け入れ基準の全項目に対応する spec または design/tasks 記述が存在する。

---

## Design Consistency

### D1 (intra-step 完結) の一貫性 ✅

executor が `runner.run(ctx)` を 1 回 await し、内部 2 turn は adapter の実装詳細である点が step-execution-architecture/spec.md の Scenario (`executor と finalizeStep が無改修である`) で検証可能な形式になっている。pipeline state machine / FIXER_STEP_NAMES への無干渉も spec に明記されている。

### D5 (shared/native 境界) の一貫性 ✅

shared に置く関数 (`shouldRunFollowUp` / `mergeFollowUpResult`) は runtime 型 (AsyncGenerator / Turn / poll result) と usage 意味論を知らない純粋関数として定義されている。Codex の per-turn usage 加算は T-06 に adapter native として配置されており、shared への一律加算は存在しない。

### D6 (各 adapter の follow 送信方式) の一貫性 ✅

- **Claude**: `resume: sessionId` 方式。design.md が AsyncIterable 案と比較検討した上で fixer session 継続の実績を根拠に選択。spec の Scenario (`resume: "sess-abc"` が options に含まれる) として検証可能。
- **Codex**: 同一 `CodexThread.run()` 2 回。spec なし (後述 F-01)。
- **Managed SSE**: `sendUserMessage + pollUntilComplete`。spec の Scenario で検証可能。

---

## Findings

### F-01: Codex adapter に delta spec がない (pre-existing gap、non-blocker)

baseline に `specrunner/specs/codex-runtime/spec.md` が存在しない。そのため Codex follow-up 実装 (T-06 / T-12) に対応する delta spec がない。これは本 request で生じた gap ではなく、Codex adapter が当初から spec 未カバーであることに起因する。request の acceptance criteria は unit test (T-12) でカバーされているため blocker ではない。

### F-02: Managed API multi-turn の検証エビデンスが設計内に明示されていない (acceptable risk)

request は「SSE `end_turn` 後の `sendUserMessage` 可否を design フェーズで実機または公式ドキュメントで検証する SHALL」と要求した。design.md D6 は「fixer session resume pattern と同じ前提」として `sendUserMessage + pollUntilComplete` を採用しているが、実機検証や公式ドキュメント引用のエビデンスは記録されていない。

ただし:
- fixer session resume は現行コードで動作する実績パターン
- managed-agent-runtime/spec.md に `sendUserMessage 失敗時 graceful degradation` が明示されている (非致命的フォールバック)

仮定が外れた場合でも hard failure にならない設計であるため、許容できるリスクと判断する。

### F-03: DesignStep followUpPrompt の rules.md path が slug 非依存表記 (minor)

tasks.md T-09 のプロンプト文面は `specrunner/changes/ 配下の rules.md を Read tool で読んでください` と書かれており、slug を含まない。変更 folder が複数存在するケースで agent が誤った rules.md を読む可能性がある (実運用上は 1 worktree = 1 change だが、spec 上の不確定性)。

step-execution-architecture/spec.md の Requirement: DesignStep は「slug 埋め込みは adapter 側で行う、または slug 非依存な path 表記を使用する」と両案を認めており、tasks.md はどちらか一方を選んで実装することになる。実装者は slug を path に埋め込む方式 (`specrunner/changes/<slug>/rules.md`) を推奨する。

---

## Security Review

本変更はユーザー入力をプロンプトへ流す経路を持たない。`followUpPrompt` は step 定義時に開発者がハードコードする static string であり、`DesignStep.followUpPrompt` は rules.md の参照と format 規律の列挙のみ含む。外部入力の injectionリスクは該当しない。

managed adapter の `sendUserMessage` に渡す値は `ctx.followUpPrompt` (= step 定義の static string) のみであり、job state やユーザー request 内容は混入しない。

---

## Acceptance Criteria Check

- [x] `AgentRunContext.followUpPrompt` + `AgentStep.followUpPrompt` が追加される — spec に定義あり
- [x] `followUpPrompt` 未指定時は早期 return で作業 turn のみ — 全 adapter spec に Scenario あり
- [x] 3 adapter とも 2 段実行が定義されている — Claude / Managed は delta spec、Codex は design + tasks (F-01)
- [x] follow turn が同一 session 継続 — 各 spec の Scenario で検証条件を記述
- [x] wall-clock timeout が作業 turn + follow turn 合算で 1 本 — claude-code-runtime / managed-agent-runtime spec に Scenario あり
- [x] modelUsage が session 累積総量 (adapter native) — design D6 + tasks に定義
- [x] shared が runtime 型・usage 意味論を知らない — T-04 の設計意図に明記
- [x] result 集約 (sessionId 維持 / resultContent 採用) が shared — T-04 の `mergeFollowUpResult` に定義
- [x] design step に format self-fix followUpPrompt が設定される — step-execution-architecture/spec.md ✅
- [x] executor / finalizeStep が無改修 — step-execution-architecture/spec.md の Scenario で検証
- [x] pipeline step 遷移・state machine が無変更 — step-execution-architecture/spec.md に明記
- [x] dsv が従来通りゲートとして残る — scope 外定義で明示的に除外 ✅
- [x] 3 adapter の unit test — T-11 / T-12 / T-13 に定義
- [x] `bun run typecheck && bun run test` が green — T-14 に定義
- [~] managed の follow turn が設計確定手段で実行できる — design.md が fixer precedent + graceful degradation で解決 (F-02)
