# Spec Review Result — worktree-guard

- **iteration**: 1
- **verdict**: approved
- **reviewed-files**: proposal.md, design.md, tasks.md

## Summary

仕様は request の全要件・受け入れ基準を網羅しており、設計判断 D1〜D4 は妥当。検出ロジックの配置（D1）、ガードの一元管理（D2）、`.git` file/directory 判定（D3）、エラー設計（D4）いずれも既存コードベースのパターンに合致。タスク分解は実装に必要十分。CRITICAL/HIGH の findings はなし。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | correctness | tasks.md:Task 1.1 | `gitdir:` パスの例が `../../.git/specrunner-worktrees/foo-12345678` だが、git の仕様では worktree の `.git` ファイルは `.git/worktrees/<name>` を指す（`specrunner-worktrees` はチェックアウト配置先であり gitdir のターゲットではない）。実装者がこの例をそのままパースすると main worktree パスの導出が壊れる | 例を `../../.git/worktrees/foo-12345678` に修正するか、「git が生成する実際の gitdir 値に従う」と注記する。導出ロジックは gitdir パス内の `.git` セグメントを見つけてその親を返す方針で変わらない |
| 2 | LOW | completeness | tasks.md:Task 3.2 | SpecRunnerError の catch 追加について「FlagParseError の catch の後に追加」と記述があるが、現在の `bin/specrunner.ts` は normal dispatch と subcommand dispatch の 2 箇所に catch がある。ガードは normal dispatch のみで十分だが、将来ガード対象にサブコマンドが追加された場合の拡張ポイントが未記載 | 現時点では normal dispatch のみで正しい。将来の拡張は発生時に対応すれば十分なので、実装上の問題にはならない |
| 3 | LOW | consistency | design.md:D3 | `.git` ファイルのパース仕様について「`gitdir:` の行をパース」と記述。git の仕様上 `.git` ファイルは単一行 `gitdir: <path>` のみだが、改行コードの扱い（trim の必要性）やエンコーディングの想定が未記載 | 実装時に `content.trim().replace(/^gitdir:\s*/, "")` 等で処理すれば問題ない。仕様レベルでの明記は不要 |

## Architecture Assessment

- **検出ロジックの配置 (D1)**: `src/core/worktree/detection.ts` は既存の `manager.ts` と同一ディレクトリ内で責務が分離されており適切。manager は worktree の CRUD、detection は実行環境の判定
- **ガードの一元管理 (D2)**: `bin/specrunner.ts` での一元チェックは DRY で、新規ガード対象コマンド追加時も `Set` に追加するだけで済む。代替案（各コマンド冒頭でチェック）を検討・棄却した理由も明確
- **エラー設計 (D4)**: 既存の `SpecRunnerError` + `ERROR_CODES` パターンに完全に準拠。ファクトリ関数のシグネチャ `worktreeGuardError(command, mainPath)` も既存ファクトリと一貫性がある
- **ENOENT フォールバック**: `.git` が存在しない場合に `isWorktree: false` を返して後段の `NOT_GIT_REPO` チェックに委譲する設計は、責務の重複を避けて堅牢

## Completeness Assessment (task decomposition)

タスク 1〜5 は以下を網羅:
- 検出ユーティリティ（Task 1）
- エラーコード追加（Task 2）
- エントリポイントへのガード挿入（Task 3）
- ユニットテスト + 統合テスト（Task 4）
- typecheck + test 検証（Task 5）

受け入れ基準 6 項目すべてに対応するタスクが存在する。不足なし。
