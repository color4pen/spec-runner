# Design: CodexAgentRunner 認証を Codex CLI の認証チェーンに委ねる

## 変更サマリ

`CodexAgentRunner` から `apiKey` 必須を撤廃し、`Codex()` をオプションなしで生成することで
Codex CLI の認証チェーン（`CODEX_API_KEY` / `~/.codex/auth.json` / `CODEX_ACCESS_TOKEN`）を
そのまま使えるようにする。あわせて `specrunner doctor` に `codex auth whoami` チェックを追加する。

---

## 影響ファイル

| ファイル | 変更種別 |
|---------|---------|
| `src/adapter/codex/agent-runner.ts` | `apiKey` フィールド・`CodexAgentRunnerDeps.apiKey` を削除 |
| `src/adapter/dispatching/agent-runner.ts` | `OPENAI_API_KEY` 存在チェックを削除 |
| `src/core/doctor/checks/runtime/codex-cli.ts` | `codex auth whoami` チェックを追加 |
| `tests/adapter/codex/agent-runner.test.ts` | `apiKey` 引数削除に合わせてテストを更新 |
| `tests/adapter/dispatching/agent-runner.test.ts` | `OPENAI_API_KEY` 環境変数操作の除去、`MISSING_OPENAI_API_KEY` テスト削除 |

---

## D1: `CodexAgentRunnerDeps` の変更

### Before

```ts
export interface CodexAgentRunnerDeps {
  apiKey: string;
  _codexFactory?: (opts: { apiKey: string }) => CodexInstance;
}
```

### After

```ts
export interface CodexAgentRunnerDeps {
  /** Injectable factory for testing. Defaults to `() => new Codex()`. */
  _codexFactory?: () => CodexInstance;
}
```

- `apiKey` フィールドを削除する。
- `_codexFactory` の引数シグネチャを `() => CodexInstance` に変更する。
- `deps` をオプション引数にする（`constructor(deps: CodexAgentRunnerDeps = {})`）。
  これにより `DispatchingAgentRunner` が `new CodexAgentRunner()` と引数なしで生成できる。

---

## D2: `CodexAgentRunner` クラスの変更

- `private readonly apiKey` フィールドを削除する。
- `codexFactory` の型を `() => CodexInstance` に変更する。
- デフォルトファクトリを `() => new Codex() as unknown as CodexInstance` にする（引数なし）。
- `run()` 内の `this.codexFactory({ apiKey: this.apiKey })` を `this.codexFactory()` に変更する。

### SDK エラーのパス（D3）

`@openai/codex-sdk` は認証失敗時に CLI exit code 非0で終了し、
`Error("Codex Exec exited with code N: {stderr}")` を throw する。
この message に CLI の認証エラーメッセージが含まれる。

現在の実装は `"Codex SDK error: " + cause.message` と prefixを付けて包んでいる。
要件「spec-runner 側でメッセージを加工しない」に従い、`cause.message` をそのまま使う：

```ts
return {
  completionReason: "error",
  resultContent: null,
  error: Object.assign(
    new Error(cause.message),
    { code: "CODEX_SDK_ERROR", cause },
  ),
};
```

エラーコード `CODEX_SDK_ERROR` は維持する（呼び出し元の分類に使用）。

---

## D4: `DispatchingAgentRunner` の変更

### Before

```ts
if (provider === "openai") {
  if (!this.codexRunner) {
    const apiKey = process.env["OPENAI_API_KEY"];
    if (!apiKey) {
      throw Object.assign(
        new Error("OPENAI_API_KEY environment variable is required for OpenAI model steps"),
        { code: "MISSING_OPENAI_API_KEY" },
      );
    }
    this.codexRunner = new CodexAgentRunner({ apiKey });
  }
  return this.codexRunner.run(ctx);
}
```

### After

```ts
if (provider === "openai") {
  if (!this.codexRunner) {
    this.codexRunner = new CodexAgentRunner();
  }
  return this.codexRunner.run(ctx);
}
```

- `OPENAI_API_KEY` チェックを削除する。認証は Codex CLI に全委譲。
- 認証失敗は実行時に SDK が throw する `CODEX_SDK_ERROR` として浮上する。

---

## D5: `codex-cli.ts` doctor チェックの変更

バイナリ存在確認に加え、`codex auth whoami` を実行して認証状態を確認する。

### ロジック

1. `hasOpenAiSteps()` が false → `pass`（変更なし）
2. `codex --version` 失敗 → `fail`（変更なし）
3. `codex --version` 成功 → `codex auth whoami` を実行
   - 成功 → `pass` (`codex {version} (authenticated)`)
   - 失敗 → `warn` (`codex {version} (not authenticated)`, hint: `codex login or set CODEX_API_KEY`)

```ts
// バイナリ確認後に追加
try {
  await ctx.execFile("codex", ["auth", "whoami"], {
    signal: AbortSignal.timeout(5000),
  });
  return { status: "pass", message: `codex ${version} (authenticated)` };
} catch {
  return {
    status: "warn",
    message: `codex ${version} (not authenticated)`,
    hint: "Run `codex login` to authenticate, or set the CODEX_API_KEY environment variable",
  };
}
```

`warn` は required=true のチェックでも `exit 1` にはしない（`DoctorCheck.required` はデフォルト `true` だが、
`DoctorResult.status === "warn"` は致命的扱いしない既存の設計に従う）。
ただし codex-cli チェック自体の `required` を `false` に変更することも検討できるが、
バイナリ不在は確かに致命的なので `required: true` のまま維持し、
認証未済は `warn` で止まる（使用者が `codex login` すれば解決）。

### 移行パスについて（`OPENAI_API_KEY` のみ設定しているユーザー）

旧実装は `OPENAI_API_KEY` を読み取って SDK の `apiKey` に渡していたが、
新実装では SDK に `apiKey` を渡さず、CLI が `process.env` を継承して
`CODEX_API_KEY` / `~/.codex/auth.json` / `CODEX_ACCESS_TOKEN` の順に検索する。

Codex CLI が `OPENAI_API_KEY` をフォールバックとして読むかどうかは CLI の実装依存であるため、
`OPENAI_API_KEY` のみを設定しているユーザーは `CODEX_API_KEY` への移行が必要な可能性がある。
上記の `warn` hint に `CODEX_API_KEY` への言及を含めることでこの移行パスをガイドする。

---

## D6: テストの更新方針

`tests/adapter/codex/agent-runner.test.ts` の変更点：

| 変更前 | 変更後 |
|-------|-------|
| `new CodexAgentRunner({ apiKey: "sk-test" })` | `new CodexAgentRunner()` |
| `new CodexAgentRunner({ apiKey: "sk-test", _codexFactory: factory })` | `new CodexAgentRunner({ _codexFactory: factory })` |
| `makeCodexFactory` の型 `(opts: { apiKey: string }) => CodexInstance` | `() => CodexInstance` |

全テストケースは構造・アサーションを維持する。`apiKey` の除去のみ。

---

## Delta Spec

この変更はバグ修正（既存 spec に記載された動作の修正）であり、新 capability は追加しない。
delta spec は不要。

なお `specrunner/changes/archive/codex/delta-spec.md` の `dispatching-agent-runner` spec に
`OPENAI_API_KEY` 読み取りと `MISSING_OPENAI_API_KEY` throw を要求する記述（#5, #6）が存在するが、
これは archive 内の過去の delta-spec であり `specrunner/specs/` の live spec ではない。
live spec への影響はないため、delta spec を新たに追加する必要はない。
