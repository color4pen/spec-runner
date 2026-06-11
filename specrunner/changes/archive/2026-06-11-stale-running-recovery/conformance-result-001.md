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
| tasks.md | ✓ | T-01〜T-07 全チェックボックス完了 |
| design.md | ✓ | D1〜D7 すべて実装に反映 |
| spec.md | ✓ | 全 SHALL/MUST・全 Scenario をカバー |
| request.md | ✓ | 受け入れ基準 4 項目すべて充足、typecheck && test green |

## Details

### tasks.md

T-01〜T-07 の全チェックボックスが `[x]` 完了済み。

### design.md

| Decision | 実装箇所 |
|---------|---------|
| D1: orchestrator が `isStale` を収集フェーズで呼び `staleRunningJobIds` を planInbox に渡す | `run-inbox.ts:113-118` |
| D2: 自動回復は既存 `resumeJob` effect を `resumePrompt=undefined` で再利用 | `run-inbox.ts:233` |
| D3: `staleRecovery?: { attempts; stepCount } \| null`、`countStepRuns` 純粋ヘルパ、stepCount 比較によるリセット | `schema.ts:240`, `planner.ts:22,48` |
| D4: `transitionJob(awaiting-resume)` で `pid:null` / `staleRecovery:null` / 合成 `resumePoint`、`notifyJobTerminal` 再利用 | `run-inbox.ts:248-260` |
| D5: issueNumber 不問で recover 対象 | `RecoverAction.issueNumber?: number\|null` |
| D6: `MAX_STALE_RECOVERY_ATTEMPTS = 3` を export | `planner.ts:15` |
| D7: staleRecovery increment は inbox のみ、ResumeCommand は無変更 | diff に resume.ts 変更なし |

### spec.md

**R1 — 孤児化 running job の自動回復**

- Scenario「running かつ pid 死亡 → resume」: `isStale=true, low attempts` → `persistState` → `resumeJob(slug, undefined)` ✓
- Scenario「pid 生存 → 対象外」: `isStale=false` で recover/escalate 系 effect 一切呼ばれず ✓
- Scenario「issue-link 無しも回復対象」: `RecoverAction.issueNumber` optional、recover ループで issueNumber チェックなし ✓

**R2 — crash-loop guard**

- staleRecovery 未設定 → attempts=1, stepCount=現在値 ✓
- stored.stepCount 一致 & attempts < 上限 → attempts+1 ✓
- stored.stepCount 不一致（進捗あり）→ attempts=1 リセット ✓
- stored.stepCount 一致 & attempts >= 上限 → escalate ✓（`MAX_STALE_RECOVERY_ATTEMPTS` 境界値テスト済み）

**R3 — 上限超過時の awaiting-resume 遷移と escalation 通知**

- issue-link あり → `notifyEscalation` に `status=awaiting-resume` state が渡る ✓
- issue-link なし → `notifyJobTerminal` が issueNumber 不在時 no-op（既存実装）✓
- escalation 後は planResumes 経路で拾える ✓

### request.md

- running かつ pid 死亡の job が inbox run で resume される ✓
- pid が生存している running job は対象外のまま ✓
- 連続自動 resume の上限超過で escalation 通知に倒れる ✓
- `typecheck && test` が green — verification-result: build/typecheck/test/lint 全 passed、Tests 4145 passed ✓
