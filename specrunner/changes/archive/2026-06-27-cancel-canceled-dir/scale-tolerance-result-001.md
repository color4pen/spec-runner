# Scale-Tolerance Review — cancel-canceled-dir (iteration 1)

- **reviewer**: scale-tolerance
- **verdict**: approved

## 対象変更の概要

| ファイル | 変更内容 |
|---|---|
| `src/util/paths.ts` | `canceledChangesDirRel()` / `canceledChangeFolderPath()` — 純粋パス関数を追加 |
| `src/store/job-state-store.ts` | `list()` の `changes/*` 走査（section 1・2）に `entry.name === "canceled"` skip 条件を追加 |
| `src/core/cancel/runner.ts` | `evacuateChangeFolder()` 追加 + `cancelSingleJob()` の処理順再構成（evacuate → persist → cleanup） |
| `tests/unit/core/cancel/runner.test.ts` | worktree-only / no-worktree / 衝突防止 / request.md 保全テスト追加 |

---

## 観点別評価

### 1. ディレクトリ走査（readdir / glob）の変更

**`JobStateStore.list()` — section 1: `changes/*` 走査**

```typescript
if (!entry.isDirectory() || entry.name === "archive" || entry.name === "canceled") continue;
```

- `readdir(changes/)` は `canceled` を 1 エントリとして返す。`entry.name === "canceled"` の判定でサブツリー全体を **ロード前にスキップ** する。
- `canceled/` 内の tombstone 件数（N件）は `readdir(changes/)` の結果エントリ数に一切影響しない（`canceled` は常に 1 エントリ）。
- ロードと表示の分離（「必要分しか読まない」）が正しく実装されている。**コスト増なし。**

**section 2: worktree 内 `changes/*` 走査**

同様の skip 条件を防御的に追加。worktree 内に `canceled/` サブディレクトリが存在しても走査対象外となる。**コスト増なし。**

**`resolveId()` の `list(includeArchived: true)` 経路**

`canceled/` は `list()` の skip 条件で除外されるため、`resolveId()` に影響なし。

### 2. 呼び出し経路の頻度（定期実行への影響）

- `evacuateChangeFolder()` は `cancelSingleJob()` からのみ呼ばれる（手動コマンド）。
- tick / exit-guard / polling ループへの新規コスト追加なし。
- `cancelAllTerminated()` は既存の `JobStateStore.list()` を呼ぶが、`canceled/` 除外により影響なし。

**定期実行経路に成長依存のコストを追加していない。**

### 3. GitHub API 一覧系呼び出し

変更なし。本変更はファイルシステム操作のみ。API 呼び出し・ページング・rate limit への影響ゼロ。

### 4. 並列 fan-out の多重度

新規 `Promise.all` なし。`evacuateChangeFolder()` は直列 I/O（mkdir → cp → rm）。

### 5. 増え続けるファイル・ディレクトリの新設

**`canceled/<slug>-<jobId8>/` tombstone の蓄積**

- `cancelSingleJob()` を呼ぶ度に `specrunner/changes/canceled/<slug>-<jobId8>/` が 1 件作成される。
- 現在のコードには tombstone の削除経路がない：`--purge` はサイドカー（`.specrunner/local/<slug>/`）のみ削除、`cancelAllTerminated()` も同様。
- 設計が明示的にこれを認識し cleanup を別 request に defer している（design.md Open Questions）。

**影響の評価**:

- ディスク蓄積コスト: tombstone 1 件 = change-folder のコピー（state.json + events.jsonl + artifacts、通常数 KB 〜 数百 KB）。件数に比例してディスク使用量は増加する。
- スキャンコストへの影響: `list()` は `canceled` エントリを O(1) でスキップするため、tombstone 件数が増えても **走査・ロード・API のコストは比例しない**。
- 既存の `archive/` ディレクトリもコード上の削除経路を持たない（git 管理・利用者裁量）。`canceled/` は untracked である点で異なるが、スキャンコストの観点では同等の扱い。
- scale-tolerance の判定基準「成長依存のコストが手動コマンドに限定され、かつ走査前フィルタで必要分しか読まない」を満たす。

**観察事項（非ブロッキング）**: cleanup が存在しない点は将来の `job gc` 相当コマンドで対応が望まれるが、スキャン/ロード/API コストへの比例成長は発生しないため、scale-tolerance 基準での merge ブロックには当たらない。

---

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | Retention | `src/core/cancel/runner.ts` | `canceled/` tombstone が蓄積するが cleanup 経路がない。ディスク増加のみでスキャンコストは増えない。設計が defer 明示済み。 | 別 request で `job gc --canceled` 相当を実装する（本 request スコープ外として設計が確認済み）。 |

---

## 総合

走査・ロード・API コストの観点では問題なし。`list()` は `canceled/` を filter-before-load で除外するため、tombstone 件数が増えてもスキャンコストは O(1) のまま。evacuate は手動コマンドからのみ呼ばれ、tick・exit-guard・polling 経路に成長依存コストを追加していない。tombstone の retention 欠如は LOW 観察事項として記録するが、スキャンコストへの比例成長が存在しないため承認とする。
