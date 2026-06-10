# pipeline の error path（exhaustion / escalation / session 異常）のテストを拡充する

## Meta

- **type**: chore
- **slug**: error-path-test-coverage
- **base-branch**: main
- **adr**: false

<!-- adr 判断基準: 新しい port/adapter 追加、既存パターンと異なる設計選択、振る舞い/契約を変える修正、構造的リファクタリング → true。いずれにも該当しない → false -->

## 背景

既存テストは happy path（mock client に verdict 列を事前指定して approve まで通す）に偏っており、このツールで実際に起きやすい失敗系 — fixer ループの打ち切り、escalation での停止と resume、report_result の follow-up retry 枯渇、session 異常終了 — の検証が薄い。打ち切り判定はコード上 3 箇所に分散しており（exhaustion-consolidation で集約予定）、集約リファクタの前に現行挙動をテストで固定しておくことが安全網になる。

judge 系 step の verdict は構造化 findings から CLI が導出する（judge-verdict-from-findings）。本 request のテストはこの導出仕様を前提とする。

## 要件

1. fixer ループの exhaustion テスト: 3 つのループ（spec-review/spec-fixer、code-review/code-fixer、verification/build-fixer）それぞれで maxIterations 到達時に escalation へ遷移し、job state（status / StepRun / history）が正しく記録されることを検証する
2. escalation 停止と resume の往復テスト: escalation で halt した job を `job resume` で再開し、escalation を起こした step から正しく再入することを検証する
3. report_result follow-up retry の枯渇テスト: no-tool-call / invalid-input が maxAttempts（2 回）を超えた場合のフォールバックを検証する — judge 系は escalation、producer 系は completionVerdict（既定 success）に落ちること
4. findings 起因の escalation テスト: judge の findings に decision-needed が含まれる場合、および実在しない file を参照する blocking finding を含む場合に escalation へ遷移することを検証する
5. session 異常終了テスト: agent session の terminated / エラー終了時に SESSION_TERMINATED 系のエラーが state に記録され、job が再開可能な状態で停止することを検証する
6. verification の部分失敗テスト: 複数 phase のうち一部のみ失敗するケース（build 成功 + test 失敗等）で verdict が failed になり build-fixer ループに入ることを検証する
7. 既存の mock helper（buildPipelineMockClient 等）を拡張する場合は tests 配下の共有 helper に集約し、テストファイルごとの builder 重複を増やさない。judge 系の mock は approved boolean ではなく findings 配列を返す形に合わせる

## スコープ外

- exhaustion 判定 3 箇所の実装集約（exhaustion-consolidation として別対応）
- judge 系 verdict 導出の仕様変更
- snapshot テストの導入
- src/ の実装変更（テスト追加で発見された bug は issue 起票に留める）

## 受け入れ基準

- [ ] 3 つの fixer ループすべてに exhaustion → escalation のテストが存在する
- [ ] escalation → resume の往復がテストされている
- [ ] follow-up retry 枯渇・findings 起因 escalation・session 異常終了・verification 部分失敗の各テストが存在する
- [ ] 新規テストが実装の mock 自己申告ではなく job state の遷移（observable な結果）を assert している
- [ ] `typecheck && test` が green

## architect 評価済みの設計判断

- 実装変更を伴わないテスト拡充を exhaustion-consolidation のリファクタより先に行い、現行挙動の固定をリファクタの安全網とする
