# Spec Review Result — project-config-overlay

- **verdict**: approved
- **reviewer**: spec-reviewer
- **date**: 2026-05-26

---

## Overall Assessment

仕様の構造・整合性・セキュリティいずれも問題なし。request / design / tasks / delta spec の 4 文書間に矛盾はなく、実装に十分な情報量がある。blocking issue はなし。以下は実装者が注意すべき観察点。

---

## Findings

### F-1: `timeoutMs` 検証閾値のコード実装ズレ（pre-existing、実装時に修正必須）

**場所**: `src/config/schema.ts` line 249  
**現在の実装**:
```typescript
if (typeof timeoutMs !== "number" || !Number.isInteger(timeoutMs) || timeoutMs < 0) {
```
**baseline + delta spec の要求**: `>= 1`（`0` も `CONFIG_INVALID`）

delta spec の "steps config の値は型と範囲が検証される" が `timeoutMs: >= 1` と明記しており、baseline も同様。現実装は `>= 0` を許可しているため、Task 8 で `byRequestType` validation を追加する際に **`timeoutMs < 1`** へ合わせること。この修正は request scope に含まれる変更（既存 requirement との整合）。

---

### F-2: `deepMergeConfig` での `models` フィールドの扱い

**場所**: design.md D2 の注記「array は overlay が完全置換（config に array は `models` くらいで、deep merge 不要）」  
**実態**: `models` の型は `Record<string, ModelEntry>` で array ではなく object。

D2 の "object 型の value は再帰的に deep merge" というルールに従えば `models` も deep merge になる（project local に gpt-4 を追加しても user global の claude モデルが消えない）。これは正しい挙動。ただし注記が「array は完全置換」と書いており、`models` を array と勘違いした実装者が完全置換にしてしまうリスクがある。

**Task 3 の実装時**: `deepMergeConfig` で `models` は object deep merge として実装すること（完全置換にしない）。

---

### F-3: `FileConfigStore.load()` と `repoRoot` の不在

**場所**: `src/config/store.ts` `FileConfigStore.load()` + Task 9  
**状況**: Task 4 で `loadConfig(repoRoot?)` に署名変更するが、`FileConfigStore.load()` はラッパーとして `loadConfig()` を引数なしで呼ぶ既存実装。

Task 9 の audit リスト（run.ts / resume.ts 等）に `FileConfigStore` の呼び出し元が含まれていない。`FileConfigStore` が managed-agent setup 専用コマンドからのみ呼ばれるなら問題なし。job run パスは `runPreflight()` / `bootstrap()` 直呼びなので影響なし。Task 9 の audit 時に `FileConfigStore.load()` の呼び出し元を確認し、project local overlay が必要な文脈で使われていないか確認すること。

---

### F-4: `byRequestType` 内 model の registry check がスペックに明示されていない

**場所**: delta spec "steps config の値は型と範囲が検証される" vs tasks.md Task 8  
**状況**: Task 8 では「model registry check（既存のモデル存在検証 + managed+openai guard）を byRequestType 内の model にも適用」と明記しているが、delta spec の requirement 本文にはこの registry check が記載されていない。

delta spec の「各 value を StepExecutionConfig として validate（再帰的に適用）」という記述で十分に読み取れる範囲内であり、blocking ではない。実装者は tasks.md Task 8 の記載通り registry check を適用すること。

---

## Security Review (OWASP Top 10 観点)

| 項目 | 評価 |
|------|------|
| Path traversal | **問題なし** — project local config path は `resolveRepoRoot()` (= `git rev-parse --show-toplevel`) で解決。ユーザー入力を直接 path に連結しない |
| 設定ファイル書き込み | **問題なし** — `saveProjectConfig` は本 request では CLI 未接続（関数定義のみ）。書き込みは 0600 permission + atomic write |
| 機密情報 | **問題なし** — credentials は scope 外。`config.json` に API key 等は含まれない設計 |
| Config injection | **問題なし** — deep merge 後に `validateConfig()` を通す設計。不正値は merge 後に弾かれる |
| 既知 type 以外の key を warning のみにする方針 | **問題なし** — open string として扱う既存 parser 挙動と整合、かつ空文字列 key は CONFIG_INVALID で弾く |

---

## Spec Consistency Check

| チェック項目 | 結果 |
|-------------|------|
| request → design の要件対応 | ✅ 全 3 要件（overlay / byRequestType / validation 強化）が D1–D9 に対応 |
| design → tasks の対応 | ✅ 全 D 決定が Phase 1–7 のいずれかの Task に紐づく |
| delta spec header がベースラインと一致 | ✅ MODIFIED 対象の Requirement header は baseline と一致 |
| 新規 Requirement に Scenario が存在 | ✅ 全新規 Requirement に Given/When/Then 形式の Scenario あり |
| resolution chain (6 レベル) の一貫性 | ✅ request / design D5 / delta spec cli-config-store / delta spec step-execution-architecture で同一順序 |
| backward compat (byRequestType 未指定) | ✅ `requestType` が undefined の場合 level 1, 3 をスキップする仕様が全文書で一貫 |
| deep merge vs standalone validation の分岐 | ✅ user global なし + project local のみ → standalone validate (CONFIG_INVALID on partial) が一貫して記載 |
