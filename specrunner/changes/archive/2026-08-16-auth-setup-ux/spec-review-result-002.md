# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation として扱われる。
-->

## 検証した項目

### ドキュメント間の整合性（再確認）

review-001 で確認済みの整合性（request.md → design.md → spec.md → tasks.md → test-cases.md）に加え、以下を重点的に確認した。

- **review-001 F1（TC-014 説明のサブコマンド省略）の解消確認**: test-cases.md TC-014 が更新され「`credentials` コマンドおよび `set` サブコマンドが registry に実在することが通過条件」と明記された。F1 は解消済み。
- **review-001 F2（PROVIDER_READINESS_HINTS のサブコマンド検証欠落）の再確認**: 後述 F1 に詳細を記す。依然として open。

### 実コード照合（差分）

review-001 確認済みのファイルに加え、以下を読んだ:

| ファイル | 確認内容 |
|---|---|
| `src/core/credentials/credentials-io.ts` | `saveCredentials` が `atomicWriteJson(credPath, merged, { mode: 0o600 })` で保存（L133）。deep-merge（L127-132）でキーを上書きしないことを確認。T-03 の「既存 key を壊さない」保証の実在を検証 |
| `src/core/doctor/next-steps.ts` | `RULES` に `github-token-present/github-token-valid → specrunner login` が登録（L24）。`login` は GitHub 専用に変わっても引き続き実在コマンドなので hint は有効 |
| `src/core/doctor/checks/auth/github-token-valid.ts` | `verifyTokenScopes()` が `result.status`（200/401/その他）で分類（L26-38）。D1 が再利用するインターフェースを確認 |
| `src/core/credentials/github.ts` | `resolveGitHubToken` の戻り値型が `{ token, source: "credentials" \| "env" \| "gh" }` であり D1 が期待する source 型と一致。throw パスを確認 |
| `tests/hint-command-existence.test.ts` | `extractCommandVerbs` が `specrunner (\w+)` でトップレベル verb のみ抽出（L16-18）。TC-005 ブロックが `PROVIDER_READINESS_HINTS` を top-level verb のみで検証（L49-64）を確認 |
| `tests/init.test.ts` L519-542 | 既存テスト "config exists, provider flag is ignored" が config 不変を検証しているが、案内出力を assert しないことを確認（T-07/T-10 での追加が必要） |

### dead guidance 全件 grep（現時点の baseline）

`src/` 配下で `login --provider` を検索した結果、D6 が列挙した全 9 箇所（anthropic 5 + 構想コメント 1 + claude 4）が現時点で存在することを確認した。いずれも T-05 の置換対象として正しく列挙されている。

### セキュリティ観点

- **credential echo 問題**: 現行 `promptLine`（`readline.question` + `output: process.stdout`）は echo される。D3 の `readSecret` は TTY で `setRawMode(true)` + output 非送出、非 TTY で stdin read（pipe/cron 経路）で解決する設計。TC-011 でテスト固定される。
- **credentials.json 0600**: `atomicWriteJson` に `{ mode: 0o600 }` が渡されており、`credentials set` も同一経路（`saveCredentials` 経由）を使うため保証が引き継がれる。
- **deprecated flag → throw**: `parseFlags` がハンドラ到達前に `FlagParseError(deprecated.message)` を throw するため、非 0 終了 + 案内テキストの表示が dispatcher 経路で担保される。`--provider` の値が `github` / `claude` どちらでも同じ deprecated メッセージが出るが、メッセージ本文が "login is GitHub-only now" と明示するため UX として受容できる。
- **token 値の非出力**: D1 が「token 値・secret を stdout/stderr に出さない」と明示し、T-02 の Acceptance Criteria もこれを含む。設計上適切。
- **raw mode の Ctrl-C 割り込み**: T-03 は `\x03` (Ctrl-C) で中断するとだけ記し、中断時の `setRawMode(false)` を明示しない（後述 F2）。

### TC カバレッジ確認

spec.md の全シナリオ（login 6 シナリオ + credentials 4 + dead guidance 2 + doctor warn 1 + doctor readiness 2 + init 1 + README 1 = 17 シナリオ）が TC-001〜TC-019 に 1:1 で対応し、tasks.md 追加要件から TC-020〜TC-021（2 件）が加わって計 21 件。Summary の counts（must:19, should:2）も TC リストと一致する。

## 検証できなかった項目

- **`typecheck && test` 実行**: 実装前のため実行不能。
- **TTY raw mode 実際の動作確認**: TTY セッション外のため手動検証不能。

## Findings 詳細

### F1: PROVIDER_READINESS_HINTS のサブコマンド検証が T-10 のスコープ外（medium / fixable）

**場所**: `tests/hint-command-existence.test.ts` TC-005 ブロック (L49-64) および `tasks.md` T-10

**内容**: T-05 実施後、`src/core/runtime/provider-readiness.ts` の `PROVIDER_READINESS_HINTS` は `specrunner credentials set claude-code` を参照する。既存の TC-005 ブロックは `extractCommandVerbs` が `specrunner (\w+)` でトップレベル verb のみを抽出するため、`credentials` が registry に存在するかしか確認されず、`set` サブコマンドの存在は検証されない。

T-10 が追加する doctor hint のサブコマンド検証は `src/core/doctor/**` を対象とし、`src/core/runtime/provider-readiness.ts` はスコープ外である。サブコマンド名の誤記（例: `credentials st claude-code`）が生じても TC-005 は通過してしまう。

review-001 F2 と同一の根本問題であり、test-cases.md TC-014 の説明更新（F1 解消）によっては解消されていない。

**対処案**: T-10 の doctor hint サブコマンド検証スコープを `src/core/runtime/provider-readiness.ts` にも拡張する、または TC-005 の `extractCommandVerbs` を `specrunner (\w+)(?: (\w+))?` パターンに変えてサブコマンドも突合する。いずれも小さな変更で対処できる。

---

### F2: T-03 が raw mode の Ctrl-C 中断時の後処理を未規定（low / fixable）

**場所**: `tasks.md` T-03（`readSecret` TTY 分岐の仕様記述）

**内容**: T-03 は `readSecret` の TTY 分岐について「確定時に raw mode を解除し末尾に改行のみ出力する」と記すが、Ctrl-C (`\x03`) で中断した場合の `setRawMode(false)` を明示していない。Node.js プロセスが raw mode のまま終了すると、後続のシェルセッションでユーザーの入力文字が表示されなくなる（端末破壊）。

**対処案**: T-03 の `readSecret` 仕様に「`\x03` を受信した場合も `setRawMode(false)` を呼び出してから process.exit または reject する」を追記する。実装量は 1 行程度であり、確定パスのクリーンアップと対称的に書ける。
