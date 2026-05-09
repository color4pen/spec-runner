# Spec Review Result — refactor-cli-entrypoint

- **iteration**: 1
- **verdict**: approved
- **reviewed-files**: proposal.md, design.md, tasks.md

## Summary

仕様は request の要件を正確にカバーしており、設計判断 D1〜D6 は妥当。タスク分解は実装に必要な全作業を網羅している。CRITICAL/HIGH の findings はなし。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | correctness | design.md:D4 (finish handler example) | D4 の finish handler 例が runtime error の try/catch を省略しているが、現在の finish/rm/resume/doctor は `Fatal:` + exit(1 or 2) の個別 catch を持つ。特に doctor は exit(2) で他と異なる。task 4.5 で言及はあるが例と矛盾 | D4 の例に `try/catch` を含めるか、D6 の近辺で「各 handler が必要に応じて runtime error を catch する責任を持つ。doctor は exit(2)、他は exit(1)」と明記する |
| 2 | LOW | correctness | design.md:D3, D6 | init/login/run/ps/doctor/request template は現在 unknown flag を無視するが、parseFlags 統一により unknown flag で FlagParseError が発生する。request が unknown flag 検出の集約を要件としているため意図的だが、「既存と同一の動作」要件と微妙に矛盾する | request.md の受け入れ基準「全既存コマンドが同一の引数で同一の動作」を「valid な引数に対して同一動作。unknown flag の検出は全コマンドに統一」と明確化する。実装上は対応不要 |
| 3 | LOW | architecture | design.md:D4 | CommandDef.handler の戻り値が `Promise<void>` だが、現在の一部コマンド（finish, rm, doctor）は handler 内で `process.exit(await runXxx(...))` しており handler 自身が exit code を制御する。handler が void を返す前提と process.exit() の混在が型として曖昧 | 実装時に handler 内 process.exit() を維持するなら問題ないが、将来的に handler が exit code を返す設計（`Promise<number>`）への拡張余地をコメントで残すと良い |

## Architecture Assessment

- **ファイル分割 (D1)**: flag-parser → command-registry → bin/specrunner.ts の依存方向は一方向で健全。パーサーの単体テスト可能性を確保している
- **型設計 (D2, D4)**: FlagDef は現在の全コマンドのフラグパターンを十分にカバー。CommandDef と ParentCommandDef の判別共用体は request サブコマンドに対して適切
- **責務分離**: パースロジック・コマンド定義・ディスパッチの 3 層分離は SRP に合致

## Completeness Assessment (task decomposition)

タスク 1〜6 は以下を網羅:
- パーサー実装とテスト（Task 1, 2）
- 全 9 コマンド + 2 サブコマンドのレジストリ定義（Task 3）
- エントリポイント書き換えと行数確認（Task 4）
- 既存テスト互換性（Task 5）
- typecheck + test の検証（Task 6）

不足なし。
