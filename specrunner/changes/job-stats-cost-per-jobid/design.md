# Design: job stats のコスト集計で usage.json を jobId / change-dir から解決する

## Context

### 問題の経路

`job stats` は `JobStateStore.list({ includeArchived: true })` で全 state を取得し、各行の `usage.json` を `resolveChangeDir(slug, cwd)` で解決する。`resolveChangeDir` は slug → 単一 dir（active 優先、次に最新 archive）の解決しか行わない。

同一 base-slug・別 jobId の 2 run が存在すると:

- Active `specrunner/changes/foo/` → jobId=B
- Archive `specrunner/changes/archive/2026-05-01-foo/` → jobId=A

両行とも `resolveChangeDir("foo", cwd)` は active dir を返す。jobId=A の行は `specrunner/changes/foo/usage.json`（jobId=B のもの）を読む。

`deriveRunStat` の `inv.jobId !== stateJobId` フィルタが A に属するレコードを除外するため、jobId=A の行のコストは null になる（取りこぼし）。さらに、`inv.jobId === undefined`（legacy）レコードが含まれる場合は jobId=A の行に B の usage.json の legacy 分が誤計上される（重複計上）。

### 現状コードの境界

- `resolveChangeDir`: slug → dir の解決のみ。jobId を見ない。変更しない（他 caller への波及を避ける）
- `JobStateStore.list()`: 各 state を固有の source dir から load するが、その dir を返り値に含めない
- `deriveRunStat`: `state.jobId` でフィルタ済み。正しい usage.json さえ渡せばロジックは正確

---

## Goals / Non-Goals

**Goals**:
- 各 state 行の `usage.json` を、その state が load された source change-dir（ = state.json の親ディレクトリ）から読む
- 同一 base-slug・別 jobId の 2 行がそれぞれ自分のコストだけを計上することをテストで固定する
- legacy invocation が別 dir の行へ混入する経路を塞ぐ（正しい usage.json を供給することで自然に解消）

**Non-Goals**:
- `resolveChangeDir` のシグネチャ・挙動変更
- `JobStateStore.list()` の既存 caller への影響（signature は変えない）
- stats 出力フォーマット・median / mean・並び順
- usage.json の書き込み側
- slug 日付 prefix 撤廃そのもの

---

## Decisions

### D1: `listWithSourceDirs()` を新規追加し、`list()` を委譲に変える

**Rationale**: `list()` は既存の多数の caller（ps, archive, resume, exit-guard 等）が使用しており、返り値の型を変えると全 caller の修正が必要になる。新メソッドを追加して `job stats` だけがそれを使う方が局所的で安全。

`list()` の内部実装を `listWithSourceDirs()` に移動し、`list()` は `listWithSourceDirs()` を呼んで `.map(e => e.state)` だけを返す形にリファクタする。これでコード重複なし。

**Alternatives**:
- **list() の返り値を `{ state, sourceChangeDir }[]` に変える**: 全 caller 修正が必要、波及大。却下
- **jobId → dir の再走査**: list の dedup 済み集合と再走査集合のズレリスク、二重スキャンの非効率。却下
- **changeDir を JobState フィールドに追加**: 永続フィールドが汚れる。却下

**interface**:
```
ListedJobEntry {
  state: JobState;
  sourceChangeDir: string;  // usage.json を探す基点となるディレクトリ（絶対パス）
}
```

### D2: sourceChangeDir は `path.dirname(stateJsonPath)` とする（managed marker を除く）

各スキャンセクション（active / archive / worktree / sidecar）では state.json を特定の絶対パスから読む。その親ディレクトリが usage.json の居場所と一致する（`specrunner/changes/<slug>/state.json` → `specrunner/changes/<slug>/usage.json`）。

**Managed marker（Section 4）の例外**: マーカー経由で発見された state は `.specrunner/local/<slug>/state.json` から load されるが、managed job の usage.json は慣例として `specrunner/changes/<slug>/usage.json` に置かれる。したがって Section 4 の sourceChangeDir は `path.join(repoRoot, changeFolderPath(slug))` とする。

この扱いは `resolveChangeDir(slug)` の active 解決と等価であり、managed job で同一 slug 衝突が発生しても Section 4 に到達した時点で sections 1/1b がより具体的な dir を先に返しているため影響はない（Section 4 は jobId が sections 1–3 で未発見の場合のみ追加する）。

### D3: `runJobStats` を `listWithSourceDirs()` に切り替え、`resolveChangeDir` 呼び出しを削除

`resolveChangeDir(slug, cwd)` の呼び出しと、それに伴う `slug` 変数の導出を削除する。`sourceChangeDir` を直接 `path.join(sourceChangeDir, "usage.json")` に使う。

`resolveChangeDir` import は `job-stats.ts` で他に使っていないため削除する。

---

## Risks / Trade-offs

| リスク | 影響度 | 対策 |
|--------|--------|------|
| `list()` の挙動変化（list→listWithSourceDirs 委譲） | 低 | list の返り値は同一 JobState[] のまま。委譲後も同じ dedup ロジックを通る |
| Section 4 managed marker の sourceChangeDir が slug 衝突で不正確になる | 低 | Section 4 は other sections で見つからなかった jobId のみ追加するため、衝突した pair の両方が Section 4 に到達することは構造上ない |
| `listWithSourceDirs` の新規テスト不足 | 中 | IO fixture test（T-03）が runJobStats を通じて間接的に検証する。明示的な store テストは T-04 で補強 |

---

## Open Questions

なし。設計は request 作成者の推奨案（source dir 持ち回り）を採用し、代替案（再走査）は却下した。
