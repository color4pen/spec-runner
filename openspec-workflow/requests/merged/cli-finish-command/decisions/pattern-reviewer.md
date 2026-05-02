# pattern-reviewer decisions — cli-finish-command (iteration 1)

- review-lessons「`gh pr create` 等で `--body-file <tempfile>` が使われ `--body <string>` が禁止されているか。tempfile cleanup が finally で保証されているか」(出現1回) を MEDIUM completeness で再発検出する :: spec.md / tasks.md §7.2 が `--body "Automated archive PR..."` の inline 形式で書かれているため、過去パターンの再発に該当
- review-lessons「type union 拡張時に派生 Exclude 句（`AgentStepName = Exclude<StepName, ...>` 等）の更新が独立 Requirement として明記されているか」(出現1回) を LOW maintainability で再発検出する :: `JobStatus` に `archived` を追加するが、`StepName` 拡張の有無 / `AgentStepName` Exclude の影響が spec で固定されていない
- review-lessons「module-architect の decisions が tasks の冒頭タスクとして具体作業に下ろされているか」(出現2回) を LOW maintainability で再発検出する :: module-analysis.md §6 R1-R3 が tasks.md §1 に未反映
- review-lessons「step 登録先の file path が spec 段階で実装ツリーを `grep` で確認して固定されているか。tasks.md と実装層の path 乖離がないか」(出現1回) を HIGH consistency 主因として既に F#1 で扱った :: module-analysis.md の Path correction notice がまさにこのパターンの再発
- review-lessons「スキーマ変更時に `database/spec.md` の delta spec が同梱されているか」(出現1回) は本 change には該当しない :: SpecRunner は SQLite スキーマを持たず、JSON state schema (`src/state/schema.ts`) は delta `job-state-store` spec で扱われている
- review-lessons「失敗→再実行のシナリオ（冪等性）が仕様段階で検討されているか。外部エージェントが呼ぶインターフェースはリトライ前提か」(出現2回) を MEDIUM completeness で確認した :: spec.md 冪等性 Requirement が ある程度書かれているが、archive PR OPEN 中 / 両 dir 残存時の挙動が抜けているため F#4, F#11 で補強
- review-lessons「外部 CLI 失敗（rate limit / auth / network）への自動 retry が抑制されているか。pipeline transitions に `<step> error → escalate` が追加されているか」(出現1回) を確認した :: spec.md は escalation philosophy で auto-recovery を明示的に排除しており、本 change でこのパターンは正しく適用されている。新規 finding なし
- review-lessons「派生フィールド（`state.session` 等）の真実源が単一に固定されているか。書き込み API が spec で限定されているか」(出現1回) を MEDIUM consistency に F#2 で接続した :: 既存 spec の `JobStateStore is the Sole Persistence Authority` Requirement が implementation 不在の API を canonical と宣言しており、書き込み API の真実源が spec と実装で乖離している
- review-lessons「verdict null → 正規化値の変換責任が spec の Requirement で 1 箇所に確定されているか」(出現1回) を MEDIUM consistency に F#5 で接続した :: 未知 mergeStateStatus → safe default の正規化責任が spec で確定していない
- 過去失敗 PR #42 (slug divergence)、#44 (branch propagation)、#46 (review-exit-contract) との照合は本 change に直接影響しない :: PR #42 の slug 二重導出は本 finish が「state file から request.path を読み出す」設計で回避されており、再発リスクなし。PR #44 / #46 のテーマは本 change の責務外
