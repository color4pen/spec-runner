# Spec Review Result: cost-efficiency-pipeline

- **verdict**: approved
- **reviewer**: spec-reviewer
- **date**: 2026-05-25

---

## Summary

設計全体は堅固。既存パターン（atomic write / artifact lifecycle / port-adapter 分離）に正確に追従しており、dual write vs derived の選択理由も明確。実装に進んで差し支えない。以下は実装時に注意すべき点と、1 件のセキュリティ指摘。

---

## Findings

### [SECURITY] F-01: slug パラメータの path traversal

**対象**: T-07 `showUsage(slug, cwd)` / T-04 `appendInvocation(draftUsageJsonPath(slug), ...)` / T-05 `usageJsonPath(slug)`

`slug` は CLI 引数から直接受け取るユーザー入力。`draftUsageJsonPath` / `usageJsonPath` は単純文字列結合でパスを構成するため、`specrunner usage ../../etc/shadow` のような入力でリポジトリ外のファイルを読み書きできる。

CLI ツールであり攻撃対象面は限定的だが、`appendInvocation` は **書き込み** を行うため影響度は無視できない。

**推奨対応**: `showUsage` のエントリポイントと `appendInvocation` の呼び出し前に slug をバリデーションする。slug は既存の `slugify()` 出力と同じ文字集合（英数字 + ハイフン、スラッシュ / ドット禁止）に制限すること。正規表現例: `/^[a-z0-9][a-z0-9-]*[a-z0-9]$/`

---

### [IMPLEMENTATION GAP] F-02: `atomicWriteJson` が親ディレクトリを作成するか未検証

**対象**: T-04 (request generate の usage.json 追記)

design.md D3 に「`atomicWriteJson` が `mkdir` するため順序を意識する必要はない」と記載されているが、`src/util/atomic-write.ts` の実装がディレクトリ自動作成を保証するか要確認。

generate の場合、`appendInvocation` を `store.write()` より前に呼ぶと、draft ディレクトリがまだ存在しない状態で write を試みる可能性がある。

**推奨対応**: `appendInvocation` 内で `fs.mkdir(path.dirname(filePath), { recursive: true })` を `atomicWriteJson` の前に実行するか、`store.write()` 後に `appendInvocation` を移動する。

---

### [IMPLEMENTATION GAP] F-03: `FinishFs` 型の存在確認

**対象**: T-06 `derive-usage.ts` の関数シグネチャ

```typescript
export async function deriveAndWriteUsage(params: {
  ...
  fs: FinishFs;
}): Promise<DeriveUsageResult>
```

`FinishFs` が `src/core/finish/types.ts` に定義されているか実装前に確認すること。存在しない場合は `node:fs/promises` の必要メソッドを直接使用するか、インターフェースを新設する。

---

### [IMPLEMENTATION GAP] F-04: T-06 の `cwd` vs `repoRoot` の役割が曖昧

**対象**: T-06 `deriveAndWriteUsage` パラメータ

```typescript
export async function deriveAndWriteUsage(params: {
  jobId: string;
  slug: string;
  cwd: string;       // finish orchestrator の作業ディレクトリ (worktree?)
  repoRoot: string;  // main worktree root?
  ...
})
```

`changes/<slug>/usage.json` の絶対パス構築に使うのが `cwd` か `repoRoot` か、finish orchestrator の呼び出し側と derive-usage.ts 内で一致している必要がある。orchestrator.ts で `archiveCwd` と `cwd` の 2 つが使われている文脈を確認し、usage.json パス構築に使うべき root を明示すること。

---

### [MINOR] F-05: slug-from-path 抽出ロジックが未実装詳細

**対象**: T-04 CLI handler (command-registry.ts)

`request review /path/to/request.md` 形式で slug を抽出するロジックについて、design.md は「`specrunner/drafts/<slug>/request.md` パターンで slug 抽出を試み、失敗時は silent skip」と記述しているが、パスの正規化（絶対 / 相対 / symlink）とパターンマッチの実装詳細は tasks.md に記載がない。

実装時に `path.relative(cwd, filePath)` で正規化し、`^specrunner/drafts/([^/]+)/request\.md$` にマッチする場合のみ slug として使用するのが堅実。

---

## 受け入れ基準との照合

| 基準 | 設計カバレッジ |
|------|--------------|
| request review 後に usage.json に entry が append | D3 + T-04 で規定 ✓ |
| 2 回 review で 2 entry 蓄積 | T-02 appendInvocation の append-only で保証 ✓ |
| request generate でも同様 | D3 + T-04 で規定 ✓ |
| job start 後に draft→change folder コピー | D4 + T-05 で規定 ✓ |
| pipeline 完走後に step usage が追記 | D5 + T-06 で規定 ✓ |
| finish 後 archive に usage.json が含まれる | git mv による自動包含で保証 ✓ |
| `specrunner usage <slug>` で詳細表示 | D6 + T-07 で規定 ✓ |
| `specrunner usage` で全 archive サマリ | D6 + T-07 で規定 ✓ |
| usage.json なしの旧 archive は silent skip | D6 + T-07 で規定 ✓ |
| step model 切替の動作確認 | T-08 で規定 ✓ |
| typecheck && test が green | T-09 で規定 ✓ |

---

## セキュリティ評価 (OWASP Top 10)

- **A01 (Broken Access Control)**: 該当なし（認証・認可変更なし）
- **A03 (Injection)**: JSON は `JSON.stringify` 経由のため injection なし。F-01 の path traversal は上記で指摘済み
- **A05 (Security Misconfiguration)**: 該当なし
- **その他**: ネットワーク呼び出し・DB クエリの変更なし。影響範囲はローカルファイルシステム読み書きのみ

---

## 総評

設計判断（dual write 不採用 / finish 時一括 derive）は理にかなっており、既存の artifact lifecycle にシームレスに乗る。F-01 の path traversal は実装段階で対処可能であり、仕様の再設計を要しない。F-02〜F-05 は実装者へのガイダンスとして残す。
