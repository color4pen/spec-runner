## Context

PR #80/84 で AgentRunner port + ClaudeCodeRunner（local runtime）を導入し、SDK query() ベースの実行パスが追加された。初回 dogfood で 4 件のバグが表面化:

1. local runtime path で `resultContent === null`（propose 等 resultFile を持たない step）のとき completionVerdict を参照せず一律 escalation になる
2. propose 完了後に `state.branch` が未設定のまま後続 step に進む
3. review-verdict parser が strict すぎて agent のフォーマット揺れを拒否する
4. finish preflight check 4 が MERGED PR の UNKNOWN mergeStateStatus を retry → escalation する（Issue #77）

応急処置を全テストなしで main に push した結果 TC-003 が壊れた教訓から、step 名ハードコードを使わず宣言的フラグで解決する方針を取る。

## Goals / Non-Goals

**Goals:**

- local runtime path で completionVerdict fallback が正しく動作する
- propose 完了後に `state.branch` が自動設定される（`setsBranch` フラグ方式）
- review-verdict parser が大文字 V / prefix なし / bold なし等の揺れを許容する
- MERGED PR に対する finish で Phase 0 check 4 が即成功を返す
- TC-003（step 名ハードコード禁止）が green のまま維持される

**Non-Goals:**

- StepContext 型分離 / `_updatedState` 責務重複の解消（Issue #81、別 request）
- managed runtime path の変更（`_updatedState` 分岐は触らない）
- review-verdict parser の完全な自然言語パーシング（3 パターン追加で十分）

## Decisions

### D1: completionVerdict fallback を executor local runtime path に追加

`resultContent === null` のとき、`step.completionVerdict` が定義されていればそれを verdict として採用する。未定義の場合は既存の escalation fallback を維持する。

**代替案**: `resultContent === null` で一律 success → reject。propose 以外の null-result step（spec-fixer, implementer, build-fixer）は completionVerdict を既に宣言しており、それを参照するのが正しい。

### D2: `setsBranch` フラグで branch 自動設定を汎化

`AgentStep` interface に `setsBranch?: boolean` を追加。executor の local runtime path で `step.setsBranch === true && !jobState.branch` のとき `state.branch = "feat/${slug}"` を設定する。

**代替案**: `step.name === "propose"` ハードコード → TC-003 が fail するため不可。フラグ方式なら将来 propose 以外の step で branch 作成が必要になっても対応可能。

ProposeStep に `setsBranch: true` と `completionVerdict: "success"` を設定する。

### D3: review-verdict regex の拡張

現在の regex: `^- \*\*verdict\*\*:\s*(approved|needs-fix|escalation)\s*$`

拡張後: case-insensitive で以下にマッチ:
- `- **verdict**: approved`（既存）
- `**Verdict**: approved`（大文字 V、`- ` なし）
- `Verdict: approved`（bold なし）
- `- verdict: approved`（bold なし + `- ` あり）

1 本の regex に統合: `^[-\s]*\*{0,2}verdict\*{0,2}:\s*(approved|needs-fix|escalation)\s*$/mi`

### D4: MERGED bypass を fetchPrViewWithRetry 内に挿入

`fetchPrViewWithRetry` で `mergeStateStatus === "UNKNOWN"` の retry 分岐に入る前に `parsed.state === "MERGED"` を判定。MERGED なら即 `{ ok: true, data: parsed }` を返す。

**理由**: GitHub API は MERGED PR に対して mergeStateStatus を UNKNOWN で返すことがある（実測）。MERGED は不可逆な終了状態なので merge 可能性チェックは不要。

## Risks / Trade-offs

- **[Risk] regex 拡張で想定外マッチ** → `approved|needs-fix|escalation` のリテラル制約で verdict 値は限定されるため、false positive リスクは低い。unit test で boundary case を検証する
- **[Risk] setsBranch が managed runtime でも評価される** → managed runtime path は `_updatedState` 分岐で先に return するため setsBranch ロジックに到達しない。local runtime path 限定
- **[Risk] MERGED bypass で check 5-8 がスキップされる** → MERGED PR は Phase 1-3 skip の resume path に入るため、check 5-8 の結果は使用されない。ただし check 9（branch 存在確認）の MERGED path と連携する必要がある
