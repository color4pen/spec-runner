# checkpoint 検証を generic integrity 層と use-case policy 層に分離する

**Date**: 2026-08-20
**Status**: accepted
**Related**: `specrunner/adr/2026-06-07-resume-point-as-canonical-source.md`（resumePoint 記録の上位決定）

## Context

`src/core/attach/verify-checkpoint.ts` の `verifyCheckpoint` は、checkpoint の汎用整合性検証と `job attach --branch` 固有の resume 検証を単一関数に混在させていた。

**混在していた検証の分類**:

| 分類 | 検証内容 |
|------|----------|
| Generic integrity | journal / projection 整合、counter reversal、profile self-consistency、request.md 存在、identity (repo/jobId/branch/slug) |
| Resume policy (attach 固有) | `status === "awaiting-resume"` ガード、resumePoint + pipeline definition 解決、resume step reads() 必須入力の存在検査 |

今後、issue 起点の resume（`issue-target-resume-from-issue`）および awaiting-archive の issue 起点取り込みが同じ rebind 機構を使う。しかし混在構造では、許可 status の列挙を差し替えるだけでは対応できない——resume step の reads() 検査が他 use-case の checkpoint を誤って拒否するからである。

## Decision

### D1: policy はインターフェース実装 + デフォルト引数で注入する

`verifyCheckpoint` の第二引数として `CheckpointVerificationPolicy` を受け取る。デフォルト値は `attachResumePolicy`（既存の resume 固有検証を実装したオブジェクト）。

```typescript
interface CheckpointVerificationPolicy {
  verify(ctx: PolicyVerificationContext): void; // throws checkpointNotAttachableError
}

async function verifyCheckpoint(
  input: VerifyCheckpointInput,
  policy: CheckpointVerificationPolicy = attachResumePolicy,
): Promise<VerifiedCheckpoint>
```

既存のすべての呼び出し元（`orchestrator.ts`、テスト群）はデフォルトを使うため無改変で動く。

**Rationale**: デフォルト引数にすることで、既存テスト・呼び出し元を一切変更せずに policy 注入口を開く。データ引数（`allowedStatuses` 列挙）より交換可能性が高く、型安全な拡張点になる。

### D2: `checkpoint-policy.ts` を新規ファイルとして `src/core/attach/` に配置する

インターフェース `CheckpointVerificationPolicy`、コンテキスト型 `PolicyVerificationContext`、実装 `attachResumePolicy` を `src/core/attach/checkpoint-policy.ts` に配置し、`verify-checkpoint.ts` からインポートする。

**Rationale**: policy 定義を `verify-checkpoint.ts` に同居させると generic 層と policy 層の分離が視覚的に不明瞭になる。別ファイルにすることで責任境界が明示される。`src/core/attach/` 内に留まるため cross-layer import は発生せず、architecture allowlist への新エントリも不要。

### D3: generic 検証と identity 検証は `verifyCheckpoint` に残す

(b)(b-new)(profile) の整合性検証は use-case 非依存であり、どの use-case でも必須。policy 注入前に実行することで、policy が corrupt な checkpoint を受け取らない fail-fast 設計を維持する。request.md と identity 検証も全 use-case で共通なので generic 側に残す。

移動するのは `(a)(c)(d-new)` のみ——`status === "awaiting-resume"` ガード、resumePoint 解決、reads() 入力検査。

**実行順序**（`verifyCheckpoint` 内）:
1. Generic integrity (journal / projection / counter reversal / profile)
2. `policy.verify(ctx)` ← 注入点
3. request.md 存在確認
4. Identity (repo / jobId / branch / slug)

**Rationale**: 整合性が破れた checkpoint を policy まで流さない。policy は「整合性が確認できた checkpoint に対して use-case 固有の条件を追加する」役割に純化される。

### D4: `PolicyVerificationContext` は最小公開原則で設計する

```typescript
interface PolicyVerificationContext {
  state: NormalizedJobState;
  slug: string;
  treeFiles: string[];
}
```

attach-resume policy が必要な情報のみ（state / slug / treeFiles）を渡す。`branch` / `expectedRepo` / `checkpointOid` は含めない。

**Rationale**: 最小公開原則。将来の policy が広いインターフェースを無制限に利用しないよう、明示的な契約で絞る。

### D5: `CheckpointVerificationPolicy.verify()` は sync にする

`verify()` の戻り値は `void`（throws on failure）であり、`Promise<void>` ではない。

**Rationale**: attach-resume policy の実装に async は不要（I/O なし、純粋な引数評価）。`verifyCheckpoint` 自体は既に async なので、将来 async が必要な policy が出たら `await policy.verify()` に変えるだけで済む（one-liner change）。

## Alternatives Considered

### Alternative A: `allowedStatuses: string[]` のデータ引数

- **Pros**: シンプル
- **Cons**: reads() 検査などの手続き的ロジックを含む use-case policy を表現できない
- **Why not**: データ引数では policy 全体を封じ込められないため却下

### Alternative B: function 引数（callback）

- **Pros**: インターフェースより記述が簡潔
- **Cons**: 単一 function では policy を構成する複数の振る舞いを名前付きで整理できない。インターフェースより型表現力が低い
- **Why not**: 現在は `verify()` のみだが、将来 policy が複数メソッドを持つ可能性に対してインターフェースの方が拡張性が高い。却下

### Alternative C: HOC / factory パターン

- **Pros**: policy の合成を宣言的に書ける
- **Cons**: 現時点で合成が必要な場面がない（generic + policy の合成は `verifyCheckpoint` 自身が担う）。不要な抽象レイヤー
- **Why not**: YAGNI。却下

### Alternative D: `verify-checkpoint.ts` に同居させる（ファイル分割なし）

- **Pros**: ファイルを増やさない
- **Cons**: generic 層と policy 層の境界が視覚的に不明瞭。architecture allowlist に依存しない読者が分離を認識できない
- **Why not**: 責任境界の明示化が設計の核心であるため、別ファイルに分離する価値がある。却下

### Alternative E: `policy/` サブディレクトリ

- **Pros**: policy ファイルが増えたときに整理しやすい
- **Cons**: 現時点では `checkpoint-policy.ts` 1 ファイルのみ。サブディレクトリはオーバーキル
- **Why not**: YAGNI。policy ファイルが複数になった時点で再考する。却下

## Consequences

### Positive

- 将来の checkpoint use-case（issue-target resume、awaiting-archive 取り込み）は `CheckpointVerificationPolicy` を実装した新しい policy オブジェクトを定義し、rebind primitive に渡すだけで対応できる。`verifyCheckpoint` の変更は不要
- `verify-checkpoint.ts` の行数が net -80 行になり、責務が明確化される
- architecture allowlist への新エントリなしに拡張点が成立する（cross-layer import が発生しない）
- 既存の `job attach --branch` 公開契約（awaiting-resume のみ・検証順序・エラー文言・exit code）は完全に保存される

### Negative / Known Debt

- `CheckpointVerificationPolicy` は現時点で `attachResumePolicy` のみの実装。インターフェースの設計は awaiting-archive policy の要件が確定するまでに変更が生じる可能性がある
- `verify()` を sync にしたことで、将来 async な外部 I/O（例: remote policy 参照）を必要とする policy は `verifyCheckpoint` の signature 変更（`await policy.verify()`）を要する

## References

- Request: `specrunner/changes/checkpoint-verification-policy-split/request.md`
- Design: `specrunner/changes/checkpoint-verification-policy-split/design.md`
