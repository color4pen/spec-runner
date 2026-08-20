# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### Step 1: コードアサーション事実確認

**`src/core/attach/verify-checkpoint.ts:54-58`**  
実際の行を確認。Lines 53–60 の JSDoc comment に検証順序 (b-new, b, b-new, a, c, d-new, d, e) が列挙されており、請求の通り単一関数 `verifyCheckpoint` に同居している。

- Generic integrity 検証（use-case 非依存）: lines 81-98 (b-new version check), 100-117 (b journal/projection), 119-148 (b-new counter reversal), 152-169 (profile digest), 241-278 (e identity)
- Resume-specific policy 検査: line 172 (a status===awaiting-resume), lines 190-204 (c resume point resolution), lines 206-238 (d-new reads() inputs)

混同の構造はリクエスト記述と一致している。✓

**`src/cli/attach.ts:1-13`**  
JSDoc コメント（lines 1-13）が "fetch → OID resolution → runAttachVerification → setupWorkspace(checkpointOid)" のフローを正確に記述。オーケストレーションが `src/core/attach/orchestrator.ts` にあることも確認。✓

**`src/core/pipeline/pipeline.ts:612-620`**  
Lines 612-620 に `commitFinalState` シームを確認。コメントに "single-seam awaiting-resume checkpoint publisher" と明示。✓

### Step 2: 既存テストの確認

`tests/attach/verify-checkpoint.test.ts` と `tests/attach/verify-checkpoint-r1-assurance.test.ts` の両ファイルが `verifyCheckpoint` を直接 import している。テスト観点（TC-VC-001〜014）は status 不一致・request.md 欠落・identity mismatch・journal corruption・reads() 失敗等をカバー。

### Step 3: アーキテクチャ制約の確認

`tests/unit/architecture/arch-allowlist.ts` を確認。ARCH_ALLOWLIST は delete-only ratchet（新規エントリは承認が必要）。本リファクタリングは `src/core/attach/` 内での移動であり、クロスレイヤー import は発生しない見込み。✓

### Step 4: スコープ・型の確認

- type: "refactoring" — 観測可能な挙動変更なし、正しい分類 ✓
- adr: true — policy 注入という設計判断を含む、ADR 生成妥当 ✓
- スコープ外の明示（awaiting-archive policy 実装・issue-target 層・CLI surface 変更）が適切に除外されている ✓

## 検証できなかった項目

None — 関連コードはすべて read-only で確認済み。

## Findings 詳細

### F-1: (c) resume point 解決の分類がリクエスト本文から抜け落ちている（低）

背景節の分類は「(b)(b-new) = generic、(a)(d-new) = resume 固有」と述べるが、`verifyCheckpoint` 内の (c) "resume point + pipeline definition resolvable"（lines 190-204）の分類が明示されていない。(c) は `state.resumePoint` に依存しており resume 固有であるため、design step は attach-resume policy に含めることが自然。リクエストの Requirement 1 / 2 の意図と矛盾しないが、design step に判断を委ねる形となる。ブロッキングではない。

### F-2: 受け入れ基準「無改変で green」の意味範囲（低）

"既存の attach のテストが無改変で green" という表現は、テストファイル自体のバイト同一性か、テストロジック・アサーションの意味的同一性かが曖昧。実装が `verifyCheckpoint` のシグネチャを変更する場合（policy 引数を追加するなど）、テストの import / 呼び出し構文の更新が生じうる。ただし直後に「分離が挙動保存であることの証拠」と意図が補足されており、semantic equivalence として読める。実装者が backward-compatible wrapper を設けることで文字通りの「無改変」も実現可能。ブロッキングではない。
