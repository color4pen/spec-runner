# Spec: build-fixer の config 編集を同一 job 内 verification に反映する（in-job coverage 再解決）

自己完結の behavior spec。型 / FSM / 構造が自動で強制しない Layer-1 の振る舞いを固定する。

## Requirements

### Requirement: verification は実行直前に coverage config を disk から再解決する

verification step は `runVerification` を呼ぶ直前に、verification の cwd（job worktree）を起点として `verification.coverage` を disk 上の config（user global + project local overlay）から再解決する MUST。再解決に成功したときは、その coverage を用いて verification を実行する MUST。これにより、同一 job 内で先行する build-fixer が `.specrunner/config.json` の `verification.coverage`（例: `exclude`）を編集した場合、その更新が後続 verification に反映される SHALL。

#### Scenario: build-fixer が追加した exclude が同一 job 内の後続 verification で反映される

**Given** coverage を宣言した project-local `.specrunner/config.json` を持つ worktree で、変更ファイル `src/types.ts`（型のみ）が lcov に `SF` レコードとして存在せず、job 開始時の in-memory config の `coverage.exclude` が未設定であり、そのため直前の verification が `not-loaded` で failed になっている
**When** disk 上の `.specrunner/config.json` の `verification.coverage.exclude` に `src/types.ts` にマッチする glob（例: `src/**/*.ts` の型ファイル or `src/types.ts`）が追加された後、同一 job（同一 in-memory config）で verification が再実行される
**Then** verification は再解決した disk 上の exclude を反映し、`src/types.ts` は対象外となって changed-line-coverage gate を pass する

#### Scenario: in-memory config ではなく再解決した coverage が使われる

**Given** job 開始時の in-memory `deps.config.verification.coverage` が exclude を持たず、disk 上の project-local config が同ファイルを exclude に追加している
**When** verification step が実行される
**Then** `runVerification` には in-memory の coverage ではなく disk から再解決した（exclude を含む）coverage が渡される

### Requirement: 再解決の対象範囲は verification.coverage に限定される

in-job の再解決が反映するのは `verification.coverage` のみである MUST。`verification.commands` を含む verification 内の他フィールド、および verification 以外の全 config（model 設定・pipeline 設定・step 設定等）は job 開始時に load された値を保持し、同一 job の途中で disk の変更により差し替わってはならない MUST。

#### Scenario: commands は job 開始時の値を保持する

**Given** job 開始時の in-memory config が `verification.commands` を持ち、disk 上の project-local config で `verification.commands` が別内容に書き換えられている
**When** verification step が実行される
**Then** verification に用いられる `commands` は job 開始時の値のままで、disk の変更は反映されない（反映されるのは `coverage` のみ）

#### Scenario: verification 無関係の config は途中変更されない

**Given** disk 上の project-local config で verification 以外の key（例: step の model）が job 開始時と異なる
**When** verification step が実行される
**Then** その verification 無関係の config は job 開始時の値のまま影響を受けない

### Requirement: 再解決の起点は verification の cwd、適用は project-local 存在を条件とする

再解決は verification の cwd（`deps.cwd`、無ければ `process.cwd()`）を起点に repo-root を解決し、`<repoRoot>/.specrunner/config.json`（project local）が存在するときのみ再解決結果を適用する MUST。project-local config が存在しない場合は job 開始時の coverage を維持する SHALL（project-local overlay を持たない cwd で job 開始時の coverage を取りこぼす回帰を防ぐ）。

#### Scenario: project-local config が存在すれば再解決を適用する

**Given** verification の cwd の repo-root に `.specrunner/config.json` が存在する
**When** verification step が coverage を再解決する
**Then** disk から再解決した coverage が適用される

#### Scenario: project-local config が存在しなければ job 開始時 config を維持する

**Given** verification の cwd の repo-root に `.specrunner/config.json` が存在しない（user-global のみ）
**When** verification step が coverage を再解決する
**Then** 再解決は適用されず、job 開始時の in-memory coverage がそのまま使われる

### Requirement: 再解決の失敗は job 開始時の config へ fail-safe する

coverage の再解決が失敗したとき（repo-root 解決失敗、disk config の validation エラー、その他 I/O 例外）、verification step は job 開始時に load された `verification.coverage` をそのまま用いて verification を実行する MUST。再解決の失敗が verification を crash させたり、gate を弱めたりしてはならない MUST。

#### Scenario: disk config が壊れていても verification は job 開始時 config で走る

**Given** disk 上の `.specrunner/config.json` が JSON として不正、または config validation を通らない
**When** verification step が coverage を再解決する
**Then** 再解決は適用されず、verification は job 開始時の coverage で実行され、crash しない
