# Conformance Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:   implementation conforms to tasks.md, design.md, spec.md, and request.md
  - needs-fix:  one or more upstream artifacts are not satisfied by the implementation
  - escalation: conformance cannot be determined (missing artifacts, unresolvable ambiguity)
- The Findings table records the per-artifact judgment.
-->

- **verdict**: approved

## Conformance Findings

| Artifact | Conforms | Notes |
|----------|----------|-------|
| tasks.md | ✓ | T-01〜T-06 全 checkbox [x]。architecture/ / specrunner/adr/ 変更なし確認済み |
| design.md | ✓ | D1〜D5 すべて実装に反映。port doc comment 更新済み |
| spec.md | ✓ | 全 Requirement / Scenario をテストで固定。D5（member pending）は spec 未記載だが request・design・テストで担保（観察事項 O-1 参照） |
| request.md | ✓ | 全受け入れ基準充足。typecheck green、test 6710 passed |

---

## 1. Tasks — 全 checkbox 完了確認

T-01 〜 T-06 の全 checkbox が `[x]` で完了。スコープ外の `architecture/` / `specrunner/adr/` に変更なし（git diff 確認）。

---

## 2. Design decisions — 実装照合

| 決定 | 内容 | 実装箇所 | 判定 |
|------|------|----------|------|
| D1 | `WorktreeInspectionResult` DU を port に定義・export | `runtime-strategy.ts:63-65`、L440/L550 で signature 変更 | ✓ |
| D2 | local: exit 0 → success、非ゼロ → unavailable（exit code 付き reason）、spawn 例外 → unavailable（エラー概要付き reason） | `local.ts:855-875` — パースロジック不変、戻り値の wrap のみ変更 | ✓ |
| D3 | managed: 常に `{kind:"success", paths:[]}` | `managed.ts:562-563` — 1 行で固定 | ✓ |
| D4 | consumer: unavailable → aggregateVerdictResult=escalation、code=ROUND_INSPECTION_UNAVAILABLE、commitRoundArtifacts 不呼び出し | `parallel-review-round.ts:238-250` | ✓ |
| D5 | inspection escalation（unavailable / offending）のとき `applyRoundResults` を呼ばない → members が pending のまま persist | `parallel-review-round.ts:226/290-292` — `inspectionEscalated` フラグ制御 | ✓ |

port doc comment の「Never throws — returns [] on any error」除去・新 contract 記載を `runtime-strategy.ts:422-434` で確認済み。

---

## 3. Spec Requirements / Scenarios — 照合

### Requirement 1 — seam は DU を返す

- port `listWorktreeChanges?` → `Promise<WorktreeInspectionResult>`（optional）
- `RealRuntimeStrategy.listWorktreeChanges` → `Promise<WorktreeInspectionResult>`（required）
- throw しない点維持（DU で表現）、`reason: string` で ports→domain 非依存
- **Scenario: 検査成功は変更集合を伴って返る** → local success path でテスト固定 ✓
- **Scenario: 検査不能は診断文字列を伴って返る** → local unavailable path でテスト固定 ✓

### Requirement 2 — local runtime は git 失敗を unavailable で返す

- **Scenario: exit 0 → success** → `local-round-git.test.ts` 複数 case ✓
- **Scenario: 非ゼロ → unavailable（reason に exit code）** → `local-round-git.test.ts` ✓
- **Scenario: spawn 例外 → unavailable（reason にエラー概要）** → `local-round-git.test.ts` ✓

### Requirement 3 — managed runtime は success:[] を返す

- **Scenario: managed は常に success:[]** → `managed-round-git.test.ts` 2 case ✓

### Requirement 4 — coordinator は unavailable で fail-closed escalation

- **Scenario: 検査不能 → escalation、ROUND_INSPECTION_UNAVAILABLE、commitRoundArtifacts 不呼び出し** → Scenario 7（4 tests）✓
- **Scenario: 検査成功 → 宣言外変更検出・scoped commit 従来どおり** → Scenario 1〜4 維持 ✓
- **Scenario: seam 未実装 → skip** → Scenario 6 ✓

---

## 4. 受け入れ基準 — request.md

| 基準 | テスト / 確認箇所 | 判定 |
|------|----------------|------|
| local: 非ゼロ終了・spawn 例外 → `{kind:"unavailable"}` | `local-round-git.test.ts` L62-78 | ✓ |
| local: exit 0 → `{kind:"success", paths}` | `local-round-git.test.ts` L81-123 | ✓ |
| managed: `{kind:"success", paths:[]}` | `managed-round-git.test.ts` L37-49 | ✓ |
| consumer: unavailable → escalation + ROUND_INSPECTION_UNAVAILABLE + commitRoundArtifacts 不呼び出し | Scenario 7（3 独立 test）| ✓ |
| success 経路: 宣言外変更検出・scoped commit が既存テストで維持 | Scenario 1〜4 | ✓ |
| inspection escalation 後、member statuses が pending | Scenario 8（unavailable / offending 各 1 case）| ✓ |
| inspection 成功時、member statuses が approved（対の正の制御）| Scenario 8 positive control | ✓ |
| port doc comment: 旧記述除去・新 contract 更新 | `runtime-strategy.ts:422-434` | ✓ |
| `bun run typecheck` green | 実行確認 — エラーなし | ✓ |
| `bun run test` green | 6710 passed（494 files）| ✓ |

---

## 5. Observations（非ブロッキング）

### O-1: spec.md の D5 カバレッジ

spec.md Requirement 4 の Scenario は「commitRoundArtifacts を呼ばない」を記述しているが、「member statuses が pending のまま persist される（resume で再 inspection される）」（D5）の振る舞いは Scenario に明示されていない。request.md 受け入れ基準・design.md D5・テスト（Scenario 8）は整合しており、実装は正確。spec の不完全さは次の spec 改訂タスクへの申し送りとする（ブロッキング要因でない）。

### O-2: tasks.md の「3 文字未満 skip」表記と実装の閾値

tasks.md T-02 に「3 文字未満 skip」とあるが実装は `part.length < 4`（3 文字以下 skip）を使用。`git status --porcelain` の最短有効エントリは 4 文字（`XY<SP><char>`）であるため `< 4` が正しい。`if (filePath)` ガードで空パスも除外されるため実害なし。実装は正確であり tasks.md の表記が若干不精確。

---

## 6. スコープ外の不変確認

- `architecture/` 配下: 変更なし ✓
- `specrunner/adr/` 配下: 変更なし ✓
- `commitRoundArtifacts` / `partitionRoundChanges` のロジック: 不変（呼び出し条件のみ変更）✓
- managed parallel custom reviewer サポート拡張: なし ✓
