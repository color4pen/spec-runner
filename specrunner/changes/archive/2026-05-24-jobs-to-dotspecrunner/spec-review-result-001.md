# Spec Review Result

- **change**: jobs-to-dotspecrunner
- **reviewer**: spec-reviewer
- **verdict**: needs-fix

---

## Summary

設計方針・スコープ定義・spec 構造は全体として妥当。`module-level state` パターン・config schema 追加・`.gitignore` ユーティリティの設計はいずれも整合的で後方互換も保たれている。

ただし tasks.md の `cancel.ts` に関する実装指示に **ordering バグを誘発する仕様ギャップ** がある。このまま実装に渡すと project mode での `cancel` コマンドが job を発見できない状態になる。

---

## Findings

### [F1] Critical — cancel.ts における setJobsLocation の順序指示が誤っている

**対象**: `tasks.md` Task 3

tasks.md は cancel.ts の修正指示として「既存の repo root 解決の後に config load + setJobsLocation() を追加」と記している。しかし現在の `cancel.ts` を確認すると、`JobStateStore.resolveId(jobId!)` の呼び出し（line 56）は repo root 解決（line 70）より**前**に行われている。

`resolveId` は内部で `getJobsDir()` を呼ぶ。`setJobsLocation()` が未呼び出しの場合、module default は `"xdg"` であるため、project mode で `cancel <jobId>` を実行すると XDG パスをスキャンして job を発見できず、エラーになる。

tasks.md の指示どおりに実装すると「repo root 解決後」に `setJobsLocation()` が呼ばれるが、その時点では `resolveId` がすでに間違ったディレクトリを参照済みである。

**修正内容**: tasks.md Task 3 の cancel.ts 指示を次のように変更する。

> cancel.ts: 関数冒頭（arg validation の直後、resolveId より前）で config load + repo root 解決 + setJobsLocation() を呼ぶ。config load / repo root 解決が失敗した場合は setJobsLocation("xdg") で fallback。

### [F2] Moderate — cancel.ts の --all-terminated パスが setJobsLocation の対象外

**対象**: `tasks.md` Task 3、`design.md` D3

`cancel.ts` の `--all-terminated` ブランチは `cancelAllTerminated()` を呼んだ後に即 return する。この経路は F1 の修正対象（resolveId 以降のコード）を通らない。`cancelAllTerminated()` が内部で `listJobStates()` 等を呼ぶ場合、project mode では XDG を参照してしまう。

design.md D3 の表には `cancel.ts` が列挙されているが `--all-terminated` パスへの言及がない。tasks.md にも記載なし。

**修正内容**: tasks.md Task 3 の cancel.ts 指示に「`--all-terminated` パスも含めて、関数冒頭で setJobsLocation を呼ぶこと」を明示する。

### [F3] Minor — verbose-execution-log/spec.md の Purpose が "TBD"

**対象**: `specs/verbose-execution-log/spec.md` line 3

Purpose セクションが `TBD` のまま残っている。Requirements 内容自体は完結しているため機能への影響はないが、spec の品質として埋めておくことが望ましい。

**修正内容**: Purpose を「verbose 有効時の実行ログファイルの保存先・命名・追記モード動作を定義する」等の一文で埋める。

---

## Security Assessment

- **path traversal**: `repoRoot` は `git rev-parse --show-toplevel` から取得するため user input ではなく安全。
- **ファイル書き込み**: `ensureDotSpecrunnerGitignore` はローカル `.gitignore` への追記のみ。冪等設計で問題なし。
- **module-level state**: 単一プロセス CLI での使用であり race condition の懸念なし。
- **OWASP 該当なし**: CLI ツール（Web サーバーでない）のためインジェクション・認証等は対象外。

---

## Required Changes

| # | 対象ファイル | 変更内容 |
|---|---|---|
| F1 | `tasks.md` Task 3 | cancel.ts の setJobsLocation 呼び出し位置を「resolveId より前、関数冒頭」に修正 |
| F2 | `tasks.md` Task 3 | --all-terminated パスも setJobsLocation の対象であることを明示 |
| F3 | `specs/verbose-execution-log/spec.md` | Purpose の "TBD" を具体的な一文に置き換え |

F1 は実装バグ直結のため必須修正。F2・F3 は品質改善として推奨。
