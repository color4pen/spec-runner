# Decisions: test-case-generator

## TC-001〜005: StepContext 型定義と PipelineDeps 接続を 5 ケースに分割する

:: 「型が定義されている」「フィールドが正しい」「重複がない」「alias が正しい」「呼び出し元との型互換」は検証観点が異なるため、1 振る舞い = 1 テストケースの原則を適用して分割する。

## TC-006〜007: undefined as any 除去を grep ゼロ確認と deps 構築内容確認の 2 ケースに分割する

:: grep ゼロは「除去されていること」の確認、deps 構築内容確認は「正しい型で構築されていること」の確認であり、観点が異なる。grep ゼロのみでは deps に余分なフィールドが残っていても検知できないため分ける。

## TC-008〜011: ManagedAgentRunner の JobStateStore 除去を import・runProposeStyle・runPollingStyle・grep ゼロの 4 ケースに分割する

:: import が残っていれば実装が依存する可能性があるため import 確認を独立させる。runProposeStyle と runPollingStyle は別メソッドであり片方だけ除去が不完全な状態が起こり得るため分ける。_updatedState の grep ゼロは executor 側の廃止と合算して 1 ケースとする。

## TC-012〜013: executor 統合を store.update 冒頭呼び出しと managed/local 分岐除去の 2 ケースに分割する

:: 冒頭呼び出しは「ps 表示バグ修正」という独立した振る舞いの変化であり、分岐除去とは別の受け入れ基準として定義されているため分ける。

## TC-014〜016: result.sessionId 記録と result.agentBranch セットを分割し、agentBranch は上書き防止も追加する

:: sessionId と agentBranch は別フィールドであり独立して壊れ得る。agentBranch のセットは「未設定時のみ」という条件があるため、「セットされる」と「上書きしない」の 2 ケースが必要。

## TC-017: history entry 追加を should にする

:: D3 の「リスク緩和策」として記載されており、中核機能の成立には直接影響しないため。must ではなくデグレード予防の観点で should とする。

## TC-018: セッション操作の存在確認を should にする

:: Non-Goals の記載から「除去してはいけないもの」の確認だが、型チェック（TC-005）と typecheck (TC-019) が通れば間接的に保証される。独立した確認として should で追加する。

## TC-019〜020: typecheck と test run を manual にする

:: CI で実行するコマンドであり、test-case-generator が「何を検証するか」を記述する対象として category=manual が適切。自動テストとして実装するのではなく、CI pass を人間/実行者が確認する性質のもの。

## TC-021: ManagedAgentRunner テスト修正を should にする

:: テスト修正は中核機能の振る舞いではなく、テストコードの品質の問題。TC-020 の全テスト pass で間接的に担保されるため、独立ケースとして should とする。

## TC-022: specrunner ps の step 表示を could にする

:: UI/UX 確認であり category=manual。中核のリファクタリング（型安全性・責務分離）の成立には影響しないが、ps 表示バグ修正は本変更の Goals に明示されているため could として残す。

## must-areas の対応付け

| must-area（pipeline-context.md）| 対応 TC |
|---|---|
| StepContext 型の定義と接続（PipelineDeps extends StepContext の互換性）| TC-001, TC-002, TC-003, TC-004, TC-005 |
| ClaudeCodeRunner の undefined as any 除去 | TC-006, TC-007 |
| ManagedAgentRunner から JobStateStore 除去、_updatedState 廃止 | TC-008, TC-009, TC-010, TC-011 |
| executor の managed/local 分岐統合（1本道 state 管理）| TC-013, TC-014 |
| store.update(state, { step: step.name }) の冒頭呼び出し | TC-012 |
