# Spec Review Result: verification-package-json-integrity

- **verdict**: needs-fix

## Summary

セキュリティ目的は正当。脅威モデル・設計判断・スコープ境界はいずれも妥当。ただし tasks.md に **事実誤認** が 1 件あり、実装時に false positive を生む設計バグを招く可能性があるため修正が必要。

---

## Finding 1 — tasks.md の JSON 正規化に関する事実誤認 (needs-fix)

**場所**: `tasks.md` T2.1 Notes for Implementer

> `JSON.stringify` での比較はキーの順序に依存する。ベースラインとワークツリーで JSON.parse → JSON.stringify すれば正規化される

この記述は **誤り**。`JSON.parse` はテキスト中のキー出現順を保持するため、`JSON.parse → JSON.stringify` だけでは正規化は行われない。

```
// 実証: 同じ内容でキー順が異なる 2 つの JSON
JSON.parse('{"test":"vitest","build":"tsc"}') → JSON.stringify → '{"test":"vitest","build":"tsc"}'
JSON.parse('{"build":"tsc","test":"vitest"}') → JSON.stringify → '{"build":"tsc","test":"vitest"}'
// → 比較結果は false（false positive）
```

package.json の scripts キー順が baseline とワークツリーで異なる場合（例: `prettier --write` による自動整形、別の npm クライアントによる書き換え等）、scripts が改変されていないにもかかわらず `tampered: true` を返す。

**修正方法**: T2.1 の比較ロジックをキーソートによる正規化に変更する。

```typescript
// 変更前
JSON.stringify(baselineScripts) !== JSON.stringify(currentScripts)

// 変更後
const normalize = (s: Record<string, string>) =>
  JSON.stringify(Object.fromEntries(Object.entries(s).sort()));
normalize(baselineScripts) !== normalize(currentScripts)
```

tasks.md の Notes for Implementer のコメントも訂正すること（「JSON.parse → JSON.stringify すれば正規化される」→「Object.entries().sort() でキーを昇順ソートして正規化する」）。

---

## Finding 2 — spec.md にキー順序の edge case シナリオが欠落 (minor, needs-fix に含める)

**場所**: `specs/verification-package-json-integrity/spec.md`

Finding 1 の修正に合わせ、spec.md に以下のシナリオを追加すること。

```
#### Scenario: scripts キー順が異なるだけで内容が同一の場合

- Given: baseline の `scripts` と worktree の `scripts` はキーと値が同一だがキーの出現順が異なる
- When: `runVerificationPhases(slug, cwd, baseBranch)` を呼ぶ
- Then: integrity check は tampered を検出せず、従来通り phase が実行される
```

---

## Finding 3 — Unit test タスクが未定義 (advisory)

**場所**: `tasks.md` Phase 4

T4.1–T4.3 は typecheck/lint/test の通過確認のみ。セキュリティ目的の関数 `checkPackageJsonScriptsIntegrity` に対する unit test タスクが明示されていない。

spec.md の各 Scenario（scripts 改変検出、未改変通過、dependencies 変更許容、baseBranch undefined スキップ、git show 失敗スキップ）は全て直接テスト可能である。追加を推奨するが、今回の needs-fix 判定の主因は Finding 1 であるため、本 Finding は advisory とする。

---

## セキュリティ評価

**Command injection リスク（問題なし）**: `git show` の呼び出しは `spawn("git", ["show", \`origin/${baseBranch}:package.json\`], { cwd })` の配列形式。`baseBranch` はシェル経由でなく git の単一引数として渡されるため、シェルメタ文字によるインジェクションは発生しない。

**False negative リスク（設計上許容済み）**: `origin/<baseBranch>` が fetch されていない場合はチェックがスキップされる。design.md の Trade-offs に明記されており、pipeline の前提条件として妥当。

**主目的達成**: implementer agent による `bun run <script>` を通じた任意コマンド実行を防ぐという目的は、設計通りに達成される。

---

## 修正対象ファイル

1. `tasks.md` — T2.1 の比較ロジック記述とキー正規化の説明文を修正
2. `specs/verification-package-json-integrity/spec.md` — キー順序 edge case シナリオを追加
