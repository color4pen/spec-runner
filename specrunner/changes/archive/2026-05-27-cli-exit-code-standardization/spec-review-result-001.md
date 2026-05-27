# Spec Review Result

- **verdict**: needs-fix
- **reviewer**: spec-review agent
- **date**: 2026-05-27

---

## 総評

設計の方向性（0/1/2 統一、宣言的マッピング、handler の `process.exit` 排除）は正しく、実装コストも適切に絞られている。ただし、delta spec が baseline spec との整合を担保できていない箇所が 1 件あり、これがあると authority spec merge 後に spec 内部矛盾が生じる。加えて、tasks.md 内の矛盾が 1 件。いずれも実装前に修正が必要。

---

## Findings

### [HIGH] Delta spec が baseline の preflight 要件を MODIFIED していない

**場所**: `specs/cli-commands/spec.md`

**問題**:
baseline の `specrunner/specs/cli-commands/spec.md` には次の要件が存在する:

> Requirement: `specrunner job start` は起動前に fail-fast バリデーションを固定順序で実行する
> 1. `~/.config/specrunner/config.json` が存在すること（なければ … + **exit 1**）
> 3. cwd が git リポジトリであること（… + **exit 1**）
> 4. `git remote get-url origin` が `github.com` を指すこと（… + **exit 1**）

D3 / EXIT_CODE_MAP では `CONFIG_MISSING` / `NOT_GIT_REPO` / `REMOTE_NOT_GITHUB` を exit 2 に再分類する。これにより上記 baseline シナリオの期待値が変わるが、delta spec にそれらエラーコードが対応するシナリオの **MODIFIED** バージョンが存在しない。

delta spec の仕組みでは、header が完全一致しない Requirement は baseline にそのまま残る。merge 後の authority spec は「preflight で CONFIG_MISSING → exit 1（baseline）」と「CONFIG_MISSING → exit 2（delta）」が共存し、内部矛盾になる。

**修正**: delta spec の `## Requirements` に以下を追加する。

```markdown
### Requirement: `specrunner job start` は起動前に fail-fast バリデーションを固定順序で実行する

（本文は baseline と同様。シナリオのみ exit code を 1 → 2 に更新）

#### Scenario: config が存在しない（ステップ 1 で失敗）

- **WHEN** `~/.config/specrunner/config.json` が存在しない状態で `specrunner run req.md` を実行する
- **THEN** ステップ 1 で即時 exit 2 し、git repo チェック等は実行しない

#### Scenario: github token が欠けている（ステップ 2 で失敗）

- **WHEN** config は存在するが `github.accessToken` が未設定
- **THEN** ステップ 2 で `Run 'specrunner login' first.` を stderr に出し exit 2（前提条件不足）。cwd チェック等は実行しない

#### Scenario: origin が GitHub 以外（ステップ 4 で失敗）

- **WHEN** config と token は揃い cwd は git repo だが origin が gitlab.com を指す
- **THEN** ステップ 4 で `'origin' must point to github.com.` を stderr に出し exit 2（前提条件不足）
```

header を baseline と完全一致させることで tool が MODIFIED に自動分類し、authority spec が正しく更新される。

---

### [MEDIUM] Task 8 と Task 9 が `run.ts` slug-not-found の exit code で矛盾している

**場所**: `tasks.md` Task 8 / Task 9

**問題**:
- Task 8 (D5 準拠): 「`runRunCore()` でファイルが見つからない場合（slug としても解決できない場合）を exit 2 に変更」
- Task 9: 「slug 解決失敗（ファイルも slug も存在しない）→ exit 1（現状維持、存在しないリソースは「一般エラー」に分類。引数フォーマット自体は正しいため）」

両タスクが同じパスについて exit 2 と exit 1 を指示しており、実装者が判断できない状態。

`request validate` の同一パス（slug-not-found）は現在 exit 1 で `request review` も同様（command-registry.ts 264, 289 行目）。`run` だけ挙動を変えるかどうかは設計上の判断であり、一方を削除してから実装に進む必要がある。

**修正**: design.md または tasks.md で意図を明示する。推奨は Task 9 の方針（slug-not-found = exit 1）— 引数の形式は valid だが存在しないリソースを指しているだけなので runtime error 扱いが自然、かつ `request validate` / `request review` との一貫性がある。Task 8 の当該箇所を削除し、design D5 を更新する。

---

### [LOW] `job finish --job <uuid>` の不正 UUID チェックが exit 1 のまま（設計・タスクに記載なし）

**場所**: `src/cli/command-registry.ts` 449–451 行目

```typescript
if (jobFlagValue !== undefined && !UUID_REGEX.test(jobFlagValue)) {
  logError("invalid jobId format");
  process.exit(1);  // フォーマット不正 → exit 2 であるべき
}
```

`job cancel` の同様チェック（Task 9 で exit 2 に変更）と整合性が取れない。設計・タスクに記載がないため実装時に見落とされるリスクがある。tasks.md Task 9 にこのケースを追記することを推奨する。

---

### [LOW] subcommand worktree guard の `process.exit(1)` が設計でカバーされていない

**場所**: `bin/specrunner.ts` 62 行目

```typescript
process.exit(1);  // WORKTREE_GUARD → EXIT_CODE_MAP では exit 2
```

`run` コマンドのワークツリーガードは `worktreeGuardError` を throw → catch → `e.exitCode` (D6) で exit 2 になる経路。しかし `job start` / `resume` / `finish` の subcommand ガードは throw せず `process.exit(1)` を直接呼ぶため、D6 の恩恵を受けない。EXIT_CODE_MAP で WORKTREE_GUARD → exit 2 なのに、このパスは exit 1 のままになる。

tasks.md にこのケースの修正を追記することを推奨する（throw に変更して catch 経路に乗せるか、`EXIT_CODE.ARG_ERROR` を直接使う）。

---

## セキュリティ評価

- **パストラバーサル対策**: `VALID_JOB_ID_CHARS` ガード（cancel コマンド）、`SLUG_REGEX` ガード（request 系コマンド）はそのまま維持されており、exit code 変更によって検証ロジック自体は変わらない。問題なし。
- **エラー情報の漏洩**: `SpecRunnerError.hint` は stderr に出力されるが、変更前後で内容は変わらない。問題なし。
- **`github-device.ts` の `process.exit` → throw への変更**: エラーを caller に伝播させる変更であり、ハンドラが適切に catch する限り安全。むしろテスタビリティが向上する。問題なし。
- OWASP Top 10 観点での新規リスクなし。

---

## 承認条件

以下の修正を delta spec と tasks.md に反映した後、再レビューなしで実装に進むことができる:

1. `specs/cli-commands/spec.md` に「Requirement: `specrunner job start` は起動前に fail-fast バリデーションを固定順序で実行する」の MODIFIED バージョンを追加し、exit 1 → exit 2 のシナリオを記載する
2. Task 8 / Task 9 の slug-not-found exit code 矛盾を解消し、どちらか一方に統一する
3. [任意] Task 9 に `job finish --job` UUID チェック (exit 1 → exit 2) を追記する
4. [任意] Task 9 または Task 3 に subcommand worktree guard の `process.exit(1)` 修正を追記する
