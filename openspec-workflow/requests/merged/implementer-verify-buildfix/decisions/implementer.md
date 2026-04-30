# Implementer Decisions — implementer-verify-buildfix

pipeline-integration.test.ts に `vi.mock("../src/core/verification/runner.js")` を追加し、VerificationStep 実行時に実プロセスを spawn しない :: 統合テストはパイプライン遷移の正確さを検証するものであり、実際の bun run スクリプトの有無に依存すべきでない。モックで passed を返すことで CI で安定したテストが実現できる

cli-stdout-snapshot.test.ts の TC-027/028 にカスタム遷移テーブル（spec-review approved → end）を使用する :: STANDARD_TRANSITIONS では approved → implementer になり、テストが implementer/verification までモックを要求する。stdout format ピンテストの目的（bit-for-bit exact format verification）に集中するため、最小限の遷移テーブルを採用した

init.test.ts を 3 agent から 5 agent に更新する（propose/spec-review/spec-fixer/implementer/build-fixer）:: init.ts が ImplementerStep と BuildFixerStep を AgentRegistry.fromSteps に追加したことに追従。既存テストのモック setup が 3 agent 想定だったため、5 agent のハッシュと agentId を全てのテストに反映した

BUILD_FIXER_NO_VERIFICATION_RESULT エラーを buildMessage 内で state に直接設定する :: StepExecutor は buildMessage の戻り値のみを使用し、エラーを throw する機構がない。state への直接設定により、pipeline.getStepOutcome が state.status==="failed" を検知してエラーパスに遷移できる

VerificationStep.run は deps.cwd を使用してローカルファイルに verification-result.md を書く :: CLI step は GitHub 上のファイルではなくローカル cwd 配下に直接書き込む。StepExecutor.runCliStep も同様に readFile で cwd から読み込む設計に統一した
