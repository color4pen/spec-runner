# Test Cases: codex-auth-fix

## TC-01: CodexAgentRunner — 引数なしで生成できる

- **Category**: CodexAgentRunner
- **Priority**: must
- **Source**: T1, 受け入れ基準「既存の Claude パイプラインに影響なし」

```
GIVEN: CodexAgentRunnerDeps に apiKey が存在しない
WHEN:  new CodexAgentRunner() を引数なしで呼ぶ
THEN:  型エラーもランタイムエラーも発生しない
```

---

## TC-02: CodexAgentRunner — _codexFactory をシグネチャ () で注入できる

- **Category**: CodexAgentRunner
- **Priority**: must
- **Source**: T1, D1

```
GIVEN: () => CodexInstance を返すファクトリ関数を用意する
WHEN:  new CodexAgentRunner({ _codexFactory: factory }) で生成し run() を呼ぶ
THEN:  factory() が引数なしで呼ばれる（apiKey を引数として渡さない）
```

---

## TC-03: CodexAgentRunner — run() が Codex SDK を apiKey なしで生成する

- **Category**: CodexAgentRunner
- **Priority**: must
- **Source**: T1, D2, 背景「SDK に apiKey を渡さなければ process.env を CLI に継承する」

```
GIVEN: _codexFactory を差し込まず new CodexAgentRunner() を使う
WHEN:  run() を呼ぶ
THEN:  デフォルトファクトリ `() => new Codex()` が引数なしで実行される
       （Codex SDK に apiKey が渡らず、CLI が process.env を継承する）
```

---

## TC-04: CodexAgentRunner — 認証エラー時に SDK の message をそのまま返す

- **Category**: CodexAgentRunner / ErrorHandling
- **Priority**: must
- **Source**: T2, D2, 要件 6「spec-runner 側でメッセージを加工しない」

```
GIVEN: _codexFactory が `Error("Codex Exec exited with code 1: auth error detail")` を throw するモックを注入する
WHEN:  run() を呼ぶ
THEN:  result.completionReason === "error"
       result.error?.message === "Codex Exec exited with code 1: auth error detail"
         （"Codex SDK error: " prefix が付かない）
       result.error?.code === "CODEX_SDK_ERROR"
       result.error?.cause は元の Error と同一
```

---

## TC-05: CodexAgentRunner — エラーコード CODEX_SDK_ERROR が維持される

- **Category**: CodexAgentRunner / ErrorHandling
- **Priority**: must
- **Source**: T2, D2「エラーコード CODEX_SDK_ERROR は維持する」

```
GIVEN: _codexFactory が Error を throw するモックを注入する
WHEN:  run() を呼ぶ
THEN:  result.error?.code === "CODEX_SDK_ERROR"
```

---

## TC-06: DispatchingAgentRunner — OPENAI_API_KEY 未設定でも openai ステップが実行される

- **Category**: DispatchingAgentRunner
- **Priority**: must
- **Source**: T3, 受け入れ基準「OPENAI_API_KEY / CODEX_API_KEY 未設定でも codex login 済みなら実行できる」

```
GIVEN: process.env に OPENAI_API_KEY も CODEX_API_KEY も設定しない
WHEN:  provider === "openai" の StepContext で DispatchingAgentRunner.run() を呼ぶ
THEN:  MISSING_OPENAI_API_KEY エラーは throw されない
       CodexAgentRunner.run() が呼ばれる（認証は CLI に委ねられる）
```

---

## TC-07: DispatchingAgentRunner — CodexAgentRunner が lazy init で生成される（引数なし）

- **Category**: DispatchingAgentRunner
- **Priority**: must
- **Source**: T3, T4.5

```
GIVEN: 初回の openai ステップ実行
WHEN:  run() を呼ぶ
THEN:  new CodexAgentRunner() が引数なしで呼ばれる
       2 回目以降は同一インスタンスを再利用する
```

---

## TC-08: DispatchingAgentRunner — Claude ステップへの影響がない

- **Category**: DispatchingAgentRunner
- **Priority**: must
- **Source**: 受け入れ基準「既存の Claude パイプラインに影響なし」

```
GIVEN: provider === "anthropic" の StepContext
WHEN:  DispatchingAgentRunner.run() を呼ぶ
THEN:  ClaudeAgentRunner が使われ、CodexAgentRunner は生成されない
       OPENAI_API_KEY チェックが入らない
```

---

## TC-09: doctor codex-cli — codex バイナリ不在のとき fail を返す

- **Category**: DoctorCheck
- **Priority**: must
- **Source**: T5, D5「codex CLI バイナリが存在しない場合は従来通り fail」

```
GIVEN: execFile("codex", ["--version"]) が ENOENT を throw するモック環境
WHEN:  codex-cli doctor チェックを実行する
THEN:  result.status === "fail"
```

---

## TC-10: doctor codex-cli — codex バイナリあり且つ認証済みのとき pass を返す

- **Category**: DoctorCheck
- **Priority**: must
- **Source**: T5, D5「成功 → pass (codex {version} (authenticated))」

```
GIVEN: execFile("codex", ["--version"]) が "1.0.0" を返す
       execFile("codex", ["auth", "whoami"]) が成功する
WHEN:  codex-cli doctor チェックを実行する
THEN:  result.status === "pass"
       result.message に "(authenticated)" が含まれる
```

---

## TC-11: doctor codex-cli — codex バイナリあり且つ未認証のとき warn を返す

- **Category**: DoctorCheck
- **Priority**: must
- **Source**: T5, D5「失敗 → warn (not authenticated), hint: codex login or set CODEX_API_KEY」

```
GIVEN: execFile("codex", ["--version"]) が "1.0.0" を返す
       execFile("codex", ["auth", "whoami"]) が非ゼロ exit code で失敗する
WHEN:  codex-cli doctor チェックを実行する
THEN:  result.status === "warn"
       result.message に "(not authenticated)" が含まれる
       result.hint に "codex login" と "CODEX_API_KEY" の両方が含まれる
```

---

## TC-12: doctor codex-cli — openai ステップがなければ auth whoami をスキップする

- **Category**: DoctorCheck
- **Priority**: should
- **Source**: T5, D5「hasOpenAiSteps() が false → pass（変更なし）」

```
GIVEN: hasOpenAiSteps() が false を返すプロジェクト設定
WHEN:  codex-cli doctor チェックを実行する
THEN:  result.status === "pass"
       execFile("codex", ["auth", "whoami"]) は呼ばれない
```

---

## TC-13: doctor codex-cli — auth whoami が 5 秒でタイムアウトしても warn を返す

- **Category**: DoctorCheck
- **Priority**: should
- **Source**: T5, D5「AbortSignal.timeout(5000)」

```
GIVEN: execFile("codex", ["--version"]) が成功する
       execFile("codex", ["auth", "whoami"]) が 5000ms 経過後に AbortError を throw する
WHEN:  codex-cli doctor チェックを実行する
THEN:  result.status === "warn"（タイムアウトで fail にならない）
       5 秒を超えてハングしない
```

---

## TC-14: CODEX_API_KEY 設定時に CLI がそれを使う（プロセス継承）

- **Category**: CodexAgentRunner / Integration
- **Priority**: should
- **Source**: 受け入れ基準「CODEX_API_KEY が環境変数に設定されていれば CLI がそれを使う」

```
GIVEN: process.env に CODEX_API_KEY が設定されている
       SDK に apiKey を渡さない（new Codex() 引数なし）
WHEN:  Codex SDK が CLI を起動する
THEN:  CLI が process.env.CODEX_API_KEY を継承して認証に使う
       （SDK のソース L222-237 の継承挙動による）
```

---

## TC-15: typecheck と test suite が green

- **Category**: Build
- **Priority**: must
- **Source**: T6, 受け入れ基準「bun run typecheck && bun run test が green」

```
GIVEN: T1〜T5 の変更がすべて適用された状態
WHEN:  bun run typecheck && bun run test を実行する
THEN:  型エラー 0 件
       テスト失敗 0 件
```
