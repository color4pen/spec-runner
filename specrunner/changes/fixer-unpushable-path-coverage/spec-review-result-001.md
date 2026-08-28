# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### 読み込んだファイル

- `specrunner/changes/fixer-unpushable-path-coverage/request.md` — バグの実例・要件・スコープを確認
- `specrunner/changes/fixer-unpushable-path-coverage/design.md` — 設計判断 D1〜D5 を確認
- `specrunner/changes/fixer-unpushable-path-coverage/tasks.md` — T-01〜T-05 の実装タスクを確認
- `specrunner/changes/fixer-unpushable-path-coverage/spec.md` — normative requirements と Scenarios を確認
- `specrunner/changes/fixer-unpushable-path-coverage/test-cases.md` — TC-001〜TC-021 のカバレッジを確認

### 参照したソースファイル

- `src/core/step/fixer-helpers.ts` — 現在の共有 helper を確認（`buildUnpushablePathContracts` は未実装）
- `src/core/step/code-fixer.ts` — buildMessage の全 return path（8 箇所）を実測
- `src/core/step/spec-fixer.ts` — buildMessage の全 return path（5 箇所）を実測
- `src/core/step/implementer.ts` L259-277 — 参照実装の `outputContracts` と `renderPushCapabilityNotice` を確認
- `src/git/push-capability.ts` — `renderPushCapabilityNotice` / `PushCapability` の API を確認
- `src/core/port/output-contract.ts` — `OutputContract` 型の定義を確認
- `src/core/step/step-context-builder.ts` L125-160 — 1 回限りの follow-up invariant の実装を確認
- `src/core/port/step-context.ts` — `pushCapability` フィールドを確認
- `src/core/step/types.ts` / `src/core/port/step-types.ts` — `StepDeps` の定義・再エクスポートを確認

### 確認した内容

#### バグの存在確認

- `fixer-helpers.ts` に `buildUnpushablePathContracts` は存在しない ✓（バグの主張を裏付け）
- `code-fixer.ts` に `outputContracts` メソッドが存在しない ✓
- `code-fixer.ts` に `renderPushCapabilityNotice` のインポートが存在しない ✓
- `spec-fixer.ts` に `outputContracts` メソッドが存在しない ✓
- `spec-fixer.ts` に `renderPushCapabilityNotice` のインポートが存在しない ✓
- `implementer.ts` L267-276 に `unpushable-path` contract が宣言されている ✓
- `implementer.ts` L284 に `renderPushCapabilityNotice` が呼ばれている ✓

#### design.md の正確性確認

- D1（`fixer-helpers.ts` への共有 helper 追加）: `fixer-helpers.ts` は `code-fixer.ts` / `spec-fixer.ts` の両方にインポートされている ✓
- D2（各 step が `push-capability.ts` から直接インポート）: 既存の `request-review.ts` も直接インポートしている一致した設計 ✓
- D3（全 message variant に notice を追記）: `implementer.ts` の pattern（`capabilityNotice` を先頭で計算して全 return に追記）と一致 ✓
- D4（spec-fixer を含める）: spec-fixer の `writes()` は `specrunner/changes/<slug>/` 内のみ。`.github/workflows/**` にはマッチしないが、一様なカバレッジのため含めることが明示された意思決定 ✓
- D5（既存インフラで escalation は十分）: `step-context-builder.ts` L125-160 の実装を確認。`buildPrompt` で attempt >= 2 のとき unpushable-path を除外し effectiveViolations が空になれば null を返す。これにより adapter がループを終了させる仕組みが動作している ✓
- design が言及する import path `../port/output-contract.js`（`fixer-helpers.ts` からの相対パス）が正しい ✓

#### tasks.md の return path 列挙の正確性確認

- `code-fixer.ts` `buildMessage` の return 文を実測：8 箇所（L129, L138, L171, L182, L207, L248, L260, L279）。T-02 が列挙する 8 path と一致 ✓
- `spec-fixer.ts` `buildMessage` の return 文を実測：5 箇所（L117, L126, L155, L166, L185）。T-03 が列挙する 5 path と一致 ✓

#### spec.md の normative 要件確認

- 全 Requirement に SHALL または MUST を含む normative keyword あり ✓
- 各 Requirement に最低 1 つの Scenario あり ✓
- "every message variant" という要件は code-fixer / spec-fixer の全 return path を包括する normative 記述として機能している ✓
- Layer 2 backstop を "No additional fixer-specific halt logic" で維持する要件が明示されている ✓

#### test-cases.md のカバレッジ確認

- Summary: 21 cases (Automated 17, Manual 0, must 20 / should 1) ✓（計算が一致）
- TC-001〜TC-014: unit test で helper + code-fixer + spec-fixer の主要 path をカバー ✓
- TC-015: integration test で Layer 2 backstop が follow-up 後に発火することを確認 ✓
- TC-016: code-fixer conformance branch への notice 注入を確認（tasks.md / design.md 由来）✓
- TC-017: code-fixer coordinator loop branch（should 優先度）✓
- TC-018〜TC-021: gate test（typecheck / test / no-change 確認）✓

#### セキュリティ観点

- `renderPushCapabilityNotice` に流入するデータ（`pushCapability.patterns`, `pushCapability.source`）は `detectPushCapability` が環境変数から生成したものであり、ユーザー制御のリクエスト内容ではない。インジェクションリスクなし ✓
- `buildUnpushablePathContracts` も同様に環境変数由来のデータのみを扱う。OWASP Top 10 の入力検証・インジェクション類のリスクなし ✓
- 変更は純粋に additive（contract 宣言と notice 注入の追加）であり、既存の Layer 2 backstop を弱める変更は含まない ✓

## 検証できなかった項目

- `src/core/step/__tests__/fixer-push-capability.test.ts` はまだ存在しない（実装前の spec 段階のため）。テストの実際の pass/fail は確認できない
- TC-015（integration test）の具体的な実装方法が test-cases.md に記載がなく、実現可能性の完全な検証はできない。ただし `step-context-builder.test.ts` に類似インフラが存在することは確認済み

## Findings 詳細

### [M-01] tasks.md T-04 の最低テスト数が実際の checkbox 列挙数と不一致

T-04 acceptance criteria の末尾に "minimum 14 tests covering: 4 helper tests + 5 code-fixer tests + 5 spec-fixer tests" と記載されているが、T-04 の checkbox リストを実数すると:
- helper tests: 4 ✓
- code-fixer tests: 6（outputContracts×2, buildMessage×4）
- spec-fixer tests: 6（outputContracts×2, buildMessage×4）

合計 16 となる。test-cases.md の automated TC（TC-001〜TC-017）も 17 件。

「minimum 14」という下限値は checkbox で列挙された 16 件を 2 件下回っており、14 件だけ実装した実装者が acceptance criteria を満たしたと判断できてしまう。最低数を「minimum 16」（または test-cases.md に合わせて「minimum 17」）に訂正すべき。

### [L-01] test-cases.md に spec-fixer の conformance branch 向け TC が存在しない

spec-fixer の `buildMessage` には 5 つの return path がある:
1. conformance + continuation（L117）
2. conformance + initial（L126）
3. normal + continuation（L155）
4. normal + findings initial（L166）
5. normal + fallback buildSpecFixerInitialMessage（L185）

test-cases.md の spec-fixer カバレッジは TC-006（normal/findings initial）・TC-007（normal/fallback）・TC-008（normal/continuation）の 3 路だけであり、conformance branch（L117, L126）の 2 paths に対応する TC が存在しない。

code-fixer では conformance branch の初回 path が TC-016 でカバーされているため、対称性がない。spec.md の normative 要件「every message variant」は conformance branch を包括するが、テストによる実証がない。

D4 の通り spec-fixer が `.github/workflows/**` にマッチするパスを書くことは現行の write scope では不可能なため、実際の違反リスクは極めて低い。ただし一様なテストカバレッジの観点で追加すれば specs との整合がより明確になる。
