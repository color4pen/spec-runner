# Design: branch 名に jobId suffix を付与する

## Design Decisions

### Decision 1: suffix は jobId UUID の先頭 8 文字

**Adopted**: `feat/<slug>-<jobId[0:8]>` 形式。例: `feat/abolish-success-status-45e9e720`

**Rejected Alternative**: ランダム文字列生成、タイムスタンプ suffix

**Rationale**:
- jobId は既に一意性が保証されている UUID であり、新たなランダム生成は不要
- 8 文字（32 bit 相当）で実用上の衝突確率は無視できる
- jobId との対応関係が可視的に維持される（デバッグ時に有用）
- タイムスタンプは秒精度で衝突する可能性があり、長くなる

**Trade-offs**:
- ✅ 既存の一意識別子を再利用、新たなランダム性不要
- ✅ branch 名から jobId を推測可能（forensics）
- ❌ branch 名が 9 文字長くなる（`-` + 8 hex）

---

### Decision 2: `stripJobIdSuffix` を `job-slug.ts` に集約する

**Adopted**: `src/state/job-slug.ts` に `stripJobIdSuffix(s: string): string` を追加し、`stripBranchPrefix` と組み合わせて使う。全消費者がこの関数を import して使用する。

**Rejected Alternative**: 各消費箇所（resolve-target.ts, register-branch.ts）にインラインで正規表現を書く

**Rationale**:
- slug 逆算ロジックの single source of truth を維持する（既存の `stripBranchPrefix` と同じモジュール）
- テストが 1 箇所に集約できる
- suffix フォーマットの変更が 1 箇所で済む

**Trade-offs**:
- ✅ DRY、テスタブル
- ✅ 既存の `job-slug.ts` の責務に合致（「branch ↔ slug の変換」）
- ❌ なし

---

### Decision 3: suffix 判定は末尾 `-[0-9a-f]{8}$` のパターンマッチ

**Adopted**: 正規表現 `/-[0-9a-f]{8}$/` にマッチする場合のみ suffix を切り落とす。

**Rejected Alternative**: 固定長で末尾 9 文字を切り落とす

**Rationale**:
- slug 自体に `-` を含むケースと区別する必要がある（例: `my-feature` は切り落とさない）
- hex 文字パターンチェックにより誤切り落としのリスクを最小化
- 既存の `feat/<slug>` 形式（suffix なし）にも正しく no-op で動作する

**Trade-offs**:
- ✅ 後方互換性を維持（suffix なしの既存 branch で no-op）
- ✅ hex パターンチェックで安全性を確保
- ❌ slug 末尾が偶然 `-` + hex 8 文字に見える場合に誤判定する理論的可能性（実用上は無視できる）

---

### Decision 4: `buildInitialMessage` の branch 引数を executor が jobId 付きで渡す

**Adopted**: `executor.ts` の `setsBranch` ロジックで `feat/${deps.slug}-${deps.jobId.slice(0, 8)}` を生成し、`buildInitialMessage` の branch 引数として渡す。`buildInitialMessage` の default parameter は変更しない（呼び出し側が常に明示的に渡す）。

**Rejected Alternative**: `buildInitialMessage` の default parameter を変更する

**Rationale**:
- `buildInitialMessage` は jobId を引数に持たない。default parameter に jobId ロジックを入れるにはシグネチャ変更が必要
- executor が branch 生成の唯一の責任者であることを維持（propose-system.ts は template に徹する）
- `setsBranch` の設計意図（executor が branch を決定する）に合致

**Trade-offs**:
- ✅ 責務分離が明確
- ✅ propose-system.ts のシグネチャ変更不要
- ❌ executor.ts の branch 生成が 1 行長くなる

---

### Decision 5: `getJobSlug` の fallback chain 内での stripJobIdSuffix 適用位置

**Adopted**: `getJobSlug` の fallback 2（branch 由来）で `stripBranchPrefix` の直後に `stripJobIdSuffix` を適用する。fallback 1（explicit slug）には適用しない。

**Rationale**:
- explicit slug は canonical（register_branch で agent が明示的に渡した値）であり、suffix を含まない
- branch 由来の slug 導出パスのみが suffix 付き branch 名を扱う
- `resolve-target.ts` の `--pr` 経路も `stripBranchPrefix` → `stripJobIdSuffix` の順で適用

**Trade-offs**:
- ✅ explicit slug パスは影響を受けない
- ✅ branch 由来パスは一貫して suffix を除去する
- ❌ なし

---

## Open Questions

_(None. 全設計判断が確定済み。)_

## Implementation Notes for Implementer

1. **`stripJobIdSuffix` の実装**: `src/state/job-slug.ts` に追加。`getJobSlug` と `stripBranchPrefix` の両方から独立した pure function として export する。

2. **消費箇所の更新順序**: `job-slug.ts` → `executor.ts` → `resolve-target.ts` → `register-branch.ts` → tests。TypeScript の型チェックで漏れを検出。

3. **テスト戦略**: `stripJobIdSuffix` の単体テスト（suffix あり / なし / slug に `-` 含む / hex でない suffix）を `tests/state/job-slug.test.ts` に追加。`register-branch-schema.test.ts` に新フォーマット branch の slug 導出テストを追加。

4. **後方互換性**: suffix なしの既存 branch（`feat/<slug>`）で `stripJobIdSuffix` が no-op であることをテストで保証する。
