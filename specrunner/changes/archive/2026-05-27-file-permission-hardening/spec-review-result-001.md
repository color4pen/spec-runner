# Spec Review Result: file-permission-hardening

- **verdict**: approved

## Summary

変更 3 点（atomic-write デフォルト mode, O_EXCL, stdout openSync）すべてについてソースコードを直接確認し、request.md / design.md / tasks.md の主張がすべて正確であることを検証した。

## Source Code Verification

| 主張 | 実ファイル確認 | 結果 |
|------|--------------|------|
| `atomic-write.ts`: mode 未指定時は if/else 分岐、O_EXCL なし | L27-32 確認 | ✓ |
| `stdout.ts` L92: `openSync(currentLogPath, "a")` mode 未指定 | L92 確認 | ✓ |
| `job-state-store.ts`: mode 未指定で atomicWriteJson 呼び出し | L92, L211 確認 | ✓ |
| `credentials-io.ts`: `{ mode: CREDENTIALS_MODE }` 明示済み | L79 確認 | ✓ |
| `config/store.ts`: `{ mode: CONFIG_MODE }` 明示済み | L144, L160 確認 | ✓ |
| `usage/store.ts`: mode 未指定で atomicWriteJson 呼び出し（design.md が追加識別） | L48 確認 | ✓ |

## Security Analysis

### O_EXCL (`wx` フラグ)

`writeFile(tmpPath, json, { flag: "wx", mode })` は `O_WRONLY | O_CREAT | O_EXCL` を意味する。

- **symlink attack 防止**: 攻撃者が tmpPath → victim を事前に symlink しても O_EXCL が EEXIST を返し書き込みを拒否する ✓
- **エントロピー**: `randomBytes(6).toString("hex")` は 48 bits ≈ 281 兆通り。EEXIST による衝突は実用上無視できる ✓
- **ENOENT の無害処理**: O_EXCL 失敗時は tmp file が存在しないため `unlink(tmpPath).catch(() => undefined)` は ENOENT を無害に握りつぶす ✓

### chmod 後処理

`rename(tmpPath, filePath)` は destination の mode を OS によって保持または継承する動作が異なる。`chmod(filePath, mode)` を常に実行することで確実に 0o600 を設定する設計は正しい。

### umask との関係

0o600 は group/other bit がすべて 0 のため、umask（通常 0o022 または 0o002）の影響を受けない。`writeFile` での mode 指定と `chmod` 後処理の組み合わせで確実に 0o600 が設定される。

### OWASP A01 (Broken Access Control)

job state ファイル（`.specrunner/jobs/*.json`）は job ID・step 状態・process ID を含む。0o644 → 0o600 への修正は同一ホスト上の他ユーザーからの読み取りを防ぐ正当な hardening。

## Spec Consistency

- request.md の要件 1〜4 がすべて design.md D1〜D3 に対応している
- design.md が `usage/store.ts` を追加識別している点は request.md との矛盾ではなく正当な補完（D1 のデフォルト変更で自動対応されるため tasks.md の変更タスク不要は正しい）
- tasks.md のコードスニペットは要件と一致し、`chmod` を常に実行する点も明示されている
- 受け入れ基準が実装可能な形で明確に定義されている

## No Issues Found
