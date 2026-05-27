# Spec Review Result

- **change**: github-retry-cap
- **type**: bug-fix
- **verdict**: approved

## Summary

仕様・設計・タスク・デルタ spec いずれも一貫しており、追加実装の障害となる問題は見当たらない。

## Findings

### ✅ バグ特定が正確

`github-client.ts` L81–98 を確認。429 パスと `X-RateLimit-Remaining: 0` パスはいずれも `continue` で無限ループするコードが現存する。request.md の背景記述は正確。

### ✅ 設計パターンの一貫性

`MAX_5XX_RETRIES = 3` と同じモジュールスコープ定数パターン。カウンタ初期化位置（ループ前）・チェック位置（wait前）・increment位置（wait後）が design.md の outline と tasks.md の記述で一致している。

### ✅ カウンタ共有の整合性

429 と rate-limit を単一 `attempt429` で共有する設計（D3）は、TC-RC-011 の期待値（3+3=6回目で throw）と一致する。

- fetch #1–3: 429 → count 0→1, 1→2, 2→3
- fetch #4–5: RL(0) → count 3→4, 4→5
- fetch #6: RL(0) → check(5≥5) → throw ✓

TC-RC-009/010 の "fetch 6回・sleep 5回" も同じロジックで正しい。

### ✅ デルタ spec の形式

`specs/github-api-lib/spec.md` は `## Requirements` / `### Requirement:` / `#### Scenario:` 形式に準拠。SHALL/MUST を含む。baseline の "Retry and Rate Limit Handling" と header が一致するため MODIFIED として扱われる。

### ✅ セキュリティ考察

変更は純粋な防御的修正（無限ループ上限追加）。

- 新たな attack surface なし
- ユーザー入力のパース変更なし
- トークンの扱い変更なし
- 悪意あるサーバーが連続 429 を返すケース（OWASP A05 相当の設定不備）を緩和する方向の変更

### 軽微な観察事項（ブロッカーなし）

- delta spec の Requirement 本文が既存 baseline の "All GitHub REST API calls SHALL respect rate limits and retry on transient errors." を置き換える形になる。意味は拡張方向なので問題ないが、merge tool が既存 Scenario を保持することを前提としている点は implementer が確認すること。
- `MAX_429_RETRIES` という名前が 429 専用に見えるが、rate-limit も含むことはコメント or JSDoc で補足すると可読性が上がる（tasks.md T-01 の JSDoc 更新で対応可能）。
