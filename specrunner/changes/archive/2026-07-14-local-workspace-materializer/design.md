# Design: local の setupWorkspace を WorktreeMaterializationPlan / materializeWorktree へ集約する

## Context

`LocalRuntime.setupWorkspace()` には 5 つの実行アームが存在し、「worktree を実体化して runtime へ登録する」所作が各アームで複製されている。

| アーム | 条件 |
|---|---|
| no-worktree | `opts.noWorktree === true` → `setupWorkspaceNoWorktree` に委譲 |
| resume-existing | `existingWorktreePath` がディスク上に存在する → パスを再利用 |
| resume-recreated | `existingWorktreePath` が設定されているが削除済 → 再作成 |
| resume-without-recorded-worktree | `existingWorktreePath === null` → 新規作成 |
| new-run | `existingWorktreePath === undefined` → fetch + 新規作成 |

各アームで共通して行われる「実体化＋registration」操作（`this.workspace` セット / bootstrap seed / `updateJobState(worktreePath)` / liveness sidecar / recopy）が複製されている。resume-recreated と resume-without-recorded-worktree の 2 アームはほぼ同一のコードである。

本変更は挙動を変えずに構造のみを整理する（所有権不変の抽出）。

## Goals / Non-Goals

**Goals**:
- `WorktreeMaterializationPlan` DU（識別合併型）を新設し、5 アームを型で表現する。
- `materializeWorktree(plan, ...)` private method を新設し、複製された「実体化＋registration」を 1 か所に集約する。
- `setupWorkspace` を「plan を決定 → `materializeWorktree` に委譲」のみに薄くする。
- `typecheck && test` が green のまま維持する。

**Non-Goals**:
- worktree 作成 / 再利用の判定結果（どのアームに落ちるか）を変えない。
- fetch / base branch sync の挙動を変えない。
- seed / bootstrap / liveness / recopy の実行順序を変えない。
- request.md copy / commit の挙動を変えない。
- `LocalRuntime` の 4 分割（Manager / Bootstrapper / Inspector / Cleanup）まで進めない。

## Decisions

### D1: `WorktreeMaterializationPlan` は DU として定義し、boolean flag を使わない

5 アームを `kind` フィールドで識別するタグ付き Union として定義する。各 variant には「そのアームに固有のデータ」のみを持たせる。

```typescript
export type WorktreeMaterializationPlan =
  | { kind: "no-worktree" }
  | { kind: "resume-existing"; worktreePath: string }
  | { kind: "resume-recreated"; remoteBaseRef: string }
  | { kind: "resume-without-recorded-worktree"; remoteBaseRef: string }
  | { kind: "new-run"; remoteBaseRef: string; branchName?: string };
```

**Rationale**: boolean flag の組み合わせは exhaustiveness check が得られず、新アームを追加した際に静的に検出できない。DU にすることで TypeScript の `switch` exhaustiveness check が働き、将来の追加・変更が安全になる。

**Alternatives considered**: `WorkspaceOptions` をそのまま渡してアーム判定を `materializeWorktree` 内でも繰り返す案 → 判定ロジックが 2 か所に散る欠点がある。

### D2: `WorktreeMaterializationPlan` 型は `src/core/runtime/workspace-materializer.ts` に新設する

`local.ts` に inline することも可能だが、`WorkspaceSetupPlan` が `src/core/worktree/setup.ts` に置かれているパターンに倣い、独立ファイルとする。`materializeWorktree` は `LocalRuntime` の private state（`this.manager`, `this.workspace`, `this.cwd` など）に依存するため、private method として `local.ts` に残す。

**Rationale**: 型定義を分離することで `local.ts` の import セクションが整理される。型だけのファイルなので依存グラフへの影響は最小限。

### D3: `materializeWorktree` は `LocalRuntime` の private method とする

`WorkspaceOptions`（`bootstrapState`, `requestFilePath`, `designLayerEnabled` など）の多くのフィールドが引数として必要になるため、`WorkspaceOptions` ごと渡すシグネチャとする。plan variant ごとの差分（bootstrap seed の有無、worktree 作成の有無）は `switch` で制御する。

```typescript
private async materializeWorktree(
  slug: string,
  jobId: string,
  plan: WorktreeMaterializationPlan,
  opts?: WorkspaceOptions,
): Promise<WorkspaceContext>
```

**Rationale**: private method にすることで `local.ts` の単一責任を保ちつつ、`this.manager` / `this.spawnFn` / `this.cwd` への直接アクセスを維持できる。

### D4: `setupWorkspace` は fetch / disk check などの「pre-flight」と plan 決定のみを担う

`setupWorkspace` の残る責務：
1. `this.currentSlug = slug`
2. transport auth pre-warm（既存）
3. new-run のみ: `git fetch origin` + behind/ahead 警告（既存）
4. `WorktreeMaterializationPlan` の決定
5. `materializeWorktree(slug, jobId, plan, opts)` を呼んで返す

`setupWorkspaceNoWorktree` は `materializeWorktree` の `no-worktree` arm から呼び出される。既存コードを保持し、削除しない。

**Rationale**: no-worktree arm は dirty check / branch creation という独自の pre-flight ロジックを持つため、別メソッドとして分離された状態を維持するほうが読みやすい。

## Risks / Trade-offs

- [Risk] `materializeWorktree` の `switch` で arm ごとの細かい差分（bootstrap seed の有無など）を管理することになり、ロジックが 1 か所に集中する。
  → **Mitigation**: arm ごとにコメントを明記し、既存テストが挙動不変を保証する。

- [Risk] `resume-recreated` と `resume-without-recorded-worktree` の 2 arm は現在ほぼ同一だが、将来的に差が生じる可能性がある。
  → **Mitigation**: DU の variant を分けて残すことで、将来の差分追加が型安全に行える。共通処理は内部ヘルパーに切り出すことも可能。

## Open Questions

なし。設計判断は request.md で architect 評価済み。
