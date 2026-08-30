# Design: RuntimeStrategy の read-only consumer を consumer-owned capability へ分割する

## Context

`src/core/port/runtime-strategy.ts` は 793 行・28 メソッドの facade port である。read-only な leaf consumer の多くは 1〜2 メソッドしか呼ばないにもかかわらず、全インターフェースを依存型として受け取っている。

### 現状の consumer 分類

| ファイル | 依存型 | 実際に使うメソッド |
|---|---|---|
| `no-op-detect.ts` | `RuntimeStrategy` | `listChangedFiles` |
| `finding-recency.ts` | `RuntimeStrategy` | `readRevisionContent` |
| `prior-round-context.ts` | `RuntimeStrategy \| undefined` | `listCommitChangedFiles` |
| `post-fix-context.ts` | `RuntimeStrategy \| undefined` | `listCommitChangedFiles` |
| `custom-reviewer-round-context.ts` | `unknown` (→ cast to `RuntimeStrategy \| undefined`) | `listCommitChangedFiles` |
| `scope-check.ts` | `PipelineDeps`（内部で `runtimeStrategy` を利用） | `canDeriveChangedFiles`, `listChangedFiles` |
| `runtime-capability-gate.ts` | `Pick<RuntimeStrategy, 'canDeriveChangedFiles'>` | `canDeriveChangedFiles` |
| `achieved-assurance.ts` | `Pick<RuntimeStrategy, 'readFileAtCommit'>` as type alias | `readFileAtCommit` |

`runtime-capability-gate.ts` と `achieved-assurance.ts` はすでに局所的に絞られているが、匿名 Pick のまま（前者）または RuntimeStrategy import が残る型エイリアス（後者）のため、整理の余地がある。

### 問題点

- consumer が不要な mutation/lifecycle メソッドを認識する
- test fake が全体 interface に引きずられ `as unknown as RuntimeStrategy` が残る
- read-only 境界が型で表現されていない（責務が曖昧）
- `custom-reviewer-round-context.ts` が `unknown` 経由で RuntimeStrategy を取り込んでいる（型安全性の欠落）

---

## Goals / Non-Goals

**Goals**:
- read-only leaf consumer ごとに必要最小限の named capability interface を定義する
- 対象 consumer（上記 8 ファイル）を narrow 型に移行する
- 対象 test fake の forced cast を除去する
- LocalRuntime / ManagedRuntime が各 capability を満たすことを contract test で保証する
- leaf consumer が full `RuntimeStrategy` へ戻らないことを compile-time test で保証する
- `architecture/components.md` を更新し、責務と依存方向を明示する

**Non-Goals**:
- mutation/lifecycle capability の分割（R2b）
- `RuntimeStrategy` facade の廃止（R2c）
- `LocalRuntime` / `ManagedRuntime` の実装変更
- `lastCommitTouchingPath` 等の未使用メソッド削除
- executor.ts・pipeline.ts などのオーケストレーション層の型変更
- 機能追加や外部公開 API の変更

---

## Decisions

### D1: capability interface は `src/core/port/runtime-strategy.ts` に同居させる

**Rationale**: DU return types（`ChangedFilesResult`、`CommitFileResult`、`RevisionContentPair`）はすでにこのファイルに定義されており、consumer はいずれも import が必要になる。新たな import パスを増やさずに DU 型と capability を同じファイルに置くことで、参照の局所性が上がる。

**代替案**: 新ファイル `src/core/port/runtime-capabilities.ts` — 追加 import レイヤーが増えるだけでメリットがないため却下。

### D2: 3 つの named capability interface を新設する

```
ChangedFilesCapability     = { canDeriveChangedFiles?(); listChangedFiles(...) }
CommitInspectionCapability = { listCommitChangedFiles?(oid, cwd) }
RevisionContentCapability  = { readRevisionContent?(file, priorOid, cwd, branch) }
```

| Capability | Consumer |
|---|---|
| `ChangedFilesCapability` | `no-op-detect.ts`, `scope-check.ts` |
| `CommitInspectionCapability` | `prior-round-context.ts`, `post-fix-context.ts`, `custom-reviewer-round-context.ts` |
| `RevisionContentCapability` | `finding-recency.ts` |

**Rationale**: request 記載の候補群（changed-file derivation / commit inspection / revision content inspection）を責務境界として 3 分割した。single mega-interface にはしない。

**代替案**: consumer ごとに個別のローカル型を定義する — 複数 consumer が同じメソッドセットを必要とする場合に重複が生じるため却下。

### D3: `AssuranceProvenanceRuntime` を Pick エイリアスから明示的 interface へ昇格させる

- Before: `type AssuranceProvenanceRuntime = Pick<RuntimeStrategy, 'readFileAtCommit'>`（RuntimeStrategy import が残る）
- After: `export interface AssuranceProvenanceRuntime { readFileAtCommit?(...): Promise<CommitFileResult> }`（自己完結）

**Rationale**: `achieved-assurance.ts` から RuntimeStrategy の import を除去できる。`CommitFileResult` は port から import すれば足りる。

### D4: `runtime-capability-gate.ts` の匿名 Pick を `ChangedFilesCapability` 参照へ置き換える

- Before: `Pick<RuntimeStrategy, 'canDeriveChangedFiles'>`
- After: `Pick<ChangedFilesCapability, 'canDeriveChangedFiles'>` — `canDeriveChangedFiles` のみを使う gate に合わせた最小指定

**Rationale**: `RuntimeStrategy` への依存を切り、DU 定義済みの named capability を参照することで匿名 Pick を廃止する。gate が必要とするのは predicate 1 つだけなので `ChangedFilesCapability` をまるごと受け取る必要はない。

### D5: `scope-check.ts` の `deps: PipelineDeps` をローカル最小型へ置き換える

`computeExtraScopeFindings` の `deps` 引数型を次のインライン型へ変更する:

```ts
deps: {
  slug: string;
  request: { baseBranch?: string };
  cwd?: string;
  runtimeStrategy: ChangedFilesCapability | undefined;
}
```

TypeScript の structural typing により、`PipelineDeps` はこの型を満たすため、呼び出し元（`executor.ts`）のコード変更は不要。`scope-check.ts` は `PipelineDeps` と `RuntimeStrategy` の両 import を除去できる。

**Rationale**: scope-check は PipelineDeps のうち 4 フィールドしか使わない。型をインライン最小化することで依存境界を型レベルで表現できる。

**代替案**: PipelineDeps を引き続き使い内部で `const rt: ChangedFilesCapability | undefined = deps.runtimeStrategy;` とキャストする — 関数シグネチャが依然 PipelineDeps → RuntimeStrategy を要求するため、"import から切り離す" という目的を達成できない。却下。

### D6: capability interface の optional メソッドはそのまま optional のまま維持する

`listCommitChangedFiles?`, `readRevisionContent?`, `canDeriveChangedFiles?`, `readFileAtCommit?` は capability でも optional のまま。

**Rationale**: RuntimeStrategy における optional の意味（managed runtime がサポートしない / test fake が省略可能）はそのまま保持する必要がある。consumer のガード節（`if (!runtimeStrategy?.listCommitChangedFiles) return null;` 等）の semantics を変えてはならない。required に変更すると既存のガード不変条件が崩れる。

### D7: `PipelineDeps.runtimeStrategy` は `RuntimeStrategy | undefined` のまま維持する

executor.ts・command runner などのオーケストレーション層は引き続き full facade を受け取る。

**Rationale**: R2b（mutation/lifecycle 分割）の先取りを避ける。オーケストレーション層は read-only 以外のメソッドも呼ぶため、capability に絞ることは現時点では不適切。

### D8: contract test は TypeScript の assignability チェック（compile-time）で行う

新ファイル `tests/unit/core/runtime/capability-contracts.test.ts` に次の形式でテストを追加する:

```ts
// LocalRuntime が各 capability を満たすことをコンパイル時に保証
const local: LocalRuntime = createTestLocalRuntime();
const _c1: ChangedFilesCapability = local;
const _c2: CommitInspectionCapability = local;
const _c3: RevisionContentCapability = local;
```

**Rationale**: structural typing の性質上、型代入が通ればランタイム実行は不要。failing compile は即座に検知できる。

### D9: leaf consumer の非退行を type-narrowed 呼び出しテストで保証する

各 consumer 関数に narrow 型のオブジェクトのみを渡す呼び出しテストを追加（または既存テストを narrow 型に書き換える）。`RuntimeStrategy` 型を用いずに関数が呼べることを型チェック時に保証する。

---

## Risks / Trade-offs

**[Risk] scope-check の structural narrowing が将来の PipelineDeps 変更で壊れる**
→ Mitigation: インライン型に含めるのは `slug: string`, `request: { baseBranch?: string }`, `cwd?: string`, `runtimeStrategy: ChangedFilesCapability | undefined` の 4 フィールドのみ。`ParsedRequest` が `baseBranch?: string` を持つ限り安全（現在の型は満たす）。

**[Risk] optional capability メソッドを持つ実装が将来省略されても compile error にならない**
→ Mitigation: `RealRuntimeStrategy` 交差型がすでに Local/Managed に optional を非 optional として要求している。capability contract test がさらに assignability を確認する二重の保護がある。

**[Risk] E2E テスト（`pipeline-sole-committer-e2e.test.ts`、`custom-reviewers-e2e.test.ts`、`pipeline-integration.test.ts`）の forced cast は本変更の対象外**
→ これらは full pipeline mock であり、leaf consumer の test fake ではない。`as unknown as RuntimeStrategy` が残っても本変更の受け入れ基準（"対象箇所の forced cast を除去"）は達成される。ただし実装者は対象範囲外であることを確認すること。

**[Risk] `CommitInspectionCapability` を満たすオブジェクトを `ManagedRuntime` から渡す際に runtime 動作が変わる**
→ Mitigation: ManagedRuntime.listCommitChangedFiles は常に `unavailable` を返す（no local worktree）。consumer はすでに `result.kind !== "success" → return null` で fail-closed している。動作変化なし。

---

## Open Questions

**Q1**: `CommitInspectionCapability` に `captureHeadSha` を含めるか？
→ `captureHeadSha` は executor.ts（オーケストレーション層）が呼ぶため対象外。D7 の判断と一致。含めない。

**Q2**: capability interface を `RuntimeStrategy` の extends として宣言するか（例: `interface RuntimeStrategy extends ChangedFilesCapability`）？
→ 本変更では行わない。RuntimeStrategy の宣言を構造変更することは R2c の準備作業。現時点では structural typing で十分。

**Q3**: `listChangedFiles` は `ChangedFilesCapability` で required のまま維持するか？（RuntimeStrategy でも required）
→ はい。RuntimeStrategy でも required なので capability でも required のまま。optional にする必要はない。
