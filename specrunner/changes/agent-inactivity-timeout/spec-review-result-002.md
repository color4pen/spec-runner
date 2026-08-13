# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 参照したファイル

- `specrunner/changes/agent-inactivity-timeout/request.md`
- `specrunner/changes/agent-inactivity-timeout/design.md`（spec-fixer 修正後）
- `specrunner/changes/agent-inactivity-timeout/tasks.md`（spec-fixer 修正後）
- `specrunner/changes/agent-inactivity-timeout/spec.md`（spec-fixer 修正後）
- `src/adapter/claude-code/agent-runner.ts`（:660-683 / :1028-1033 / :1090-1137）
- `src/adapter/codex/agent-runner.ts`（:329-334 / :375-440 / :650-700 / :745-784）
- `src/core/step/executor.ts`（:367-375）
- `src/core/step/step-halt.ts`（:119-150）

### 前周 findings の解消確認

**F-01(高): claude-code output-repair catch が watchdog abort を飲み込む**

- design.md Risks 節に「output-repair ループの best-effort `catch {}` が watchdog abort を飲み込み outer catch に到達しない」のリスクと Mitigation（`catch (err)` + `if (abortController.signal.aborted) throw err;`）が追加された ✓
- tasks.md T-02 に repair catch 修正指示（`:1028` の catch を `catch (err)` に変更し abort 時に再 throw）が追加された ✓
- T-02 Acceptance Criteria に「output-repair ループ中に watchdog が発火した場合、abort エラーが repair catch で飲み込まれず outer catch へ伝播し、`completionReason: "timeout"` として返る」が記載された ✓
- spec.md に `#### Scenario: output-repair ループ実行中に watchdog が発火しても timeout として返る` が追加された ✓

**F-01(高): codex output-repair catch が watchdog abort を飲み込む**

- tasks.md T-03 に repair catch 修正指示（`:691` の catch を `catch (err)` に変更し abort 時に再 throw）が追加された ✓
- T-03 Acceptance Criteria に「output-repair ループ中に watchdog が発火した場合、abort エラーが repair catch で飲み込まれず outer catch へ伝播し、`completionReason: "timeout"` として返る」が記載された ✓

**F-02(中): output-repair 中の発火テストが T-04 の受け入れ基準に欠落**

- tasks.md T-04 に「output-repair 中の発火」テストケース（5 つ目）が追加された ✓
- T-04 Acceptance Criteria が「5 つの受け入れ基準（…/ output-repair 中の watchdog 発火）が fake timers で green に固定される」に更新された ✓

### 設計の整合性（再確認）

- D4（catch 判定拡張）: `abortController.signal.aborted && (timeoutId !== undefined || watchdog.fired)` の論理は正しい。agent-redirect による `abort();break`（:672）は break でループを抜けて return するため catch に到達しない（挙動不変）。codex の `:389-392` の aborted 事前チェックも abort 後に throw するため outer catch へ正しく伝播する ✓
- D5（shared watchdog）: `src/adapter/shared/` に新設指定、両 adapter が `../shared/*` を既に import している ✓
- D6（formatInactivityTimeoutMessage）: `makeTimeoutHalt` が `${stepName} timed out: ${error.message}` で halt 表示を構成するため、watchdog message が halt 表示に載る ✓
- 既存 catch の wall-clock 判定との共存: wall-clock 先行なら `timeoutId !== undefined` が true で wall-clock message、watchdog 先行なら `watchdog.fired === true` で inactivity message。両方発火済みの場合は `watchdog.fired` が true になるため inactivity message（発火順が先の方を反映）。分岐は決定的 ✓
- 正常終了・error・throw の全 exit path で `watchdog.clear()` を finally に追加する指示が T-02/T-03 に含まれる ✓

### spec.md の形式検証

- 4 Requirement はすべて `### Requirement:` header を持ち、各 Requirement に `#### Scenario:` が ≥1 存在する ✓
- normative keyword: Requirement 1 は `SHALL` / `MUST NOT`、Requirement 2 は `SHALL`、Requirement 3 は `MUST` / `SHALL NOT`、Requirement 4 は `SHALL NOT` / `MUST` を含む ✓
- Scenario は全件 Given/When/Then 形式で Layer-1 振る舞いとして記述されている ✓

### セキュリティ観点

- watchdog タイマーは内部定数（15 分）のみで動作し、外部入力を受け取らない。インジェクション面なし ✓
- error message に含まれる `elapsedMs` は内部計測値であり、センシティブデータを含まない ✓
- 機能の方向性はサービス可用性の改善（長時間ハング回避）であり、DoS リスクを増やさない ✓
- 認証・入力検証・セッション管理の変更なし。OWASP Top 10 で直接関連するカテゴリなし ✓

---

## 検証できなかった項目

- `src/adapter/shared/inactivity-watchdog.ts` は未実装（pre-implementation spec-review）のため、watchdog の実装正しさはコードレベルで検証できない。インターフェース契約の妥当性は T-01 の定義から評価した。

---

## Findings 詳細

### F-01: T-05（codex）に output-repair 中の watchdog 発火テストが欠落（Medium）

**対象ファイル**: `specrunner/changes/agent-inactivity-timeout/tasks.md`（T-05 節）

**問題**:

T-03 では codex adapter の output-repair catch（`:691`）を `catch (err)` に変え、
`if (abortController.signal.aborted) throw err;` で abort 時に再 throw することを指示している。
T-03 の Acceptance Criteria にも「output-repair ループ中に watchdog が発火した場合、abort エラーが
repair catch で飲み込まれず outer catch へ伝播し、`completionReason: "timeout"` として返る」と記載されている。

しかし T-05（codex 側のテスト）には、対応するテストケースが存在しない:

```
T-05 テストケース（現在）:
1. events を emit しない turn で completionReason === "timeout" / code STEP_TIMEOUT
2. event を閾値未満で流し続ける限り発火しない
3. 発火時の error message が無活動の旨と elapsedMs を含む
```

T-04 には「output-repair 中の発火」が 5 つ目として明示されているが、T-05 にはない。
T-05 の Acceptance Criteria も「未到着発火・巻き直し非発火・halt message 内容が fixed される」に
留まり、repair path のテストを要求していない。

T-03 の repair catch 修正が実装されても、対応するテストがなければ将来のリグレッションを防げない。

**修正方針（fixable）**:

T-05 に以下のテストケースを追加し、Acceptance Criteria を更新する:

```
- [ ] codex の output-repair 実行中(runFollowUpTurnWithRetry が呼ばれ events が来ない状態)に
  watchdog が発火した場合でも、completionReason === "timeout" / code STEP_TIMEOUT を
  返すことを固定する。repair catch が abort を re-throw し outer catch が timeout として
  処理することをテストで確認する。

Acceptance Criteria 追記:
- codex output-repair 中の watchdog 発火が fake timers で timeout result に固定される。
```
