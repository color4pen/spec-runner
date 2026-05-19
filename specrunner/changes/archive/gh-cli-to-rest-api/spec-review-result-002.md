# Spec Review Result: gh-cli-to-rest-api (Round 2)

- **verdict**: approved
- **reviewer**: spec-reviewer
- **date**: 2026-05-19
- **based-on**: spec-review-result-001.md の指摘を受けた修正後の再レビュー

---

## Summary

spec-review-001 で指摘した C-1・C-2・C-3（Critical 3 件）および I-1・I-2・I-3（Important 3 件）はすべて delta spec + tasks.md 上で解消されている。  
ただし **canonical spec (`specs/github-api-lib/spec.md`) が delta の修正に追随していない**という新たな Important 問題が 1 件ある。実装は delta + tasks.md を権威源として進められるため実装ブロックとはしないが、将来の spec-change の baseline として残るため実装中に修正すること。

---

## 前回指摘の解消確認

### C-1: `listPullRequests` の `state` パラメータ問題 → 解消

- T-01: signature から `state` を削除し `listPullRequests(owner, repo, head, base)` に変更
- delta spec: `WHEN listPullRequests(owner, repo, head, base) is called` に修正済み
- T-03: `state パラメータなし。全状態を取得して caller でフィルタ` と明示

### C-2: `mergePullRequest` で 403 Forbidden が未ハンドル → 解消

- T-02c: `403 → { merged: false, message: "Merge failed: permission denied..." }` を追加
- delta spec: `Scenario: Merge permission denied` シナリオ追加済み

### C-3: ADR パスの誤り → 解消

- T-13: `specrunner/adr/2026-05-19-gh-cli-to-rest-api.md` に修正済み

### I-1: `Retry-After` / `X-RateLimit-Reset` 上限未規定 → 解消

- T-02a: `min(Retry-After, 60)` / `min(X-RateLimit-Reset - now, 300)` の上限を明記
- delta spec: 両シナリオに上限値を反映済み

### I-2: T-02b での既存メソッド挙動変化が暗黙的 → 解消

- T-02b に「挙動変化の明示」ブロックを追加。5xx retry 追加の影響とテスト更新方針を記述
- `verifyTokenScopes` の AbortController timeout は `signal` として `request()` に渡す方針を明記

### I-3: `createPullRequest` の 422 が未ハンドル → 解消

- delta spec に `Scenario: Create PR validation error` (422 → `SpecRunnerError(GITHUB_API_ERROR)`) を追加

---

## Important（実装中に修正すること）

### I-NEW: `specs/github-api-lib/spec.md` が delta の修正に追随していない

- **場所**: `specrunner/changes/gh-cli-to-rest-api/specs/github-api-lib/spec.md`
- **問題**: canonical spec が spec-review-001 の修正前の内容のまま残っており、delta spec と 4 点で矛盾している:

| 差異 | canonical spec (誤) | delta spec (正) |
|---|---|---|
| `listPullRequests` signature | `(owner, repo, head, base, state)` — state あり | `(owner, repo, head, base)` — state なし |
| 429 rate limit wait | cap なし (`Retry-After` header の値そのまま) | `min(Retry-After, 60)` 秒 |
| X-RateLimit-Remaining=0 wait | cap なし (`X-RateLimit-Reset` epoch まで) | `min(X-RateLimit-Reset - now, 300)` 秒 |
| 403 Forbidden (merge) | シナリオなし | `{ merged: false, message }` を返す |
| 422 Unprocessable (create) | シナリオなし | `SpecRunnerError(GITHUB_API_ERROR)` をthrow |

- **影響**: この変更が merge された後、`specs/github-api-lib/spec.md` が次の spec-change の baseline として参照される。誤った内容が残ると C-1/C-2/I-1 の regression を再招来するリスクがある。
- **修正**: 実装フェーズ中に canonical spec を delta spec の内容に合わせて更新すること (T-14 完了前に実施)

---

## Minor（実装者の判断に委ねる）

### M-1: `html_url` → `url` の mapping が暗黙的

- T-02c は `POST /repos/.../pulls` の response から `html_url` を取得するが、port interface の戻り値は `url` と記述している。adapter 内で `html_url → url` を mapping することを tasks/delta spec のいずれも明示していない。
- 実装で自然に解決される範囲だが、delta spec の `createPullRequest` シナリオに `response.html_url を url として返す` の一文を加えると精度が上がる。

### M-2: token をログ・エラーメッセージに含めない旨が未明示（前回から継続）

- `request()` method が Authorization header を構築するため、エラーログが詳細なリクエスト情報を出力すると token が漏れる経路がある。
- tasks か delta spec に「error message / log に token 値を含めない」制約を 1 行追加することを推奨。

### M-3: `runner.ts` のフィルタロジックが未記述

- T-03 は「全状態を取得して caller でフィルタ」と書くが、`runner.ts` が何の state でフィルタするか（= 既存 OPEN PR の確認）を tasks に明記していない。実装者が既存コードを読めば判断できるため blocking ではない。

---

## セキュリティレビュー

### 確認済み（問題なし）

- **A01 Broken Access Control**: 403 → `{ merged: false }` の escalation 設計は適切。admin bypass は token 権限で暗黙処理（D4）。
- **A02 Cryptographic Failures**: HTTPS 強制は GitHub API の前提として成立。token は Authorization header 経由。
- **A03 Injection**: `owner`/`repo` は `getOriginInfo()` (git remote 解析) 由来。`prNumber` は TypeScript number 型で URL 組み込み。コード制御範囲の入力で injection リスクは低い。
- **A05 Security Misconfiguration**: `X-GitHub-Api-Version` の class 定数管理（D5）は適切。
- **A06 Outdated Components**: `2022-11-28` は現行 stable version。

### 懸念（前回 M-2 から継続）

- token のログ漏洩リスクは M-2 として前回も指摘済み。spec 上の制約がないまま実装に入るリスクが残る。

---

## 確認済み（問題なし）

- delta spec 3 ファイルのフォーマット準拠: validation result は approved
- design.md D1〜D8 の設計判断: すべて適切（前回確認済み、変更なし）
- tasks.md の実装タスク: T-01〜T-14 の内容は delta spec と整合している
- T-01 port interface: `state` パラメータなし、4 メソッドの戻り値型は正確
- T-02a の rate limit cap: `min()` 上限は I-1 の要件を満たす
- T-11d / T-11e のテスト設計: retry・field mapping の網羅性は適切
- ADR パス: `specrunner/adr/2026-05-19-gh-cli-to-rest-api.md` で正しい

---

## 実装フェーズへの申し送り

1. **I-NEW を最初に解消**: `specs/github-api-lib/spec.md` を delta と同期してから T-01 実装に入ること
2. **T-02b の挙動変化**: 既存テストの 5xx mock は retry exhausted まで 5xx を返し続けるよう更新が必要（T-11a〜T-11c 実施時に注意）
3. **M-2 の token ログ**: `request()` 実装時に error catch 部分で token が出力されないことを明示的に確認すること
