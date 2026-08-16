# Spec Review Result 002: report-settles-step

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 前周 findings の解消確認

**[medium] D4: SDKUserMessage.session_id? との不整合**
- design.md の Context 節および D4 決定を確認。現在の記述: "(`SDKUserMessage.session_id` は optional であり全 message が持つとは限らない)" — optional であることが明記されている。
- sdk.d.ts を実測: `SDKSystemMessage` (subtype: 'init') は `session_id: string`（required、行 3392）。`SDKUserMessage` は `session_id?: string`（optional、行 3507）。設計の主張と一致。
- D4 決定も「session 初期化時の `SDKSystemMessage` (init) が `session_id` を持ち、最初に到着する message であるため init で確保できる」に改訂されており、不整合は解消されている。
- **判定: 解消済み**

**[low] TC-005: D5 catch path に到達するテスト構成未記述**
- test-cases.md の TC-005 を確認。「テスト構成 (D5 到達方法)」セクションが追加され、案 A（shared abort を直接呼ぶ）と案 B（step wall-clock timeout を grace 未満に設定）の 2 案が具体的に記述されている。
- **判定: 解消済み**

### design.md の検証

**D1（grace timer の handler 起点化）**
handler で `capturedToolResult` を設定した直後に `armReportGrace?.()` を呼ぶ設計。`armReportGrace` が null（runQuery 未呼び出し）の場合は no-op。handler → grace 起動の因果関係が明確。正常系（generator が grace 前に自然終了）では timer は `finally` で clear される。設計に矛盾なし。

**D2（専用 AbortController の分離）**
main work turn 専用 `mainQueryAbort` を shared と分離し、一方向伝播（shared → main）を `{ once: true }` listener で張る設計。postWork / output-repair は `queryOptions` を spread し shared を継承するため、grace で shared を汚さない。agent redirect 超過時の `abortController.abort()`（行 699）は shared のまま維持されることを確認。正しい。

**D3（grace-exit の正常 return）**
runQuery 内 `for await` に inner try/catch を追加し、`settledByReport && !shared.aborted` の場合のみ正常 return。`settledByReport && shared.aborted` は re-throw → D5 で捕捉。inner catch の条件が D5 との役割分担を正確に定義している。

**D4（sessionId の早期確保）**
sdk.d.ts を実測: `SDKSystemMessage` (init) は `session_id: string`（required）。T-02 が「各 SDK message の `session_id`（string かつ非空）から確保する」とし、`SDKUserMessageReplay.session_id` も除外しないとしている。init が最初に届く SDK message であることは SDK の動作仕様として妥当。最終 success result 代入を `successResult.session_id ?? extractedSessionId` に変える変更も、ローカル型エイリアス（`session_id?: string`）に対して TypeScript 的に正しい。

**D5（abort catch 経路での report 保全）**
現行 catch 経路（行 1136）の構造を確認: `if (abortController.signal.aborted && (timeoutId !== undefined || watchdog.fired))` が timeout 経路。D5 はこの判定の前段に `capturedToolResult !== null` 分岐を追加する。`capturedToolResult === null` のケースは既存 timeout 経路に落ちる（fallback 不変）。T-05 がクリーンアップ（clearTimeout, sessionLogWriter.close）を保全分岐でも実施することを要求している点も正しい。

**D6（60 秒固定）/ D7（watchdog bump なし）**
YAGNI 原則で設定化しない。watchdog は「活動」検知であり「完了」で bump しないという意味論の分離が明確。

**Risks 節**
grace timer 二重発火・listener leak・D5 catch の resultContent 欠如・既存 timeout テストの回帰についてそれぞれ Mitigation が記述されている。executor が reportTool を持つ step では `toolResult` から verdict を導出し `resultContent` に依存しないことは request.md の前提（step-completion.ts の verdict 導出）と整合。

### tasks.md の検証

T-01〜T-06 が設計判断 D1〜D7 をすべてカバーしている。各タスクに Acceptance Criteria が付いており、テスト可能な形式になっている。T-06 の TC-A〜TC-F が test-cases.md の TC-001〜TC-007 と対応している（TC-A → TC-001、TC-B → TC-002、TC-C → TC-004、TC-D → TC-003、TC-E → TC-006/007、TC-F → TC-005）。

### spec.md の検証

4 つの Requirement がすべて SHALL/MUST を含む normative 記述を持ち、各 Requirement に Given/When/Then シナリオが付いている。
- Requirement 1（report 受領が主契機）: ok:true / ok:false の 2 シナリオ ✓
- Requirement 2（grace 内自然終了 → usage 回収）: 1 シナリオ ✓
- Requirement 3（sessionId 早期確保 + postWork resume）: 1 シナリオ ✓
- Requirement 4（abort catch 経路での report 保全）: 1 シナリオ ✓
- Requirement 5（report 不在時の fallback 不変）: watchdog → STEP_TIMEOUT / generator 終了 → report retry の 2 シナリオ ✓

`completionReason` に新値を追加しないという architect 判断が spec に反映されており（"success" を維持）、executor 側の変更不要という要件との整合が保たれている。

### test-cases.md の検証

TC-001〜TC-007 の 7 件、すべて unit / must。Summary と Result YAML が整合している（total: 7, automated: 7, must: 7）。TC-005 にテスト到達方法の補足が追加されており前周の指摘は解消。各 TC の Source 参照が spec.md の Scenario と 1:1 で対応している。

### SDK 型の実測確認

| 型 | session_id | 備考 |
|----|-----------|------|
| `SDKSystemMessage` (subtype: 'init') | `string`（required） | sdk.d.ts 行 3392 |
| `SDKUserMessage` | `string?`（optional） | sdk.d.ts 行 3507 |
| `SDKUserMessageReplay` | `string`（required） | sdk.d.ts 行 3528 |
| `SDKResultSuccess`（SDK 本体型） | `string`（required） | sdk.d.ts 行 3149 区画 |
| `SDKResultSuccess`（ローカル型エイリアス） | `string?`（optional） | agent-runner.ts 行 377 |

D4 の「init message から早期確保」設計は SDK 型と整合している。ローカル型エイリアスの optional 化は pre-existing の不整合であり本変更が導入したものではない。

## 検証できなかった項目

なし。

## Findings 詳細

今回の spec-review-002 で新たに発見した blocking findings はない。

前周 2 件（D4 medium / TC-005 low）は解消済みと確認した。
