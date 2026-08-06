# Cross-Boundary Invariants Review — issue-request-fidelity-gate — iter 5

## Scope

- **Reviewer**: cross-boundary-invariants
- **Purpose**: diff が変更していないコードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する
- **Iteration**: 5（iter 4 持ち越し findings 確認 + code-fixer commit `93113e9` の変更確認）

## iter 5 での変更（code-fixer `93113e9`）

| ファイル | 変更内容 |
|---------|---------|
| `src/core/command/runner.ts` | `scopeConfigWarningForJob` 呼び出しを gate 分岐前から `else`（proceed）ブロック内へ移動（F-01 修正） |
| `tests/unit/core/command/runner-fidelity-gate.test.ts` | TC-033 追加（scope-config 警告が halt 時に emit されないこと / proceed 時には emit されること）。TC-029 ヒント系を TC-032 に改番。beforeEach に `mockScopeConfigWarningForJob.mockReturnValue(null)` リセット追加 |

---

## iter 4 findings の対処状況

### CBI-004 [LOW] → **STILL OPEN**

`ISSUE_FETCH_FAILED` code overloading（wiring error / readRequestMd 失敗 / comparator throw にも同 code を使用）が継続中。詳細は下記。

### OBS-5 → **RESOLVED**

TC-028 / TC-029 番号衝突が解消:
- `runner-fidelity-gate.test.ts` 内の旧 TC-028「カウンタ非消費」は TC-029 に改番済み
- 旧 TC-029「undeclared drop hint」は TC-032 に改番済み
- TC-028 は `issue-fidelity-comparator-layering.test.ts`「port layering」にのみ存在し、衝突なし ✓

---

## F-01 修正の cross-boundary 確認

### 変更前後の構造

**変更前**: `scopeConfigWarningForJob` を gate 分岐（`if halt / else proceed`）の外・前で無条件呼び出し。gate halt 時でも警告が emit されていた。

**変更後**: `else`（proceed）ブロック内に移動。コメント追加: "Placed in the proceed branch so gate halt does not emit spurious warnings."

### 不変条件チェック

**1. 通常 run（--issue なし / gate 未発火）での scope-config 警告動作**

- gate は `issueNumber == null → proceed` で即座に返る
- `gateDecision.kind === "proceed"` → else ブロックへ進み、警告は従来通り emit される
- 動作変化なし ✓

**2. gate pass（--issue あり、undeclared drop 0）での scope-config 警告動作**

- `gateDecision.kind === "proceed"` → else ブロックへ進み、警告は emit される
- 動作変化なし ✓

**3. gate halt での scope-config 警告動作**

- 旧: halt 前に警告が emit されていた（pipeline が走らないのに無関係な警告が表示）
- 新: halt path には入らず、警告は emit されない
- 意図した変更。TC-033 で機械固定 ✓

**4. `scopeConfigWarningForJob` の他の呼び出し元**

- grep 確認: `runner.ts:327` のみ（1 箇所）。他の呼び出し元なし ✓

**5. TC-033 の mock リセット安全性**

- `beforeEach` で `mockScopeConfigWarningForJob.mockReturnValue(null)` をリセット
- TC-033 内で sentinel 値を設定 → afterEach / 次の beforeEach でリセットされるため leakなし ✓
- `beforeEach` のリセット追加は既存テストが sentinel を意図せず受け取ることを防ぐ ✓

**6. `handleResult` との相互作用**

- `handleResult` は `scopeConfigWarningForJob` を参照しない（module-level 関数、runner 内部のみ）
- gate halt 時の `finalState.status === "awaiting-resume"` 経路での handleResult 動作は変化なし ✓

### 結論: F-01 修正は既存不変条件を破らない ✓

---

## Finding CBI-004 [LOW]: `ISSUE_FETCH_FAILED` code overloading（iter 2 持ち越し、iter 5 再確認）

### 現状

`issue-fidelity-gate.ts` の halt step 4 / 5 / 7 が `ERROR_CODES.ISSUE_FETCH_FAILED` を返す:

```typescript
// step 4: comparator undefined (wiring error)
{ kind: "halt", code: ERROR_CODES.ISSUE_FETCH_FAILED, haltKind: "internal-error" }
// step 5: readRequestMd() throws
{ kind: "halt", code: ERROR_CODES.ISSUE_FETCH_FAILED, haltKind: "internal-error" }
// step 7: comparator throws
{ kind: "halt", code: ERROR_CODES.ISSUE_FETCH_FAILED, haltKind: "internal-error" }
```

tasks.md D8 で "ISSUE_FETCH_FAILED 相当 / 明示 wiring error" と明記されており deliberate。

### 影響範囲（変化なし）

- `FATAL_ERROR_CODES` に含まれない → resume 可能 ✓（pipeline.ts で確認）
- `handleResult` は `SPEC_REVIEW_RESULT_NOT_FOUND` 以外を特別扱いしない → routing 問題なし ✓
- `haltKind` ≠ `error.code` の乖離: hint 文字列は `haltKind` で正しく分岐（TC-030, TC-031, TC-032）
- operator が `state.error.code === "ISSUE_FETCH_FAILED"` を見ると「GitHub API 障害」と誤診する診断性問題が残存

**iter 5 変化**: なし。設計上の gap のまま継続。

---

## iter 5 確認済み不変条件まとめ

| 不変条件 | 確認 | 根拠 |
|---------|------|------|
| scope-config 警告が gate halt 時に emit されない | ✓ | runner.ts proceed ブランチ限定 + TC-033 |
| scope-config 警告が通常 run / gate proceed 時に emit される | ✓ | TC-033（proceed バリアント） |
| `scopeConfigWarningForJob` の唯一の呼び出し箇所 | ✓ | grep: runner.ts:327 のみ |
| TC-028 / TC-029 番号衝突が解消 | ✓ | runner-fidelity-gate.test.ts から TC-028 消去確認 |
| ISSUE_FIDELITY_UNDECLARED_DROP / ISSUE_FETCH_FAILED が FATAL_ERROR_CODES 外 | ✓ | pipeline.ts FATAL_ERROR_CODES 定義確認 |
| gate halt 後 resume で gate 再評価（iter 4 より維持） | ✓ | resume.ts → resolveResumeStep → startStep=request-review |
| inboxOrigin が transitionJob / resume 越えで保持される（iter 4 より維持） | ✓ | state.json roundtrip（TC-015, TC-016） |
| comparatorFactory が run / resume 両経路で注入される（iter 4 より維持） | ✓ | cli/run.ts:106, cli/resume.ts:83 |
| gate halt が checkConsecutiveEscalations カウンタを消費しない（iter 4 より維持） | ✓ | TC-029 |
| issue 本文が state / change folder / pipeline args に残らない（iter 4 より維持） | ✓ | GateDecision 型 + TC-002 sentinel |

## Observations

| # | 内容 |
|---|------|
| OBS-6 | TC-033 は halt/proceed の両バリアントを網羅しており、F-01 修正の機械歯として適切 |
| OBS-7 | `beforeEach` への `mockScopeConfigWarningForJob.mockReturnValue(null)` リセット追加は TC-033 の sentinel leakage を防ぎ、テスト順序依存性を排除 |
| OBS-8 | OBS-5（TC-028 衝突）は resolver: code-fixer が改番により解消。テスト体系の整合性が回復 |
