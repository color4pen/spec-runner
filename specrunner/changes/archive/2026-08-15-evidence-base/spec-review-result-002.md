# Spec Review Result — evidence-base (Round 2)

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 前周 findings の解消確認

| Finding | 対象 | 状態 |
|---------|------|------|
| Req 4 deferral list missing captureHeadSha→null path | spec.md | ✅ 解消 — "Absent HEAD OID defers" Scenario 追加済み |
| TC-014 implementation mechanism not specified | test-cases.md | ✅ 解消 — "Verification phase: T-06 (`bun run typecheck`)" 明記済み |
| Archive floor fail-closed has no spec scenario | spec.md | ✅ 解消 — "Archive floor is fail-closed when the Evidence Base reference is absent" Scenario 追加済み |

### 設計根拠の実コード照合

1. **D1: synthesizedCommits[0] = bootstrap commit** — `workspace-materializer.ts:237-242`・`local.ts:438-443` で確認。「add request.md for \<slug\>」コミット後に `rev-parse HEAD` を取得して `appendSynthesizedCommit` を呼ぶ経路が両走行パス（worktree / no-worktree）で共通。

2. **D1: --adopt-commits は末尾に追記** — `resume.ts:462-463` で `appendSynthesizedCommit(updatedState, commit.oid)` をループで呼ぶ。`appendSynthesizedCommit`（`operations.ts:35-39`）は常に末尾 push。index 0 は不変。

3. **D1: branch-borne 永続化** — `synthesizedCommits` は state.json のトップレベルフィールド（`types.ts:536`）。journal fold（events.jsonl）ではなく state.json 経由で persist される。`job-state-projection.ts:92-96` で `validated`（state.json 由来）がそのまま composed に入る。resume 時は branch の state.json を読み戻すため、resume を跨いで同一値に解決される。

4. **captureHeadSha は RuntimeStrategy に必須メソッドとして定義済み** — `runtime-strategy.ts:329`（`?` なし）。GateDeps の Pick への追加は T-03 が担う。

5. **runTestsAtCommit の 3 経路確認** — `local.ts:1086-1147`。scopedTestCommand 設定済み / bail（custom commands あり）/ default bun の 3 分岐を確認。

6. **P2.5 contamination check（gate.ts:119-129 / achieved-assurance.ts:236-246）** — 現状コードに存在を確認。撤去対象として正しく特定されている。

7. **TC-007 strip-test-authority の現状期待値が `strategy-deferred`** — `gate.test.ts:778` で確認。Evidence Base 導入後に `passed` へ反転することを design D7 が明示。整合している。

### spec.md Requirements の網羅性

| Requirement | Scenario 数 | SHALL 充足 |
|-------------|-------------|-----------|
| Req 1: red 側 = Evidence Base | 2 | ✅ |
| Req 2: green = effective branch HEAD | 1 | ✅ |
| Req 3: 汚染機構の撤去 | 2 | ✅ |
| Req 4: deferral/tamper/型/never-throw 不変 | 4 | ✅（F-002 参照） |

### test-cases.md 網羅性

| TC | Category | 受け入れ基準マッピング |
|----|----------|----------------------|
| TC-001 | integration | AC-1: 再走 shape が保証を得る |
| TC-002 | unit | AC-2: 初回/resume で同一 tree |
| TC-003 | integration | AC-3: adopt-commit が candidate に含まれる |
| TC-004 | integration | AC-4: archive floor が Evidence Base で base-red を確立 |
| TC-005 | unit | archive floor fail-closed (Evidence Base ref 欠如) |
| TC-006–009 | unit | Req 4 deferral 不変（F-002 参照）|
| TC-010 | unit | resolveEvidenceBaseRev 純関数 + null |
| TC-011–012 | integration/unit | runTestsOnSynthesizedTree ランタイム契約 |
| TC-013 | unit | hollow test → failed |
| TC-014 | gate | typecheck による構造的削除確認 |
| TC-015 | gate | typecheck && test 全体 green |

---

## 検証できなかった項目

- `runTestsOnSynthesizedTree` の実装（未実装のため）
- archive floor の Evidence Base 統合後の挙動（未実装）
- `bite-evidence-e2e-gate.test.ts` への新テスト追加（未実装）

---

## Findings 詳細

### F-001: design.md D2 — scopedTestCommand 未設定時の挙動記述が不正確

D2 は `runTestsOnSynthesizedTree` について "reuses the same `scopedTestCommand` precedence" と記述している。現行の `runTestsAtCommit` は scopedTestCommand 未設定かつ custom commands 非設定の場合に「default bun test」path（symlink なし、`bun test <file>` を直接実行）へ fallback する（`local.ts:1129-1147`）。

新メソッド `runTestsOnSynthesizedTree` では overlay ファイルの import 解決のために node_modules symlink が必須となるため、default bun path は機能しない。T-01 の Acceptance Criteria は "unavailable on [...] unset/unsupported `scopedTestCommand`" と正確に記述しており、spec.md Req 4 Scenario "Unavailable runtime still defers" も scopedTestCommand 未設定を deferred の例示として記述している。

T-01 と spec は正確だが、D2 の "same precedence" という表現は「同じ 3 経路（default bun path を含む）」と読めるため実装者が誤って default bun path を追加するリスクがある。D2 に「overlay 実行には symlink が必須のため default bun path は適用されない」の一文を補足することで解消できる。

### F-002: test-cases.md — gate の "absent Evidence Base ref → strategy-deferred" テストケース未収録

spec.md Req 4 は gate が `resolveEvidenceBaseRev` から null を受け取った場合に `strategy-deferred` を返すことを normative SHALL で要求している。しかし test-cases.md には:

- TC-010: `resolveEvidenceBaseRev` の pure 関数テスト（oids unit）
- TC-005: archive floor の fail-closed テスト
- TC-009: `captureHeadSha → null` の gate テスト

は存在するが、**gate 自体が `resolveEvidenceBaseRev → null` を受け取って `strategy-deferred` を返すことを検証する gate-level テストケース**がない。design D7 の新規テスト列挙にも当該 gate 経路のテストが明示されていない。

TC-009（Absent HEAD OID）と同列に、「synthesizedCommits が空/absent → resolveEvidenceBaseRev が null → gate が strategy-deferred を返す」gate unit テストを 1 件追加することで AC の網羅が完結する。現状では `resolveEvidenceBaseRev` の null check が実装から抜け落ちても、列挙されたテストが全て緑になる可能性がある。
