# Spec Review Result: request-manager

- **reviewer**: spec-reviewer (iteration 3)
- **date**: 2026-05-14
- **iteration**: 3
- **verdict**: approved

## Summary

Iteration 1-2 の全指摘（F-01 HIGH, F-02 MEDIUM, F-03 MEDIUM, F-04 LOW）が修正済みであることを確認した。request.md・design.md・tasks.md・delta specs の間に未解決の不整合はない。セキュリティ上の重大リスクも確認されなかった。1 件の LOW 観察事項を記録するが、ブロッカーではない。

## Resolution of Previous Findings

### F-01: executeCreate の stdin/positional 優先順位 [HIGH] — RESOLVED

design.md L241 が正しい順序に修正済み:
1. `text !== null` → positional をそのまま使う
2. `text === null` かつ `opts.stdin` → stdin を読む
3. `text === null` かつ `!opts.stdin` → error

tasks.md 9.1(a) も同様に修正。REQ-CLI-RC-02 の規定と整合する。

### F-02: `store.read()` の delta spec Requirement 不在 [MEDIUM] — RESOLVED

specs/request-management/spec.md に REQ-RM-STORE-06 が追加済み。`read()` の動作（パース失敗時の throw、原因の非隠蔽）が明確に規定されている。

### F-03: `buildScaffoldTemplate()` の移動が design から脱落 [MEDIUM] — RESOLVED

request.md 要件 1 が修正済み: 「`buildScaffoldTemplate()` は移動しない（generator は LLM ベースの生成機能であり、テンプレートベースの scaffold とは別機能のため分離する）」と明示。design.md・tasks.md に反映不要な設計判断として整合する。

### F-04: `manager.resolve()` パラメータ順序 [LOW] — RESOLVED

design.md L221: `resolve(cwd: string, slug: string): string` — `(cwd, slug)` に統一済み。tasks.md 8.5 も同様。プロジェクト全体の慣例と整合する。

## New Findings (Iteration 3)

### F-08: run.ts slug 解決の fail-fast 順序への影響 [LOW]

**場所**: design.md L280-307 / delta spec REQ-CLI-RUN-02

design.md の `runRunCore()` は slug 解決（`fs.existsSync` + `storeResolve`）を `runPreflight()` の前に配置する。slug 解決が失敗した場合（ファイルでも active slug でもない）、`return 1` で preflight steps 1-4 の実行前に早期終了する。

baseline spec は `specrunner run` の fail-fast 順序を step 1（config 存在）→ ... → step 5（ファイル存在）と MUST で規定しており、slug 解決の早期 return は理論上この順序に影響する。

**実影響**: ファイルでも slug でもない無効な引数 AND 環境設定不備の両方が同時に発生する場合のみ、エラーメッセージの表示順が変わる。有効な入力に対する動作は一切影響なし。

**推奨**: delta spec REQ-CLI-RUN-02 の「preflight, pipeline, and all downstream behavior are unchanged」に注記を追加し、引数解決が preflight 前の pre-step であることを明示する。または design.md で早期 return を削除し、slug 解決パスを `absolutePath` に設定して preflight step 5 に存在確認を委ねる。

blocking ではない理由: 新しいエラーメッセージ（`'...' is neither a file path nor an active request slug.`）は、baseline の step 5 エラー（`ENOENT: no such file or directory`）よりユーザーにとって有用。UX は改善方向。

### F-09: ハードコードパス箇所数の事実誤差 [INFO]

**場所**: request.md module-architect 分析セクション

request.md は「6 箇所にハードコード」と記載。コードベース検証では 5 ソースファイル（slugify.ts, pipeline-run.ts, resolve-target.ts, move-requests-dir.ts, workflow-structure.ts）に分散。機能・設計上の影響なし。store.ts 集約の妥当性は変わらない。

## Security Review

### SEC-01: slugify() によるパス安全性 [PASS]

`slugify()` は `[^a-z0-9]+` をハイフンに置換し、先頭末尾のハイフンを除去する。`../`, null byte (`\x00` は `[^a-z0-9]+` にマッチしてハイフン化), スペース等のパストラバーサル文字列は生成されない。`store.resolve()` が固定パスパターン（`specrunner/requests/active/<slug>/request.md`）を構築するため、slug 経由でのディレクトリ脱出は不可能。

### SEC-02: LLM 出力のファイルシステム書き込み [PASS]

`generator.generate()` は LLM 出力を `parseRequestMdContent()` で構造検証後に `store.write()` で固定パスに書き込む。LLM が書き込み先を制御する余地なし。`allowedTools: []` により LLM のファイルシステムアクセスも完全遮断。

### SEC-03: stdin サイズ制限なし [INFO]

stdin 読み込みにサイズ上限の規定がない。CLI ツールとしては標準的な挙動。極端な入力（> 数 MB）での OOM リスクは理論上あるが、ユーザー自身が入力を制御する CLI 環境では non-blocking。

### SEC-04: `permissionMode: "bypassPermissions"` [PASS]

generator は `allowedTools: []` でツールアクセスを完全遮断しており実質的な副作用なし。reviewer は既存 `executeReview()` と同じ `allowedTools` / `permissionMode` を継承しており新たなリスクは導入されない。

### SEC-05: OWASP Top 10 該当項目 [PASS]

CLI ツールのため大半は N/A。該当するもの:
- A03 Injection: slugify() によるサニタイズで対処済み。shell exec にユーザー入力を渡す箇所なし
- A04 Insecure Design: store が固定パスパターンを強制。LLM の出力が書き込み先を制御する経路なし
- A01 Broken Access Control: ローカル CLI のため N/A（OS レベルのファイル権限に委ねる）

## Baseline Spec Compatibility

**cli-commands baseline**: delta spec REQ-CLI-RUN-02 は既存の `specrunner run` step 5 を slug フォールバックで拡張する。ファイルパスが存在する場合の既存動作は一切変わらない（後方互換）。step 1-4 の fail-fast 順序は F-08 記載の注記を除き影響なし。

**request-management baseline**: baseline は web ベース要件（Server Action, DB schema, workspace-client.tsx）、delta は CLI + FS ベース要件。異なるレイヤーであり機能的矛盾なし。CLI-first 転換の方針と整合。

## Completeness Checklist

| request.md 要件 | design.md | tasks.md | delta spec | 状態 |
|---|---|---|---|---|
| 1. モジュール構成（buildScaffoldTemplate 除外明示） | ✓ | ✓ | ✓ | OK |
| 2. request store パス | ✓ | ✓ | ✓ | OK |
| 3. 状態遷移 active→merged | ✓ | — | ✓ | OK |
| 4. slug → パス解決 | ✓ | ✓ | ✓ | OK |
| 5. list() | ✓ | ✓ | ✓ | OK |
| 6. 既存コード切り替えスコープ外 | ✓ | — | ✓ | OK |
| 7-12. generator | ✓ | ✓ | ✓ | OK |
| 13-15. reviewer | ✓ | ✓ | ✓ | OK |
| 16. request create | ✓ | ✓ | ✓ | OK |
| 17. request create --stdin | ✓ | ✓ | ✓ | OK |
| 18. request review slug 対応 | ✓ | ✓ | ✓ | OK |
| 19. request list | ✓ | ✓ | ✓ | OK |
| 20-23. run slug 対応 | ✓ | ✓ | ✓ | OK |
| store.read() | ✓ | ✓ | ✓ | OK |
