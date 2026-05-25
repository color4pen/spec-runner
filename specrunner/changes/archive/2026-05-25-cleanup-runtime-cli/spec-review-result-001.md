# Spec Review Result: cleanup-runtime-cli

- **verdict**: approved

## Summary

3 件の cleanup (課題 A: drafts 空 dir 残置、課題 B: repo root 解決のコメント欠如、課題 C: resolveRepoRoot 重複) について、request → design → tasks の整合性・網羅性・セキュリティを確認した。

## 確認済み項目

### 整合性

- **request ↔ design**: D1/D2/D3 が要件 1/2/3 に 1:1 で対応。スコープ外の境界も設計に反映されている。
- **design ↔ tasks**: ファイル変更表と Task 番号が一致。コードスニペット付きで実装者の迷いがない。
- **ps.ts call site**: Task 2c が「呼び出し箇所はそのまま」と述べる根拠を確認 — `ps.ts:141` がすでに `opts.repoRoot ?? await resolveRepoRoot() ?? process.cwd()` パターンであり、private `resolveRepoRoot(): Promise<string | null>` の戻り型が新 util と一致している。問題なし。
- **job-show.ts 型差分**: private 版は `Promise<string>` (fallback 込み) → 新 util は `Promise<string | null>`。Task 2b が `?? process.cwd()` の追加を明示しており正しい。

### 網羅性

- 受け入れ基準 7 項目すべてに対応する Task が存在する。
- テスト: canonical / legacy 両形式の削除挙動と `resolveRepoRoot` の silent/fail-fast 両モードが Task 4 に含まれる。

### セキュリティ

- `fs.rm(path.dirname(opts.requestFilePath), { recursive: true, force: true })`: `requestFilePath` は `job start` 実行時に draft から読み込んだパスであり、実行時の直接ユーザー入力ではない。内部 CLI ツールのスコープでは許容可能なリスク。
- `resolveRepoRoot` は `spawnCommand` 経由の read-only git 呼び出しのみ。状態変更なし。

## 軽微な所見 (ブロックなし)

1. **`endsWith("/request.md")` ガードの境界**: slug が `request` という名前になると `specrunner/drafts/request/request.md` となり問題ないが、slug にパス区切り文字が含まれた場合 (= `request new` が防ぐべき) は意図しない親 dir を指す可能性がある。現行の slug バリデーションで kebab-case しか許可されていれば実害なし。実装時に slug バリデーションの存在を確認すること (blocking ではない)。

2. **Task 3 コード例の `path` import**: コメントで「既に存在する可能性あり、要確認」と正しく注記されている。`local.ts` の既存 import を実装者が確認すれば十分。
