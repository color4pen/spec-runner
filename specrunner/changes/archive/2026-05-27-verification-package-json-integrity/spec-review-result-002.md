# Spec Review Result: verification-package-json-integrity

- **verdict**: approved

## Summary

spec-review-001 が指摘した 2 件の required fix が両方正しく適用されている。設計・仕様・セキュリティ観点ともに問題なし。実装に進んでよい。

---

## spec-review-001 fixes 確認

### Fix 1 — JSON 正規化（tasks.md T2.1）✅

`Object.entries(s).sort()` によるキーソート正規化が正しく記述されている。
旧来の「JSON.parse → JSON.stringify で正規化される」という誤記は削除済み。
比較ロジック:
```typescript
const normalize = (s: Record<string, string>) =>
  JSON.stringify(Object.fromEntries(Object.entries(s).sort()));
normalize(baselineScripts) !== normalize(currentScripts)
```
が tasks.md T2.1 に明示されており、Notes for Implementer の説明文も整合している。

### Fix 2 — spec.md キー順序 edge case シナリオ ✅

以下のシナリオが spec.md に追加されている。

```
#### Scenario: scripts キー順が異なるだけで内容が同一の場合
- Given: baseline の `scripts` と worktree の `scripts` はキーと値が同一だがキーの出現順が異なる
- When: `runVerificationPhases(slug, cwd, baseBranch)` を呼ぶ
- Then: integrity check は tampered を検出せず、従来通り phase が実行される
```

---

## セキュリティ評価

**Command injection（問題なし）**: `spawn("git", ["show", \`origin/${baseBranch}:package.json\`], { cwd })` は配列形式。`baseBranch` はシェルを経由せず git の単一引数として渡されるため、シェルメタ文字によるインジェクションは発生しない。

**JSON.parse（問題なし）**: git object database からの出力を JSON.parse するのみ。コード実行リスクなし。

**Path traversal（問題なし）**: `path.join(cwd, "package.json")` は固定ファイル名。

**False negative（設計上許容済み）**: `origin/<baseBranch>` が fetch されていない場合はチェックをスキップ。design.md D3 Trade-offs に明記されており、pipeline 前提として妥当。

---

## Advisory（ブロックなし）

**`outputPath` 変数スコープ（実装メモ）**: 現在の `runVerificationPhases` では `outputPath` が関数末尾（line 377）で定義されている。T3.1 の早期 return で `writeVerificationResult(result, outputPath)` を呼ぶには、`outputPath` の定義を関数冒頭（integrity check の前）に移動する必要がある。tasks.md に明記されていないが、実装上自明な対応であり spec 修正は不要。

**Unit test タスク（spec-review-001 Advisory 継続）**: `checkPackageJsonScriptsIntegrity` の unit test が tasks.md に定義されていない点は引き続き advisory。integration test（bun test 通過）で受け入れ基準を充足するため、ブロックしない。

---

## 結論

request.md / design.md / tasks.md / spec.md 間の整合性を確認済み。受け入れ基準は spec.md の全 Scenario に対応しており完全。実装フェーズに進んでよい。
