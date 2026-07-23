# Code Review Feedback — archive-ci-structural-detection — iter 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

- `git diff main...HEAD --stat` でスコープ確認（2 src ファイル変更、2 test ファイル追加）
- `design.md` / `tasks.md` / `spec.md` / `test-cases.md` を全文読解
- `src/core/archive/workflow-ci-detection.ts` — 新規モジュール全行確認
- `src/core/archive/merge-then-archive.ts` — diff 全行、変更箇所（L627–672）の前後コンテキスト含め確認
- `src/core/archive/__tests__/workflow-ci-detection.test.ts` — 全テスト確認（TC-007〜TC-022 + 追加ケース）
- `src/core/archive/__tests__/merge-then-archive.test.ts` — 既存テスト残存確認 + 新規 CI detection テスト（TC-001〜TC-023）全確認
- `verification-result.md` — build / typecheck / test / lint / changed-line-coverage すべて passed 確認
- `package.json` diff — 変更なし確認（dependency 追加なし）
- acceptance criteria 5 件すべてを test evidence と照合
- test-cases.md の must 7 件すべてのカバレッジ確認

## 検証できなかった項目

None。

## Findings 詳細

### F-001: `archiveSha === undefined` 時の `reason: "inspection-failed"` — 意味的不正確（info）

`merge-then-archive.ts:635-636`:

```ts
if (archiveSha === undefined) {
  cachedCiPresence = { present: true, reason: "inspection-failed" };
```

inspection が失敗したのではなく *スキップされた* 場合に `"inspection-failed"` を使っている。
`CiDetectionReason` 型に `"sha-unavailable"` 相当のコードがないためやむを得ないが、
ログ/デバッグ時に「なぜ inspection-failed なのか」が分かりにくい。
動作（`present: true`）は正しく、どのテストもこの `reason` 値をアサートしていないため非 blocking。

### F-002: CI-present 待機ログの経過時間が grace 起点 — 全体待機時間ではない（info）

`merge-then-archive.ts:666-669`:

```ts
`PR #${prNumber} CI-present (push/pull_request workflow detected) but no checks yet after ` +
`${Math.round(elapsed / 1000)}s. Waiting ${pollIntervalMs / 1000}s...`,
```

`elapsed = now - noneGraceStart`（grace 開始起点）であり、`now - start`（全体待機起点）ではない。
grace 超過後にしか表示されないため実際には常に ≥60s を表示するが、オペレーターには total wait 時間のほうが有用。
既存の grace-running ログと同じスタイルであり、誤動作はない。非 blocking。

---

## 受け入れ基準 確認結果

| 基準 | 判定 | 根拠 |
|------|------|------|
| push/pull_request workflow → "none" grace 超過でも merge せず → timeout で escalation | ✅ | TC-001, TC-016, TC-018, TC-019 |
| workflow 定義なし → grace 超過後に merge 進行 | ✅ | TC-002 |
| schedule のみ workflow → CI-less 判定 → merge | ✅ | TC-003 |
| 新規 package dependency 追加なし | ✅ | `git diff -- package.json` 空 |
| `typecheck && test` green | ✅ | verification-result: 631 files, 9341 passed |

## must TC カバレッジ

| TC | Description | 実装テスト |
|----|-------------|-----------|
| TC-001 | CI-present → fail-closed → escalation | merge-then-archive.test.ts TC-001 |
| TC-002 | No workflow → CI-less → merge | merge-then-archive.test.ts TC-002 |
| TC-003 | Schedule-only → CI-less → merge | merge-then-archive.test.ts TC-003 |
| TC-004 | Unreadable archive commit → fail-closed | merge-then-archive.test.ts TC-004 (ls-tree exits 128) |
| TC-006 | No new dependency | package.json diff 空 |
| TC-015 | archiveSha undefined → ls-tree 不呼出 → fail-closed | merge-then-archive.test.ts TC-015 |
| TC-016 | Detection cached — ls-tree 1 回のみ | merge-then-archive.test.ts TC-016 |

全 7 must ケース網羅済み ✅

## 正確性評価

- **CI_TRIGGER_RE**: design D2 と一致。`push-image` は非マッチ（`push` 直後のデリミタが `-` であり範囲外）。`pull_request_target` / `pull_request_review` は prefix match でマッチ。fail-closed バイアス正しく実装。
- **BLOCKED 優先ガード**: grace 超過 + BLOCKED → CI detection 前に branch-protection escalation。TC-017 で `lsTreeCallCount === 0` を確認。
- **キャッシュ**: `cachedCiPresence === undefined` で一度だけ検出、以降は再利用。TC-016 でイテレーション複数回でも `ls-tree` 1 回のみ確認。
- **`null` timeout**: `effectiveTimeoutMs !== null` ガードにより `waitTimeoutMs: null` 時はデッドライン判定スキップ。TC-023 で継続ループを確認。
- **副作用なし（CI-present timeout 時）**: TC-019 で `mergePullRequest` / `runPostMergeCleanup` / `markJobArchived` すべて非呼出を確認。
- **既存回帰**: TBG-05（CI-less → merge）は `makeSpawn()` が `ls-tree` に空 stdout を返すことで `no-workflows → present: false → break` の経路が維持される。
- **spawn の使い分け**: 検出に使う `spawn` はパラメータから注入された plain spawn（transport-auth wrapper なし）。D3 に準拠。
