# Scale-Tolerance Review — resume-from-progress (iteration 1)

- **reviewer**: scale-tolerance
- **verdict**: approved

## 対象変更の概要

| ファイル | 変更内容 |
|---|---|
| `src/core/resume/resolve-step.ts` | `stateStep?: string` 引数追加、`ALL_STEP_NAMES_SET.has(stateStep)` による O(1) フォールバック判定 |
| `src/core/command/resume.ts` | 早期 guard 削除、`state.step` を第 3 引数として `resolveResumeStep` に渡す |
| `src/core/inbox/__tests__/run-inbox.test.ts` | stale running + resumePoint なし job の 1 サイクル回復テスト追加（test のみ） |
| その他 | テストファイル・change folder 成果物のみ |

## 観点別評価

### ディレクトリ走査（readdir / glob）

新規走査なし。

`resolve-step.ts` の変更は `ALL_STEP_NAMES_SET`（モジュールロード時に一度だけ生成される定数サイズの Set）への `has()` 呼び出しのみ。走査もファイル I/O も一切含まない。

### 定期実行経路（inbox tick）へのコスト追加

変更なし。`run-inbox.ts` の本体は無変更。`JobStateStore.list(repoRoot)` の呼び出し（line 88）は `includeArchived` なしのまま維持され、archive ディレクトリは走査しない。

むしろ **コスト削減**が生じる：

- 変更前: `resumePoint` がない stale running job は `ResumeCommand.prepare()` の guard（旧 163-166 行）で失敗 → inbox が 3 回 `resumeJob` を試みた後に escalation
- 変更後: 同じ job が 1 サイクルで回復 → inbox tick あたりの `resumeJob` 呼び出しが 3 → 1 に削減

inbox tick 経路に成長依存のコストは追加されていない。

### GitHub API 一覧系呼び出し

変更なし。コメント取得・ページング・並列 fan-out はいずれも run-inbox.ts 本体に属しており、このPRの変更対象外。

### 増え続けるファイル・ディレクトリの新設

なし。変更は既に永続化済みの `state.step` を読み取るだけで、新たなファイルは作成しない。

### 並列 fan-out の多重度

変更なし。

## 総合

このPRはスケール軸（archive / sidecar / issue / コメント / journal）のいずれにも触れない。唯一 inbox 関連で変化するのは「stale-running job の回復試行回数」であり、その方向はコスト削減。`needs-fix` 要件（定期実行経路への成長依存コスト追加、または retention なき成果物新設）に該当する箇所は存在しない。
