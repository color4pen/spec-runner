# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 参照したファイル

- `specrunner/changes/agent-inactivity-timeout/request.md`
- `specrunner/changes/agent-inactivity-timeout/design.md`
- `specrunner/changes/agent-inactivity-timeout/tasks.md`
- `specrunner/changes/agent-inactivity-timeout/spec.md`
- `src/adapter/claude-code/agent-runner.ts`（全体、特に :527-534 / :651 / :772 / :1005-1037 / :1098-1137）
- `src/adapter/codex/agent-runner.ts`（全体、特に :329-333 / :375-440 / :644-698 / :747-781）
- `src/core/step/executor.ts`（:367-375）
- `src/core/step/step-halt.ts`（:119-150）
- `tests/unit/adapter/claude-code/agent-runner.test.ts`（TC-032/033/034/035/041 の定義を確認）
- `tests/adapter/codex/agent-runner.test.ts`（TC-03 の定義を確認）

### 要件・シナリオ

- spec.md の全 Requirement（4 件）と Scenario（8 件）を読了し、normative keyword（SHALL/MUST）の存在を確認した。
- すべての Requirement に `### Requirement:` header と少なくとも 1 つの `#### Scenario:` が存在する。
- Scenario は Given/When/Then 形式で Layer-1 振る舞いとして記述されている。

### 設計の整合性

- D1（無活動監視）・D2（定数 900,000ms）・D3（既存 timeout 経路合流）は request.md の architect 評価済み設計判断と一致する。
- D4（catch 判定拡張）の要点を実コードで検証した。
  - claude-code adapter の catch 節（:1099）は現在 `signal.aborted && timeoutId !== undefined` で timeout を判定している。
  - `timeoutId` は wall-clock タイマーが設定されているときのみ defined になる。
  - 無活動 watchdog は `timeoutId` とは独立して abort を呼び出すため、現行の判定では watchdog 発火が error 経路に落ちる。
  - D4 が `watchdog.fired` を OR 条件に追加することで正しく timeout 経路に合流させる設計は正しい。
- D5（shared watchdog）・D6（formatInactivityTimeoutMessage）は適切な single-source 設計である。
- `makeTimeoutHalt` の halt 表示（:147 `${stepName} timed out: ${error.message}`）は watchdog メッセージを反映できる構造になっている。

### 既存テストへの影響

- TC-032 は real timer（timeoutMs: 50ms）を使用しており、fake timers は使っていない。900,000ms watchdog は timer として登録されるが、finally で clear される。TC-032 の assert は `completionReason` と `code` のみで message を assert しないため、wall-clock path が変わらない限り無変更で green になる。
- TC-033/034/035/041 についても同様に影響なしと確認。

### セキュリティ観点

- watchdog は固定定数タイマーで外部入力を受け取らない。インジェクション系の攻撃面なし。
- error message に含まれる `elapsedMs` は内部診断値であり、センシティブデータではない。
- タイムアウトはサービス可用性を改善する（長時間ハングの回避）方向であり、DoS リスクを高めない。
- OWASP Top 10 で直接関係するカテゴリなし（認証変更なし・入力検証の変更なし・セッション管理の変更なし）。

---

## 検証できなかった項目

- `src/adapter/shared/inactivity-watchdog.ts` は未実装（pre-implementation spec review）のため、watchdog の実装正しさはコードレベルでは検証できない。インターフェース契約の妥当性は tasks.md の T-01 定義から評価した。

---

## Findings 詳細

### F-01: 出力修復ループの `catch {}` が watchdog abort を飲み込む（High）

**対象ファイル**:
- `src/adapter/claude-code/agent-runner.ts` — 出力修復ループ（:1005–1033）
- `src/adapter/codex/agent-runner.ts` — 出力修復ループ（:665–696）

**問題**:
両 adapter の output-repair ループは、内部の `try { ... } catch { stderrWrite(...); }` で repair turn の失敗を best-effort 扱いで飲み込んでいる。この `catch` は型も条件も指定していないため、watchdog が発火して `abortController.abort()` を呼んだ場合に SDK が throw する abort エラーも静かに捨てる。

claude-code adapter（:1005–1033）の例:
```ts
try {
  ...
  for await (const message of repairMessages ...) { ... }
} catch {
  // best-effort: repair turn failure → preserve work turn result
  stderrWrite(...); // abort error もここで飲まれる
}
```

codex adapter（:665–696）も同型:
```ts
try {
  const repairTurn = await runFollowUpTurnWithRetry(...);
  ...
} catch {
  stderrWrite(...); // abort error も飲まれる
}
```

abort が飲まれると、outer try ブロックがそのまま完了して `completionReason: "success"` が返る。watchdog が発火しても timeout halt に合流しない。

**どこで仕様が欠けているか**:
- `design.md` の Risks 節は "ループ間の非ループ処理中もタイマーが走る → Trade-off: 容認" と記しているが、repair turn 中の abort が飲まれることには触れていない。
- `tasks.md` T-02 の catch 節拡張は main try-catch（:1099）だけを対象にしており、repair ループの内側 catch を修正する指示がない。
- `spec.md` の全 8 Scenario に「output-repair 実行中に無活動タイマーが発火した場合」の振る舞いが記述されていない。

**修正方針（fixable）**:
repair ループ内 catch で abort 済みなら再 throw する。

```ts
} catch (err) {
  if (abortController.signal.aborted) throw err; // watchdog abort を伝播
  stderrWrite(`[specrunner] warn: ...`);
}
```

これにより abort は outer catch（:1098 / :747）へ到達し、D4 の判定拡張によって timeout 経路に合流する。

修正が必要な仕様箇所:
1. `design.md` — Risks または T-02 の対象に repair catch の再 throw を明示する
2. `tasks.md` T-02 — repair ループの catch 修正を追加する（codex T-03 も同様）
3. `spec.md` — output-repair 中の無活動発火シナリオを追加する（または `Requirement: 無活動発火は既存 timeout 経路に合流` の本文に "output-repair turn を含む全 turn" と明示する）

---

### F-02: output-repair 中の無活動発火をテストする受け入れ基準が欠落（Medium）

`tasks.md` の T-04（claude-code）/ T-05（codex）および `request.md` の受け入れ基準には、output-repair turn が実行中に無活動タイマーが発火した場合の挙動を確認するテストシナリオが定義されていない。

F-01 の修正（repair catch での再 throw）が実装されても、対応するテストがなければ将来のリグレッションを防げない。T-04 に「output-repair 実行中の watchdog 発火 → timeout result を返す」テストを受け入れ基準として追記する必要がある。

この finding は F-01 の修正と対になる（F-01 が修正されれば T-04/T-05 のテスト追加指示も確定できる）。
