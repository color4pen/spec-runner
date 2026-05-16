# Review Feedback — delta-apply-normalization — Iteration 1

## Summary

- **verdict**: approved
- **reviewer**: code-reviewer
- **date**: 2026-05-16
- **scope**: spec-merge.ts + tests + spec authority files

全 must シナリオがテストでカバーされ、1924 テスト全 pass、typecheck green。
delta spec も change folder 配下に正しく配置されており finish 時の自己反映も確認済み。
minor 2 件を記録するが blocking なし。

---

## Findings

### F-001 — TC-SM-092 の assertion が spec より弱い

- **severity**: low
- **location**: `tests/finish-spec-merge.test.ts:1200-1216`

**What is wrong:**
test-cases.md TC-SM-092 の THEN 節は「`{ ok: false }` が返り、**type field 不在を示す escalation message が含まれる**」と定める (must)。
実装のテストは `ok: false` と `exitCode: 1` しか検証しておらず、escalation メッセージの内容を assert していない。

実装側は `parseRequestMdContent` が `"missing 'type' in Meta section"` を含む例外を throw し、catch block が `formatEscalation` に渡すため実際には "type" に言及したメッセージになる。ただしテストがそれを保証していないため、将来の実装変更で escalation メッセージが変わっても気づけない。

**How to Fix:**
```typescript
// After existing assertions:
expect(result.escalation.toLowerCase()).toMatch(/type|request\.md|parse/);
```

---

### F-002 — defense-in-depth エラーメッセージの "Known types" が TYPE_CONFIG と乖離する可能性

- **severity**: low
- **location**: `src/core/finish/spec-merge.ts:399-401`

**What is wrong:**
TYPE_CONFIG に存在するが SPEC_REQUIRED/SPEC_OPTIONAL に含まれない type（未来の TYPE_CONFIG 拡張時に発生する）へのフォールバックエラーで、"Known types" の列挙が `[...SPEC_REQUIRED_TYPES, ...SPEC_OPTIONAL_TYPES].join(", ")` から生成される。現時点ではこの 2 集合の和が TYPE_CONFIG のキー集合と一致するが、新 type を TYPE_CONFIG に追加して spec-merge.ts の更新を忘れた場合、エラーメッセージの "Known types" に新 type が含まれず混乱を招く。

**How to Fix:**
```typescript
detectedState: `Request type '${requestType}' is not mapped to a spec policy. Known types: ${Object.keys(TYPE_CONFIG).join(", ")}`,
```

`Object.keys(TYPE_CONFIG)` に統一することで TYPE_CONFIG が唯一の権威ソースになる。

---

## Test Coverage Assessment

| Category | must | covered | should | covered |
|----------|------|---------|--------|---------|
| A: request.md 読み込み | 4 | 4 ✅ | 0 | — |
| B: type 別 skip/fail | 6 | 6 ✅ | 1 | 1 ✅ |
| C: 空 delta 検出 | 1 | 1 ✅ | 1 | 0 (TC-SM-100b 未実装) |
| D: cross-capability atomic | 1 | 1 ✅ | 2 | 0 (TC-SM-101b/103 未実装) |
| E: 既存テスト回帰 | 2 | 2 ✅ | 0 | — |
| F: spec-fixer prompt | 2 | 2 ✅ | 0 | — |
| G: spec authority | 6 | 6 ✅ | 1 | 1 ✅ |
| H: ビルド | 2 | 2 ✅ | 0 | — |

should 未実装 3 件 (TC-SM-100b / TC-SM-101b / TC-SM-103) は blocking なし。

---

## Spec Acceptance Criteria Check

| 受け入れ基準 | 結果 |
|-------------|------|
| `mergeSpecsForChange` が `request.md` から `type` を読み取る | ✅ |
| `request.md` 不在 / parse error / type field 不在 → fail、test 付き | ✅ (TC-SM-090/091/092) |
| `spec-change` / `new-feature` で `specs/` 実質不在 → fail、test 付き | ✅ (TC-SM-094/095) |
| `bug-fix` / `refactoring` / `chore` で `specs/` 実質不在 → 正常 skip、test 付き | ✅ (TC-SM-096/097/098) |
| 未知 type → fail、test 付き | ✅ (TC-SM-093/093b) |
| capability dir 配下 delta が空 → fail、test 付き | ✅ (TC-SM-100) |
| cross-capability の Pass 1 部分 fail で全 write が起きないことの test 付き | ✅ (TC-SM-101) |
| `specrunner/specs/spec-merge/spec.md` 新設、4 Requirements + 4 Scenarios | ✅ |
| `buildSpecFixerSystemPrompt()` に正規 path + 正規外 path 禁止 3 例 | ✅ |
| `cli-finish-command/spec.md` Phase 0 check 5, 6 削除 | ✅ |
| `cli-finish-command/spec.md` Phase 0 check 7 から openspec 除去 | ✅ |
| `openspec validate fail で escalation` Scenario 削除、バイナリ不在 Scenario から openspec 除去 | ✅ |
| `bun run typecheck && bun run test` green | ✅ (1924 passed) |

---

## Notes

- `src/core/finish/spec-merge.ts` lines 394-406 の defense-in-depth チェックは現状 dead code（TYPE_CONFIG ∩ 補集合(REQUIRED∪OPTIONAL) = ∅）だが、TYPE_CONFIG 拡張時のフェイルセーフとして意図的。設計判断として妥当。
- delta spec が `specrunner/changes/delta-apply-normalization/specs/` に正しく配置されており、finish 時に `spec-change` type として自己 apply される。
- finish-orchestrator.test.ts に `STUB_REQUEST_MD`（type=bug-fix）を追加し既存統合テストが regression していないことを確認済み。
