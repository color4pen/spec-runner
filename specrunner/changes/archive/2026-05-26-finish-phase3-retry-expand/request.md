# finish Phase 3 の transient error retry 対象を拡充する

## Meta

- **type**: bug-fix
- **slug**: finish-phase3-retry-expand
- **base-branch**: main
- **adr**: false

## 背景

PR #408 (small-cleanup-bundle) の finish で Phase 3 (= REST API squash merge) が「Pull Request is not mergeable」で fail した。Phase 2 push 直後に Phase 3 merge を試行したため GitHub のメタデータ再計算が間に合わなかった。

PR #398 で「Base branch was modified」の transient retry は実装済。ただし「not mergeable」は retry 対象外で escalation に倒れた。手動で再実行したら GitHub 計算完了後に成功。

今日の finish 7 件で出た Phase 3 transient error:

| pattern | 現状 | 発生回数 |
|---|---|---|
| `mergeStateStatus: UNKNOWN` | ✅ retry 済 | 4 回 |
| `Base branch was modified` | ✅ retry 済 (PR #398) | 1 回 |
| `Pull Request is not mergeable` | ❌ escalation | 1 回 |

= transient error pattern のカバーが部分的。Phase 2 push 後の GitHub メタデータ再計算は数秒〜十数秒かかるため、rapid succession で Phase 3 に進むと高確率で踏む。

## 要件

### 1. Phase 3 の transient error retry 対象を拡充

Phase 3 merge 失敗時の transient error retry 対象に以下のパターンを追加する (= 実際の retry logic は `src/adapter/github/github-client.ts` の `isMergeTransientFailure` + `retryWithBackoff` に実装されている。変更箇所は **design step で確定**):

- **`Pull Request is not mergeable`** (= 今回踏んだ、GitHub メタデータ再計算待ち)
- **`Head branch was modified`** (= push と merge の race condition)
- **`Required status check is expected`** (= CI 完了待ち)

**GitHub API 5xx / timeout について**: 既に `request()` 層で最大 3 回 exponential backoff retry 済。Phase 3 レベルでの追加 retry は不要 (= 既存カバレッジで十分)。

具体的な pattern matching / retry 回数 / backoff は **design step で確定**する。

## スコープ外

- **Phase 0 (= preflight) の retry 拡充** — Phase 0 の UNKNOWN retry は既に動いている、本 request は Phase 3 のみ
- **Phase 2 → Phase 3 の間に explicit wait を入れる** — retry で吸収する方針、explicit wait は別アプローチ
- **永続的な error (= repo archived / token 権限不足) の retry** — transient のみ対象

## 受け入れ基準

- [ ] Phase 3 で「Pull Request is not mergeable」が transient として retry される
- [ ] GitHub API 5xx / timeout は既存 `request()` 層の retry で十分カバーされていることを確認 (= Phase 3 追加 retry 不要)
- [ ] 永続的 error (= repo archived / 権限不足) は retry せず escalation
- [ ] 既存の「Base branch was modified」retry に regression なし
- [ ] `bun run typecheck && bun run test` が green

## architect 評価済みの設計判断

- **retry で吸収する方針**: Phase 2 push → Phase 3 merge の間に explicit wait を入れる代替案もあるが、retry の方が robust (= transient error 全般に対応可能、wait 時間の見積もり不要)
- **PR #398 の既存 retry infrastructure を拡張**: 新規 mechanism 不要、既存の pattern matching を拡充するだけ
