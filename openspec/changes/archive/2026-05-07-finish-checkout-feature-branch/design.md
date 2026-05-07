# Design: finish Phase 0 で feature branch に checkout して validate を実行する

## 設計方針

Phase 0 の Check 5+6 を feature branch の checkout 下で実行する。checkout/restore は try-finally パターンで確実に元の branch に戻す。

**設計原則**:
1. **Checkout 範囲の最小化**: Check 5+6 のみ。他の check は cwd のファイルシステムに依存しない
2. **冪等性**: Phase 1 の `checkoutFeatureBranch()` は `-B` フラグで冪等。Phase 0 で checkout 済みでも問題なし
3. **Finally パターン**: checkout 失敗/validate 失敗問わず、元の branch に restore する

## コンポーネント設計

### 1. preflight.ts の修正

#### 新規ヘルパー: `checkoutForValidation` / `restoreBranch`

```typescript
async function checkoutForValidation(params: {
  branch: string;
  cwd: string;
  spawn: SpawnFn;
}): Promise<{ ok: true; originalBranch: string } | { ok: false; escalation: string }> {
  const { branch, cwd, spawn } = params;

  // 現在の branch を記録
  const headResult = await spawn("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd });
  if (headResult.exitCode !== 0) {
    return { ok: false, escalation: "..." };
  }
  const originalBranch = headResult.stdout.trim();

  // feature branch を fetch + checkout
  await spawn("git", ["fetch", "origin", branch], { cwd });
  const checkoutResult = await spawn("git", ["checkout", branch], { cwd });
  if (checkoutResult.exitCode !== 0) {
    // local branch が存在しない場合: tracking branch を作成
    const trackResult = await spawn(
      "git", ["checkout", "-b", branch, `origin/${branch}`], { cwd },
    );
    if (trackResult.exitCode !== 0) {
      return { ok: false, escalation: "..." };
    }
  }

  return { ok: true, originalBranch };
}

async function restoreBranch(params: {
  originalBranch: string;
  cwd: string;
  spawn: SpawnFn;
}): Promise<void> {
  await params.spawn("git", ["checkout", params.originalBranch], { cwd: params.cwd });
}
```

#### runPreflight の修正

Check 4 完了後、Check 5 の前に checkout を挿入。Check 6 完了後に restore。

```typescript
// Check 4 完了
// ...

// Checkout feature branch for Check 5+6
const checkoutResult = await checkoutForValidation({
  branch: target.branch,
  cwd,
  spawn,
});
if (!checkoutResult.ok) {
  return { ok: false, escalation: checkoutResult.escalation };
}

try {
  // Check 5: openspec/changes/<slug>/ existence
  // Check 6: openspec validate
  // ... (既存ロジックそのまま)
} finally {
  // Always restore original branch
  await restoreBranch({
    originalBranch: checkoutResult.originalBranch,
    cwd,
    spawn,
  });
}
```

### 2. エラーハンドリング

| シナリオ | 動作 |
|---------|------|
| `git fetch` 失敗 | escalation（ネットワーク問題） |
| `git checkout <branch>` 失敗 + `git checkout -b <branch> origin/<branch>` 失敗 | escalation（branch が存在しない） |
| Check 5/6 失敗 | restore → escalation を返す |
| restore (`git checkout <original>`) 失敗 | stderr に warning を出力（escalation は Check 5/6 の結果を優先） |

### 3. テストの修正

`tests/unit/core/finish/preflight.test.ts` に以下を追加:

1. **既存テストへの影響**: spawn mock に `git rev-parse`, `git fetch`, `git checkout` のレスポンスを追加
2. **新規テストケース**:
   - checkout 成功 → validate 成功 → restore 成功
   - checkout 成功 → validate 失敗 → restore 実行（finally）
   - checkout 失敗 → escalation（validate 未実行）

## データフロー

```
runPreflight(target, cwd, spawn, fs)
  ↓
  Check 1-4 (既存)
  ↓
  git rev-parse --abbrev-ref HEAD → originalBranch
  git fetch origin <target.branch>
  git checkout <target.branch>
  ↓
  Check 5: fs.exists(openspec/changes/<slug>/)
  Check 6: spawn("openspec", ["validate", slug, "--strict"])
  ↓
  git checkout <originalBranch>  ← finally
  ↓
  Check 8 (既存)
  ↓
  return { ok: true, prViewData }
```

## Phase 1 との関係

Phase 1 の `checkoutFeatureBranch()` は以下を実行:

```typescript
git fetch origin <branch>        // 冪等
git checkout -B <branch> origin/<branch>  // 冪等（-B で強制上書き）
```

Phase 0 で checkout 済みの場合:
- `git fetch origin <branch>`: 冪等、問題なし
- `git checkout -B <branch> origin/<branch>`: すでにその branch にいるが、`-B` で上書きするので問題なし

Phase 0 で restore 後（main に戻っている場合）:
- 通常通り動作

いずれのケースでも冪等。

## リスク分析

| リスク | 影響度 | 対策 |
|--------|--------|------|
| Phase 0 で checkout した branch と Phase 1 の不整合 | 低 | Phase 1 は `-B` で冪等 |
| restore 失敗で main に戻れない | 中 | finally + stderr warning。Phase 1 がどのみち checkout するので実害は小さい |
| dry-run 時にも checkout が発生する | 低 | validate のために必要。git 状態は restore で元に戻る |
