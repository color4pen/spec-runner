## MODIFIED Requirements

### Requirement: 状態ファイルの enumeration は破損に耐える

`specrunner ps` が `jobs/` を走査する際、CLI は MUST JSON パース不可な、または必須フィールド欠落のファイルは skip し、stderr に `Skipping malformed file: <path>` を出力した上で SHALL 残りのファイル処理を継続する。

`resolveJobId(prefix)` による prefix match 走査においても同じ耐性を持つ。破損ファイルは MUST skip され、正常なファイルのみが prefix match の候補となる。

#### Scenario: 1 ファイルが破損

- **WHEN** ジョブディレクトリに 3 ファイルあり、1 ファイルが JSON パース不可
- **THEN** 残り 2 ファイルが正常に表示され、stderr に skip メッセージが 1 行出力される

#### Scenario: prefix match 走査中に破損ファイルが存在

- **GIVEN** ジョブディレクトリに 3 ファイルあり、1 ファイルが JSON パース不可で、残り 2 ファイルの jobId が `3f1a` で始まる
- **WHEN** `resolveJobId("3f1a")` が呼ばれる
- **THEN** 破損ファイルは skip され、正常な 2 ファイルが候補として返される（`AMBIGUOUS_JOB_ID` エラー）

## NEW Requirements

### Requirement: `resolveJobId` は短縮 ID から完全 UUID を解決する

`resolveJobId(prefix: string): Promise<string>` は MUST `state/store.ts` から export される。完全 UUID または短縮 ID prefix を受け取り、一意に特定された完全 UUID を返す。

シグネチャ:

```typescript
export async function resolveJobId(prefix: string): Promise<string>
```

解決ルール:

1. 入力が 36 文字（UUID v4 形式）の場合は SHALL そのまま返す。`listJobStates()` は呼ばない
2. 短縮 ID の場合は SHALL `listJobStates()` で全ジョブを取得し、`state.jobId.startsWith(prefix)` で prefix match する
3. 1 件 match の場合は SHALL その `state.jobId`（完全 UUID）を返す
4. 0 件 match の場合は MUST `JOB_NOT_FOUND` エラーを throw する
5. 2 件以上 match の場合は MUST `AMBIGUOUS_JOB_ID` エラーを throw する。`hint` に候補の完全 UUID 一覧を含める

短縮 ID の最小長に制限はない。1 文字でも一意に特定できれば受け付ける。

#### Scenario: 完全 UUID はそのまま返す

- **GIVEN** prefix が `3f1a1f29-0669-482a-b2d4-0f272e1caaf3`（36 文字）
- **WHEN** `resolveJobId(prefix)` が呼ばれる
- **THEN** `"3f1a1f29-0669-482a-b2d4-0f272e1caaf3"` がそのまま返される
- **AND** `listJobStates()` は呼ばれない

#### Scenario: 短縮 ID で一意に特定

- **GIVEN** ジョブ `3f1a1f29-...` が 1 件のみ存在する
- **WHEN** `resolveJobId("3f1a1f29")` が呼ばれる
- **THEN** `"3f1a1f29-0669-482a-b2d4-0f272e1caaf3"` が返される

#### Scenario: 短縮 ID で 0 件 match

- **GIVEN** `"abc"` で始まる jobId を持つジョブが存在しない
- **WHEN** `resolveJobId("abc")` が呼ばれる
- **THEN** `JOB_NOT_FOUND` エラーが throw される

#### Scenario: 短縮 ID で複数 match

- **GIVEN** `"3f1a"` で始まる jobId を持つジョブが 2 件存在する
- **WHEN** `resolveJobId("3f1a")` が呼ばれる
- **THEN** `AMBIGUOUS_JOB_ID` エラーが throw される
- **AND** `hint` に 2 件の完全 UUID が含まれる

#### Scenario: 1 文字の prefix でも一意なら解決

- **GIVEN** `"a"` で始まる jobId を持つジョブが 1 件のみ存在する
- **WHEN** `resolveJobId("a")` が呼ばれる
- **THEN** その jobId が返される
