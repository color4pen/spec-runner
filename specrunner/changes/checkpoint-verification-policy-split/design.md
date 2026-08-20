# Design: checkpoint 検証の分離 — generic integrity と use-case policy の二層化

## Context

`src/core/attach/verify-checkpoint.ts` の単一関数 `verifyCheckpoint` が、
checkpoint の汎用整合性検証と `job attach --branch` 固有の resume 検証を混在させている。

**現在の検証順序（単一関数内）**:
- (b-new) version 2: events.jsonl 必須
- (b) journal / projection integrity
- (b-new) counter reversal
- (profile) profile self-consistency
- **(a) `status === "awaiting-resume"`** ← resume 固有
- **(c) resumePoint + pipeline definition 解決** ← resume 固有
- **(d-new) resume step reads() 必須入力の存在検査** ← resume 固有
- (d) request.md 必須
- (e) identity (repo / jobId / branch / slug)

(b)(b-new)(profile)(d)(e) は use-case 非依存の整合性検証。
(a)(c)(d-new) は resume use-case の policy である。

将来の use-case（issue 起点 resume、awaiting-archive 取り込み）が rebind 機構を使う際、
現在の混在構造では許可 status の列挙を差し替えるだけでは対応できない
（resume step の reads() 検査が他 use-case の checkpoint を誤って拒否する）。

## Goals / Non-Goals

**Goals**:
- `verifyCheckpoint` を「generic integrity 検証 → use-case policy 検証 → identity 検証 → 返却」に再構成する
- policy を注入可能な単位（インターフェース実装）として定義し、差し替えで別 use-case に対応できる構造にする
- 既存の `job attach --branch` の公開契約・挙動・エラー文言を一切変えない
- 既存テストを無改変で green のままにする（挙動保存の証拠）

**Non-Goals**:
- awaiting-archive 用 policy の実装
- issue-target 層 / `job resume --from-issue`
- `job attach` の CLI surface 変更
- checkpoint publish 側（`commitFinalState`）の変更

## Decisions

### D1: policy はインターフェース実装 + デフォルト引数で注入

`verifyCheckpoint` の第二引数として `CheckpointVerificationPolicy` を受け取る。
デフォルト値は `attachResumePolicy`（既存の resume 固有検証を実装したオブジェクト）。

既存のすべての呼び出し元（orchestrator.ts、テスト群）がデフォルトを使うため無改変で動く。

**Rationale**: `policy = attachResumePolicy` デフォルト引数にすることで、
既存テスト・呼び出し元を一切変更せずに policy 注入口を開く。
データ引数（allowedStatuses 列挙）より交換可能性が高く、型安全な拡張点になる。

**Alternatives considered**:
- `allowedStatuses: string[]` のデータ引数 — resume 固有の reads() 検査まで含むと不十分
- function 引数（callback） — インターフェースより型表現力が低い
- HOC / factory — 不要な抽象レイヤー (YAGNI)

### D2: 新ファイル `src/core/attach/checkpoint-policy.ts` に policy 定義を配置

インターフェース `CheckpointVerificationPolicy`、コンテキスト型 `PolicyVerificationContext`、
実装 `attachResumePolicy` を `checkpoint-policy.ts` に配置し、
`verify-checkpoint.ts` からインポートする。

**Rationale**: policy 定義を `verify-checkpoint.ts` に同居させると
generic 層と policy 層の分離が視覚的に不明瞭になる。
別ファイルにすることで責任境界が明示される。
ファイルは 1 本（interface + 実装の同居）で新たな抽象レイヤーは増えない。

**Alternatives considered**:
- `verify-checkpoint.ts` 内に同居 — 分離が視覚的に不明瞭
- `policy/` サブディレクトリ — 1 ファイルのためオーバーキル

### D3: generic 検証と identity 検証は verifyCheckpoint に残す

(b)(b-new)(profile) の整合性検証は use-case 非依存であり、どの use-case でも必須。
policy 注入前に実行することで、policy が corrupt な checkpoint を受け取らない安全弁になる。
(d)(e) の request.md と identity 検証も全 use-case で共通なので generic 側に残す。

`(a)(c)(d-new)` のみを `CheckpointVerificationPolicy.verify()` に移動する。

**Rationale**: 整合性が破れた checkpoint を policy まで流さない fail-fast 設計。
policy は「整合性が確認できた checkpoint に対して use-case 固有の条件を追加する」役割に純化される。

### D4: `PolicyVerificationContext` に必要な情報のみを渡す

```
PolicyVerificationContext {
  state: NormalizedJobState;
  slug: string;
  treeFiles: string[];
}
```

attach-resume policy が使う情報: state（status / resumePoint / step）、
slug（step reads() の minDeps 構築）、treeFiles（reads() 必須入力の存在確認）。

**Rationale**: 最小公開原則。policy が branch / expectedRepo / checkpointOid に触れる必要はない。

**Alternatives considered**:
- フル input オブジェクトをそのまま渡す — 不必要に広いインターフェース

### D5: `CheckpointVerificationPolicy.verify()` は sync

```
CheckpointVerificationPolicy {
  verify(ctx: PolicyVerificationContext): void;  // throws checkpointNotAttachableError
}
```

attach-resume policy の実装に async は不要（I/O なし、純粋な引数評価）。

**Rationale**: 現時点で async を先んじて付けるのは YAGNI。
`verifyCheckpoint` は既に async なので将来 async が必要な policy が出たら
`await policy.verify()` に変えるだけで済む（one-liner change）。

**Alternatives considered**:
- `Promise<void>` 返却 — 将来の flexibility のためだが現時点では不要

## Risks / Trade-offs

[Risk] `verifyCheckpoint` の signature 変更（第二引数追加）が既存呼び出し元を壊す
→ Mitigation: デフォルト引数 `policy = attachResumePolicy` で後方互換を保証。
   既存テスト無改変 green が証拠となる。

[Risk] architecture allowlist への新エントリが必要になる可能性
→ Mitigation: `checkpoint-policy.ts` は `src/core/attach/` 内に留まり、
   既存の import パターン（attach モジュール内の相互参照）の範囲内。
   新しい cross-layer import は発生しない。
   `architecture/` の allowlist テストは新エントリなしで green になる。

[Risk] resume 固有ロジック移動時に検証順序が変わる
→ Mitigation: policy.verify() の呼び出し位置を現在の (a) の位置（integrity 後・identity 前）
   に合わせる。既存テストが検証順序を間接的に pin しているため、順序ずれは検出される。

## Open Questions

なし。要求・スコープ・受け入れ基準が明確で設計上の未解決事項はない。

<!-- spec-fixer-deferred: [LOW] Result YAML の automated: 11 が Summary の 14 件と不整合 spec-fixer の scoped write paths に test-cases.md が含まれないため修正不可。test-cases.md の Result YAML 内 automated: 11 を automated: 14 に変更する必要がある。 -->
