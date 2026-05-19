# Spec Review Result: verbose-execution-log

- **verdict**: approved
- **date**: 2026-05-19
- **reviewer**: spec-reviewer

---

## Summary

仕様全体の整合性・網羅性・セキュリティに問題なし。実装可能な状態。
2 点の指摘（うち 1 点は ADR で対処すれば十分）を記録する。

---

## Findings

### [advisory] HTTP status がポーリングログから抜け落ちている

**場所**: request.md 要件3 vs tasks.md T-06-b

request.md は「ポーリング回数・間隔・レスポンス HTTP status」を記録対象として明記している。
T-06-b が生成するログエントリは以下:

```typescript
logVerbose("poll", "poll attempt", {
  sessionId,
  intervalMs,
  sessionStatus: session.status,  // HTTP status ではなく session の状態
});
```

`retrieveSession()` は SDK ラッパーであり、生の HTTP status コードを返さない。
これは SDK の制約として意図的に落とした可能性が高い。

**対処**: ADR の「設計判断」セクションに「HTTP status は SDK 抽象化により取得不可のため `sessionStatus`（session object の status 文字列）で代替」と 1 文追記すること。テスト (T-09-e) のアサーション対象も `sessionStatus` で書けばよく、動作に影響しない。

---

### [minor] T-04-c の buildDeps 失敗パスが implicit

**場所**: tasks.md T-04-c

T-04-c は `closeVerboseLog()` を挿入すべき箇所を 3 点列挙しているが、`buildDeps` 失敗 (runner.ts:131 → return 1) は注記止まりで番号付きリストに含まれていない。実装者がメモに気づかず抜かす可能性がある。

`initVerboseLog()` を挿入する T-04-b の直後にある `buildDeps` 失敗パスは確実に `closeVerboseLog()` が必要。

**対処**: 実装時に runner.ts の全 `return 1` / `return exitCode` の直前に漏れなく `closeVerboseLog()` を入れること（注記の通り）。tasks.md の修正は不要。

---

## Security Review

| 項目 | 評価 |
|------|------|
| ログへの機密情報漏洩 | `maskSensitive()` を `JSON.stringify()` 結果に適用 ✓ |
| パストラバーサル | `jobId` は内部 state store 由来の制御済み値 ✓ |
| ログインジェクション | JSON シリアライズにより構造が保証される ✓ |
| ディレクトリ作成権限 | `~/.local/state/` はユーザー自身の領域 ✓ |
| XDG_STATE_HOME 環境変数 | 空文字チェック済み（既存 XDG パターンと同一） ✓ |

---

## Positive Notes

- `logFd === null` のみでガードする設計により、コールサイトに二重チェックが不要。シンプル。
- `initVerboseLog` の try-catch でディレクトリ作成失敗を吸収し、パイプラインをブロックしない設計は適切。
- JSON Lines + `jq` でリアルタイム監視できる形式の選択は妥当。
- test では `XDG_STATE_HOME` を tmpdir に向けることで既存パターンと整合した DI を実現している。
- delta spec 2 ファイルとも request.md 要件を正しくカバーしている。
