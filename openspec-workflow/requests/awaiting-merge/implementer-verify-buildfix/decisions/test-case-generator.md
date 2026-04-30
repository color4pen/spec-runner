# Decision Log — test-case-generator (implementer-verify-buildfix)

## 2026-04-30

- must 領域を 26 件に設定する :: pipeline-context.md の Workflow Options には emphasis 指定はないが、指示で明示的に列挙された 11 の must-area がすべてビジネスクリティカルな振る舞い（discriminator、fail-fast 順序、import 禁止 grep、型定数共有、skip filter、kind dispatch、transition table、loop guard、error shape、null 正規化、汎用化）であるため、全件 must とした

- TC-001〜TC-004 を VerificationStep の kind discriminator と StepExecutor 分岐に充てる :: design.md D1 が「executor の step 非依存性を保つ」ための最重要決定であり、実装の正しさを最初に固める必要があるため

- TC-005〜TC-008 の runVerification シナリオを 4 件（all-passed / one-failed / multi-failed / all-skipped）に分割する :: design.md D3 の fail-fast と verification-runner/spec.md が要求する 4 シナリオが distinct であり、1 件にまとめると境界条件（break のタイミング、VERIFICATION_NO_RUNNABLE_PHASES）が曖昧になるため

- TC-009 を bun:* / Bun.* grep テスト（unit）として分類する :: CI で自動検証可能な grep アサーションは unit テストとして扱うのが本プロジェクトの既存パターン（tasks.md T-3.6 / T-8.3 が明示的に "grep 検証" を求めている）であるため

- TC-010 を NULL_PARSE_RESULT の 4 step 共有テストとして独立させる :: tasks.md T-1.4 が「propose / spec-fixer / implementer / build-fixer の 4 step 全件で共有」と明示しており、1 step だけ検証しても共有の保証にならないため

- TC-012 の transition table エッジを must とする :: pipeline-orchestrator/spec.md が 12 行全件を MUST と明示しており、1 行でも欠けると pipeline の遷移が壊れる致命的リスクがあるため

- TC-013〜TC-014 を LOOP_ERROR_CODES lookup の spec-review / verification 両 cycle に分ける :: tasks.md T-9.5 が「両サイクルに適用」と明示しており、一方だけ通過しても汎用化の意図を検証できないため

- TC-048〜TC-049〜TC-050〜TC-053 を manual とする :: Anthropic API 接続 / 実機 verification / 全テスト regression / init.ts の目視確認はいずれも CI 自動化不可またはビルドアーティファクト検証であるため。TC-053 は init.ts のソースと test の更新確認であり、実行環境の副作用確認を伴うため manual に分類

- TC-050（既存テスト regression 0 件）を must とする :: proposal.md の受け入れ基準に「既存テスト regression 0 件」が明示されており、これが崩れると PR のマージ判断が不可能になるため

- should 15 件は重要だが中核機能（kind discriminator・fail-fast・LOOP_ERROR_CODES）が動けば機能として成立する領域（buildMessage 内容、system prompt キーワード、型 union 確認、extensibility）に配置する :: 中核 must を先に固めた上で quality 向上を図る優先順位を表現するため

- could 4 件（TC-046/047/051/052）は後続 PR でも担保できる extensibility・設定確認・stateless 性に割り当てる :: 初期実装の完了判定には必須でないが文書化として残す価値があるため
