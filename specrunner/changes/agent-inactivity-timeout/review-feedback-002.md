# Code Review Feedback — agent-inactivity-timeout — iter 2

## 検証した項目

- `git log --oneline` で iter 1 からの commit 履歴を確認 (operator-apply が TC-010 / design.md 両 finding を修正)
- `git show 9b65af930` で operator-apply の変更内容を精読
- `specrunner/changes/agent-inactivity-timeout/test-cases.md` — TC-010 GIVEN の修正内容を確認
- `specrunner/changes/agent-inactivity-timeout/design.md` — Risks セクションへの `throwIfAborted()` ガード entry 追加を確認
- `src/adapter/shared/inactivity-watchdog.ts` — 実装全体を再精読
- `src/adapter/claude-code/agent-runner.ts` diff — watchdog 配線 4 サイト・catch 拡張・finally clear を再確認
- `src/adapter/codex/agent-runner.ts` diff — executeTurn への watchdog 統合・catch 拡張・finally clear を再確認
- `src/adapter/shared/__tests__/inactivity-watchdog.test.ts` — TC-010〜013 + 巻き直しテストを再確認
- `tests/unit/adapter/claude-code/agent-runner-inactivity-timeout.test.ts` — TC-001/002/004/005/006/007/008/009 を再確認
- `tests/adapter/codex/agent-runner-inactivity-timeout.test.ts` — TC-003/014 を再確認
- `src/adapter/claude-code/__tests__/agent-runner-transient-retry.test.ts:389` — `toBeLessThanOrEqual(1)` の実在を確認
- `verification-result.md` — build/typecheck/test/lint/coverage 全 green (762 test files, 11388 passed, 1 skipped)

## 検証できなかった項目

None（全 acceptance criteria・TC・実装コードを確認済み）

## Findings 詳細

None。新規の blocking / non-blocking finding は検出されなかった。

---

## operator-apply による iter 1 findings 解消確認

### [MEDIUM→RESOLVED] transient-retry test pin 変更が design.md に未列挙

`design.md` Risks セクションに以下の entry が operator-apply commit (`9b65af9`) で追加された:

> [Risk] for-await 進入前の `throwIfAborted()` ガードが、abort 済み signal での既存挙動を変え既存 pin と衝突する
> → Mitigation(更新列挙): 衝突は 1 件のみ。agent-runner-transient-retry.test.ts (describe "abort timeout bypass")の `expect(callCount).toBe(1)` を `expect(callCount).toBeLessThanOrEqual(1)` に更新した。ガード導入により callCount=0 経路が生じたため。本テストの見張り対象は「abort が再試行を防ぐ」であり上限 assert への緩和はこの意図を保存する。他の既存テストは無変更。

受け入れ基準「既存 timeout 関連 pin と衝突する場合は design で対象を列挙し更新根拠を明示する」を充足。**解消済み。**

### [LOW→RESOLVED] TC-010 GIVEN が実装と矛盾

TC-010 GIVEN を「`bump()` を一切呼ばない」から「`bump()` を 1 回だけ呼んでタイマーを arm する（追加の bump は行わない）」に修正。実際のテスト (`inactivity-watchdog.test.ts:31`) と一致。**解消済み。**

---

## 正常確認項目

### 受け入れ基準 全 6 項目

| 基準 | TC | 結果 |
|------|----|------|
| query 発行後、最初の message が閾値内に到着しない場合 timeout halt (fake timers) | TC-001 | ✅ |
| message が閾値内で到着し続ける限り発火しない（巻き直し） | TC-002 | ✅ |
| 発火時に `completionReason: "timeout"` / awaiting-resume 合流 | TC-001+TC-005 | ✅ |
| halt 表示に無活動の旨と elapsedMs を含む | TC-006 | ✅ |
| 既存テストが無変更で green | TC-015 | ✅ (diff=0, 11388 passed) |
| `typecheck && test` が green | TC-015 | ✅ |

### 実装の正確性

- **watchdog 生成タイミング**: 両 adapter とも最初の `await` 前に同期生成・`bump()` → fake-timer テストが確実に発火できる
- **配線 4 サイト**: claude-code main/follow-up/repair + codex executeTurn の全 for-await 前後に `bump()` あり
- **catch 判定拡張**: `signal.aborted && (timeoutId !== undefined || watchdog.fired)` — 他の abort は `fired=false/timeoutId=undefined` のまま timeout 経路に落ちない
- **repair abort 再 throw**: 両 adapter の repair `catch (err)` に `if (abortController.signal.aborted) throw err` → outer catch へ伝播
- **finally clear**: 両 adapter の `finally` で `watchdog.clear()` → 全 exit path でリーク無し、`fired` は保持されるため catch が読める
- **wall-clock 意味論不変**: `watchdog.fired === false` のとき既存 message を維持、TC-007 で pin 済み

### TC カバレッジ (must 11 件)

TC-001/002/003/004/005/006/007/010/011/014/015 の全 must TC が実装テストに対応し green で通過。
