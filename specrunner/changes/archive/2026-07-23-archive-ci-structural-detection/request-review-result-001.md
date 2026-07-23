# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### コードアサーション（4 箇所）

| 行 / 範囲 | 内容 | 確認結果 |
|-----------|------|----------|
| `src/core/archive/merge-then-archive.ts:52` | `NONE_CHECK_GRACE_MS = 60_000` | ✓ exact match |
| `src/core/archive/merge-then-archive.ts:163` | `effectiveTimeoutMs = waitTimeoutMs === undefined ? DEFAULT_MERGE_WAIT_TIMEOUT_MS : waitTimeoutMs` | ✓ exact match |
| `src/core/archive/merge-then-archive.ts:280-290` | `runArchiveOrchestrator(...)` → `archiveSha = archiveRecordResult.headSha` | ✓ lines 280–291 |
| `src/core/archive/merge-then-archive.ts:608-625` | `rollup.state === "none"` grace 超過 → "Assuming CI-less repo; proceeding to merge..." → break | ✓ lines 608–625 |

### 実装文脈の確認

- `recordDir` は Step 1 の line 212 で設定済み（`noWorktree ? cwd : (worktreePath ?? cwd)`）。`archiveSha` 取得後（line 290）〜 wait loop 開始（line 456）の間で git 検査呼び出しが可能。
- `spawn` は `runMergeThenArchive` のスコープで利用可能。`git ls-tree <sha>:.github/workflows/` および `git show <sha>:.github/workflows/<file>` を呼び出せる構成になっている。
- worktree モード・no-worktree モードいずれも `recordDir` は main リポジトリの git オブジェクトストアを共有しているため、push 後の `archiveSha` tree は `recordDir`（または `cwd`）から検査できる。
- `ArchiveResult` の型定義（`orchestrator.ts:66`）は `headSha?: string`（`undefined` あり）。`archiveSha` が `undefined` になりうる経路が存在する。

### 依存確認

- `package.json` に YAML parser（js-yaml 等）の依存なし。要件 4（依存追加なし）は現状コードで既に担保されており、実装でも追加が不要なことを確認した。

### 既存テスト

- `src/core/archive/__tests__/merge-then-archive.test.ts` に TBG-05 が存在し、`rollup.state === "none"` grace 超過後に merge に進む既存挙動を regression test として固定している。受け入れ基準の「workflow 定義の無い tree では従来どおり grace 超過後に merge へ進むことをテストで固定する」は、TBG-05 を拡張（CI 検出結果 = CI-less を明示）するか、新たな TC で補強することで対応できる。

## 検証できなかった項目

None。すべての確認すべき項目を読み取った。

## Findings 詳細

None。ブロック要因なし。

以下は観測事項（blocking なし、実装者への参考情報）:

- **`archiveSha` が `undefined` のときの fallback**: `git rev-parse HEAD` 失敗時に `archiveSha` が `undefined` になる。request では "誤検出は待つ側（fail-closed）に倒れる" と明示されているため、`undefined` のときも CI-present（fail-closed）扱いにするのが設計の意図に合致する。request に明示はないが実装者が判断すべき自明な detail。
