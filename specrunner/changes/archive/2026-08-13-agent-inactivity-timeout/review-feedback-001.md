# Code Review Feedback — agent-inactivity-timeout — iter 1

## 検証した項目

- `git diff main...HEAD --stat` で変更スコープ確認（22 ファイル、2706 行追加・25 行削除）
- `src/adapter/shared/inactivity-watchdog.ts` — watchdog 実装全体を精読
- `src/adapter/claude-code/agent-runner.ts` — diff 全体を精読。4 カ所の bump 配線・catch 拡張・finally の clear を確認
- `src/adapter/codex/agent-runner.ts` — diff 全体を精読。executeTurn の bump・catch 拡張・finally の clear を確認
- `src/adapter/shared/__tests__/inactivity-watchdog.test.ts` — TC-010〜013 + 追加の巻き直しテストを精読
- `tests/unit/adapter/claude-code/agent-runner-inactivity-timeout.test.ts` — TC-001/002/004/005/006/007/008/009 を精読
- `tests/adapter/codex/agent-runner-inactivity-timeout.test.ts` — TC-003/014 を精読
- `src/adapter/claude-code/__tests__/agent-runner-transient-retry.test.ts` — build-fixer による変更箇所を確認
- 既存テスト(`tests/unit/adapter/claude-code/agent-runner.test.ts`, `tests/adapter/codex/agent-runner.test.ts`)の diff → 0 行変更を確認
- `verification-result.md` — 762 test files, 11388 passed, 全フェーズ green を確認
- `test-cases.md` — 15 TC の定義と実装テストの対応を照合

## 検証できなかった項目

None（全 acceptance criteria・TC・実装コードを確認済み）

## Findings 詳細

### [MEDIUM] Transient-retry test assertion が design 未記載で弱化された

**ファイル**: `src/adapter/claude-code/__tests__/agent-runner-transient-retry.test.ts:389`

build-fixer が `expect(callCount).toBe(1)` を `expect(callCount).toBeLessThanOrEqual(1)` に変更した。この既存テスト変更は `design.md` Risks セクションに列挙されておらず、受け入れ基準の要件を満たさない:

> 無活動既定の導入が既存の timeout 関連 pin と衝突する場合は、design で対象を列挙し更新根拠を明示する

**発生原因**: 各 for-await ループの前に追加した `abortController.signal.throwIfAborted()` ガードが原因。1ms wall-clock タイマーが `throwIfAborted()` 到達前に発火すると、ジェネレータ本体が一切実行されず `callCount = 0` になる。旧コードは `throwIfAborted()` がなかったため `callCount === 1` が確定していた。

**ガード自体は正しい**: W3C spec の「already-aborted signal に addEventListener しても呼ばれない」問題を防ぐ設計上必要な追加。`toBeLessThanOrEqual(1)` も "abort がリトライを防ぐ" という元テストの本質的な意図は保持している。

**必要な対処**: `design.md` Risks（または補足 Notes）にこの pin 変更を追記し、更新根拠を明示する。

---

### [LOW] TC-010 spec の GIVEN が実装と矛盾している

**ファイル**: `specrunner/changes/agent-inactivity-timeout/test-cases.md`（TC-010 GIVEN）

TC-010 GIVEN は「`bump()` を一切呼ばない」と記述しているが:

1. watchdog は生成時にタイマーを自動 arm しない — `bump()` を呼ばなければ `setTimeout` は一切呼ばれない
2. 「bump() 一切なし」で `timeoutMs` を進めても `onFire` は呼ばれず、THEN の `toHaveBeenCalledTimes(1)` は失敗する
3. 実際のテスト(`inactivity-watchdog.test.ts:31`)は `watchdog.bump()` を 1 回呼んでタイマーを arm した上で進める

テストコードは正しい。`test-cases.md` の GIVEN 記述が誤っている。

**必要な対処**: TC-010 GIVEN を「`bump()` を 1 回だけ呼んでタイマーを arm する（追加の bump は一切なし）」に修正する。

---

## 正常確認項目（non-blocking）

- **4 カ所の配線**: claude-code main/follow-up/repair + codex executeTurn すべてで `for await` 前後に `bump()` あり
- **初回 bump タイミング**: `run()` スコープで await 前に同期実行 → fake-timer テストが確実に watchdog を発火できる
- **clear タイミング**: 両 adapter の `finally` で `watchdog.clear()` → 全 exit path でタイマーリーク無し
- **fired 保持**: `clear()` 後も `_fired` は保持 → catch が `watchdog.fired` を読める
- **repair catch**: 両 adapter の repair catch が `if (abortController.signal.aborted) throw err` で abort を外側 catch へ届ける
- **timeout 判定拡張**: `signal.aborted && (timeoutId !== undefined || watchdog.fired)` — other abort（agent-redirect 等）は `fired=false/timeoutId=undefined` のまま timeout 経路に落ちない
- **wall-clock 優先**: wall-clock 先発 → abort → 同期 catch → `watchdog.fired=false` → wall-clock message。finally で watchdog 消去 → 後から watchdog が発火しない
- **既存テスト無変更**: `agent-runner.test.ts`(claude-code/codex)の diff = 0 行。TC-032/034/035/041 は完全無変更で green
- **verification**: 762 test files、11388 passed、typecheck/lint/build/coverage 全 green
