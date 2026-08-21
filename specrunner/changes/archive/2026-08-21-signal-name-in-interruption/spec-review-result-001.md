# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 1. ソースコードの現状確認（request.md 前提の検証）

- `src/core/runtime/local.ts:1683-1721` を読み、`signalCleanup` が引数なし `async (): Promise<void>` で定義され、SIGINT / SIGTERM のみ登録されていることを確認。`appendInterruption({ type: "interruption", reason: "signal", ts: ... })` と `transitionJob` の `reason: "Interrupted by signal"` が固定文字列であることを確認。
- `src/core/runtime/managed.ts:741-776` を読み、同型の `signalCleanup` が SIGINT / SIGTERM のみ登録されていること、`appendInterruption` 呼び出しがないことを確認。
- `src/core/lifecycle/exit-guard.ts:55-171` を読み、`handleNoWorktreeExit` / `handlePerJobExit` が `appendInterruption` を呼ぶこと、`handleGlobalExit` は呼ばないこと、いずれも `isSignalHandlerFired()` チェックを先頭に持つことを確認。
- `src/core/resume/canon-provenance.ts:27-32` の `INTERRUPTION_REASONS` が `"signal"` を含む Set であり、フィールド追加の影響を受けないことを確認。
- `src/store/event-journal.ts:90-98` の `InterruptionRecord` に `signal` フィールドが存在しないことを確認（要追加）。
- `src/state/lifecycle.ts:21-24, 127-131` を読み、`transitionJob` の `ctx.reason` が `HistoryEntry.message` として `"${state.status} → ${to}: ${ctx.reason}"` の形式で書き込まれることを確認。`HistoryEntry` に `reason` フィールドは存在せず、`{ ts, step, status, message }` のみであることを確認。
- SIGHUP が local / managed いずれにも未登録であることを `grep` で確認。

### 2. spec.md の要件・シナリオ検証

- Requirement 1（interruption レコードにシグナル名）: SIGTERM / SIGINT / SIGHUP の 3 Scenario と exit-guard での `signal` フィールド不在 Scenario を確認。`reason: "signal"` が不変であることが Scenario 中に明示されていることを確認。
- Requirement 2（transition message にシグナル名）: local × SIGTERM、managed × SIGTERM、local × SIGHUP の Scenario を確認。フォーマット "Interrupted by \<SIGNAME\>" が明記されていることを確認。
- Requirement 3（`resumePoint.reason` 不変）: local / managed / exit-guard の 3 Scenario すべてで `resumePoint.reason` の値が明記されていることを確認。exit-guard の `"signal"` と local/managed の `"Interrupted by signal"` の差異が正確に記載されていることを確認。
- Requirement 4（SIGHUP 登録・解除）: local / managed × on/off の 4 Scenario を確認。

### 3. design.md の設計決定検証

- D1（`signal` フィールドを optional に）: exit-guard の call-site が `signal` なしで `appendInterruption` を呼ぶことを実コードで確認。optional 化が必要かつ十分であることを確認。
- D2（Node callback 引数からシグナル名を取得）: `signalCleanup = async (signal: NodeJS.Signals)` への変更で Node の signal callback 仕様を活用できることを確認。
- D3（`transitionJob reason` 変更 / `resumePoint.reason` 不変）: `lifecycle.ts` の `transitionJob` 実装を確認し、`ctx.reason` が `HistoryEntry.message` に組み込まれることを確認。`resumePoint.reason` は `ctx.patch` 内で独立して管理されることを確認。
- D4（SIGHUP を同一 cleanup path に）: 設計判断として正当。
- D5（exit-guard call-site 変更なし）: 実コードで exit-guard の `appendInterruption` 呼び出しに signal 引数がないことを確認。
- Risk（`signal-handler-order.test.ts` が引数なしで `signalCleanup()` を呼ぶ）: テストコードを読み、`appendInterruption` と `persist` が両方 mock されており、引数のアサーションがないことを確認。`signal: undefined` → JSON シリアライズで省略という mitigation が正確であることを確認。

### 4. tasks.md の作業定義検証

- T-01〜T-06 の作業内容と受け入れ基準を spec.md と照合。
- T-02: local.ts の変更箇所（line番号）が実コードと一致することを確認。
- T-03: managed.ts が `appendInterruption` を呼ばないことを実コードで確認。T-03 Note の記述が正確。
- T-04 / T-05: テスト実装指針の内容を精査。

### 5. test-cases.md の網羅性検証

- TC-001〜TC-023 の 23 件が spec.md の 4 Requirements × Scenario 群を網羅していることを確認。
- TC-004（exit-guard signal フィールド不在）が spec Scenario と整合していることを確認。
- TC-019（`signal-handler-order.test.ts` が引数なしで呼べること）の根拠を実コード・design.md Risk で確認。
- TC-020（`exit-guard.test.ts` が変更なしで通ること）: exit-guard.test.ts で `resumePoint.reason === "signal"` をアサートしており、変更の対象外であることを確認。
- TC-021（resume / canon-provenance テスト不変）: `member-resume-routing.test.ts` と `resume-member-context.test.ts` の `resumePoint.reason: "Interrupted by signal"` が `resumePoint` オブジェクトを指し、transition history message ではないことを実コードで確認。

### 6. セキュリティ考慮

- シグナル名は Node.js の callback 引数（`NodeJS.Signals` 型）であり、ユーザー入力ではない。インジェクションリスクなし。
- `InterruptionRecord.signal` フィールドはリテラル union 型（`"SIGINT" | "SIGTERM" | "SIGHUP""`）で型制約される。
- SIGHUP 登録により exit code 130 固定で終了するようになるが、これは意図した変更であり、サービス拒否などの攻撃面の拡大はない。
- 認証・認可・ネットワーク・OWASP Top 10 の観点：本変更はプロセス内部のシグナルハンドリングのみで、該当なし。

---

## 検証できなかった項目

- **実際のビルド・テスト実行**（`bun run typecheck` / `bun run test`）: 本ステップは spec-review であり、ソースコードを変更する権限がないため実行不可。TC-022 / TC-023 の機械検証は verification step に委ねる。
- **`AbortHub.drain` の mock 省略による動作**（T-04 テスト）: `signal-handler-order.test.ts` が hub を mock せずに `signalCleanup()` を呼べることは観察できるが、タイムアウト挙動の有無はテスト実行なしには確認できない。

---

## Findings 詳細

### F-001: tasks.md T-04 / T-05 の「reason フィールド」記述が誤り

**対象ファイル**: `specrunner/changes/signal-name-in-interruption/tasks.md`

**内容**:

T-04（L指定）:
> "assert that `persist` is called with a state whose history entry's **`reason` field** contains the signal name (e.g. `"Interrupted by SIGTERM"`)"

T-05（L指定）:
> "assert that the state passed to `store.persist` has a history entry whose **`reason` includes** the signal name"

`HistoryEntry` 型（`src/state/schema/types.ts:68-73`）は `{ ts, step, status, message }` のみを持ち、`reason` フィールドは存在しない。`transitionJob` の `ctx.reason` は `message: "${state.status} → ${to}: ${ctx.reason}"` として `HistoryEntry.message` に書き込まれる（`src/state/lifecycle.ts:131`）。

実装者が T-04 / T-05 の記述どおりに `state.history[last].reason` をアサートしようとすると TypeScript コンパイルエラーになる。正しくは `state.history[last].message` をアサートする必要がある（例: `.message.includes("SIGTERM")` または `.message` が `"running → awaiting-resume: Interrupted by SIGTERM"` であること）。

**影響**: TypeScript コンパイラが検出するため実装が壊れることはないが、実装者に余分な調査コストを生じさせる。
