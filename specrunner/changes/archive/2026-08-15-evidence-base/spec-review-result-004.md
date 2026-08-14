# Spec Review Result — Round 004

**Change folder**: specrunner/changes/evidence-base
**Request type**: spec-change

---

## 検証した項目

### 前周 findings の解消確認

**[前周 low] D7: 構造削除確認の TC 番号参照が誤っている (TC-014 → TC-016)**

design.md D7 末尾の "TC-016 verification mechanism" セクションを確認。
現在の記述:「TC-016 in test-cases.md is categorized as structural/static: once `detectBaseImplementationContamination` is deleted, any surviving import or call site is a TypeScript compile error, caught by `bun run typecheck` (T-06 / TC-017).」
test-cases.md の TC-016 は「detectBaseImplementationContamination is structurally removed — verified by typecheck」→ 解消済み。

**[前周 low] Summary の automated 数 (15) と Result YAML の automated 数 (17) が不整合**

test-cases.md の Summary `automated: 15` と Result YAML `automated: 15` を確認 → 解消済み。

---

### 設計の前提コード検証

| 設計の主張 | 検証結果 |
|---|---|
| `detectBaseImplementationContamination` は `oids.ts:45-72` にある | 実測: oids.ts lines 45-72 に関数定義あり ✓ |
| Gate step 3.5 は `gate.ts:119-129` にある | 実測: gate.ts lines 119-129 が汚染検出と deferral return ✓ |
| Archive floor P2.5 は `achieved-assurance.ts:236-246` にある | 実測: lines 236-246 が P2.5 fail-closed ✓ |
| `synthesizedCommits[0]` はブートストラップコミット (workspace-materializer.ts:213-242 / local.ts:419-443) | 実測: 両パスとも commit 後に `appendSynthesizedCommit(state, bootstrapOid)` を呼ぶ ✓ |
| `--adopt-commits` は末尾に追記するため index 0 を変更しない | 実測: resume.ts:462-464 で `appendSynthesizedCommit` でループ追記 ✓ |
| `captureHeadSha` はすでに runtime port に存在する | 実測: runtime-strategy.ts:329 ✓ |
| `synthesizedCommits` は state schema の省略可能フィールド | 実測: `synthesizedCommits?: string[]` (types.ts:536) ✓ |
| `FORWARD_TYPES = {bug-fix, new-feature}` | 実測: gate.ts:36 ✓ |
| gate.ts が `detectBaseImplementationContamination` をインポートしている | 実測: gate.ts line 20 ✓ |
| achieved-assurance.ts が `detectBaseImplementationContamination` をインポートしている | 実測: achieved-assurance.ts line 20 ✓ |

---

### spec.md 構文・網羅性確認

- 全 Requirement に `SHALL` または `MUST` normative keyword あり ✓
- 全 Requirement に少なくとも 1 Scenario あり ✓
- Layer-1 振る舞いの記述のみ (Layer-0 の型/FSM 強制事項なし) ✓

spec シナリオ数: 10 (Req1×2 + Req2×1 + Req3×2 + Req4×5)

---

### test-cases.md カウント整合性

| 区分 | Summary | Result YAML | 実数 |
|---|---|---|---|
| Total | 17 | 17 | TC-001〜TC-017 = 17 ✓ |
| Automated (unit/integration) | 15 | 15 | TC-001〜TC-015 = 15 ✓ |
| Manual | 0 | 0 | 0 ✓ |
| Gate | (2 implied) | (2 implied) | TC-016, TC-017 = 2 ✓ |
| must | 17 | 17 | 17 ✓ |

---

### spec シナリオ → TC 対応

| Spec シナリオ | 対応 TC |
|---|---|
| Re-run shape earns assurance instead of deferring | TC-001 ✓ |
| Job base is identical on first run and on resume | TC-002 ✓ |
| Adopted operator commit is included in the candidate | TC-003 ✓ |
| Archive floor derives base-red on the Evidence Base for a re-run shape | TC-004 ✓ |
| Archive floor is fail-closed when the Evidence Base reference is absent | TC-005 ✓ |
| Non-forward type still defers | TC-006 ✓ |
| Tamper mismatch still fails | TC-007 ✓ |
| Unavailable runtime still defers | TC-008 ✓ |
| Absent Evidence Base reference defers | TC-009 ✓ |
| Absent HEAD OID defers | TC-010 ✓ |

---

### 受け入れ基準 → 設計/TC 対応

| 受け入れ基準 | カバー |
|---|---|
| 再走 shape で red 側に実装混入しないことをテストで固定 | TC-001 (integration) + D7 gate.test.ts TC-007 strip flip |
| 初回・resume 再走で Evidence Base が同一 tree に解決 | TC-002 (oids unit) |
| adopt-commits の operator commit が candidate に含まれる | TC-003 (gate unit) |
| 撤去対象テストを design で全列挙・根拠明示 | design D7 で完全列挙 ✓ |
| 非対応環境の strategy-deferred 挙動不変 | TC-006〜TC-010 + 既存テスト green ✓ |
| typecheck && test が green | TC-017 (gate) ✓ |

---

## 検証できなかった項目

- `RealRuntimeStrategy` に対する `runTestsOnSynthesizedTree` の compile-time enforcement: 新規メソッドはまだ実装されていないため、型チェック挙動は静的推測のみ (実装後 TC-016/TC-017 で検証)。
- D7 が列挙した archive floor テスト群 (achieved-assurance-*.test.ts) の既存ケースとの完全マッピング: ファイル存在は確認済みだが、現行テストケースの全量との対応は実装フェーズで確定。

---

## Findings 詳細

新規ブロッキング findings なし。
前周の 2 件 (low) はいずれも解消されている。
