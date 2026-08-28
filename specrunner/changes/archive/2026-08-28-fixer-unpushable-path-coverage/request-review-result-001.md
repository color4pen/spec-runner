# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### Step 1: コードアサーション検証

**`implementer.ts:267` — `unpushable-path` contract 宣言**

確認: `src/core/step/implementer.ts` line 267 にコメント  
`// When push capability declares patterns, add an unpushable-path contract.`  
が存在し、lines 269–276 で `contracts.push({ kind: "unpushable-path", policy: "follow-up", patterns: ... })` が実装されている。  
→ **一致（コメント行が L267、push 本体は L269–276 — 要求の「L267」は参照として正確）**

**`renderPushCapabilityNotice` の適用範囲**

Grep 結果:
- `src/core/step/implementer.ts:284` — `capabilityNotice = renderPushCapabilityNotice(...)`  
- `src/core/step/request-review.ts:113` — `return base + renderPushCapabilityNotice(...)`  
- `src/core/step/code-fixer.ts` — インポートなし、呼び出しなし  
- `src/core/step/spec-fixer.ts` — インポートなし、呼び出しなし  
→ **要求の主張（implementer / request-review のみ）に一致**

**`code-fixer.ts` — contract も notice もゼロ**

`CodeFixerStep` に `outputContracts` メソッドは存在しない（`AgentStep` の optional field として未定義）。`renderPushCapabilityNotice` のインポートもなし。`capabilities: { gitWrite: true }` を持ち、実際にソースコードを変更しうる。  
→ **要求の問題主張に一致**

**`spec-fixer.ts` — contract も notice もゼロ**

`SpecFixerStep` に `outputContracts` メソッドは存在しない。`renderPushCapabilityNotice` のインポートもなし。`capabilities.gitWrite` は未設定（CLI が commit/push を担当）。`writes()` は `specrunner/changes/<slug>/` 配下の spec/design/tasks/test-cases.md に限定される。  
→ **要求の主張に一致。ただし spec-fixer がワークフローファイルを触るリスクは code-fixer より低い（補足参照）**

**`step-context-builder.ts:L125-160` — 1 回限り follow-up の実装**

Lines 125–162 で `outputVerification` の `buildPrompt` が定義され、`attempt > 1` で `unpushable-path` violation をフィルタアウト（1 回限りの follow-up を保証）する実装が確認できる。  
→ **要求の参照箇所に一致**

**`output-verify.ts:L235-253` — follow-up prompt 文面**

Lines 235–257 に `unpushable-path` 違反向けの follow-up prompt テキストが実装されている（要求 L235–253 はこの範囲に含まれる）。  
→ **要求の参照箇所に一致**

**`fixer-helpers.ts` — 既存共有点の存在**

`src/core/step/fixer-helpers.ts` が存在し、spec-fixer / code-fixer 両方からインポートされている。Requirement 3「fixer-helpers 等の既存共有点に置く」の前提条件として正確。  
→ **確認済**

### Step 2: 問題の再現性検証

run 33017611147 の記述（code-fixer が `.github/workflows/**` を編集 → `UNPUSHABLE_PATH_BLOCKED` で halt、一方 implementer は notice + contract を持ち回避して完走）は、コード構造から見て完全に整合する。code-fixer に notice も contract もないため、エージェントは禁止パスへの書き込みを試みる前に警告を受けず、また Layer 1 の修復機会も与えられない。

### Step 3: 要件の実現可能性検証

| 要件 | 実現可能性 |
|------|-----------|
| 1. `outputContracts` に `unpushable-path` 追加 | implementer の既存パターンをそのまま流用可能 |
| 2. `renderPushCapabilityNotice` を prompt に追加 | 関数はすでに共有 export として存在 |
| 3. fixer-helpers への共有化 | fixer-helpers.ts が既存かつ両 fixer からインポート済み |
| 4. follow-up 失敗時の escalation 設計 | 既存の Layer 2 backstop（`UNPUSHABLE_PATH_BLOCKED`）がそのまま機能する。Layer 1 の 1 回限り制限により無限ループは発生しない |
| 5. Layer 2 backstop の維持 | 変更不要（手を加えるのは Layer 1 のみ） |

### Step 4: スコープ外の確認

spec-fixer の `writes()` が `specrunner/changes/<slug>/` 配下のみに限定されることを確認。通常の利用ではワークフローファイルに触れる経路は少ないが、conformance 経由で routing された場合に spec-fixer が spec/design 関連の変更を伴うケースでは対象外パスへの書き込みは発生しないため、実害リスクは code-fixer より低い。要求がこれを認識しつつ scope に含めていることは妥当。

## 検証できなかった項目

- run 33017611147 の実際のログ（外部アクセス不可）
- 既存テストが implementer の unpushable-path contract を単体でカバーしているかの全数確認（テストファイルの grep は実施済み — 既存の関連テストは存在するが網羅性の詳細は未確認）

## Findings 詳細

None（重大な問題なし。以下は補足的観察）

**観察: spec-fixer のリスクレベルは code-fixer より低い**

spec-fixer の `writes()` が specrunner/changes/<slug>/ に限定されているため、通常運用で `.github/workflows/**` に触れる経路は存在しない。要求が spec-fixer をスコープに含めることは予防的措置として妥当であり、実装コストも小さい。ただし実装時は spec-fixer の AgentDefinition に `capabilities.gitWrite` が設定されていない点を確認しておくこと（CLI が commit/push を担うため、contract の検査タイミングを確認する必要がある）。

**観察: 要求の行番号参照は厳密ではないが許容範囲**

`implementer.ts:267` は `// When push...` コメント行であり、contract の `push()` 本体は lines 269–276。行番号参照として機能上は問題ない。`output-verify.ts:L235-253` は実際には L235-257 まで続くが実質的に正確。
