# Spec: test-coverage-extensions

## Requirements

### Requirement: test-coverage は JS/TS test ファイルを拡張子定数配列で収集する

`src/core/verification/test-coverage.ts` の `collectProjectTestFiles(rootDir)` は、test ファイルを
収集する際、ファイル名が以下 12 拡張子のいずれかで終わるものを収集 MUST する:
`.test.ts` / `.spec.ts` / `.test.js` / `.spec.js` / `.test.tsx` / `.spec.tsx` /
`.test.jsx` / `.spec.jsx` / `.test.mts` / `.spec.mts` / `.test.mjs` / `.spec.mjs`。
判定に用いる拡張子の集合は module スコープの定数配列として定義 MUST し、`collectProjectTestFiles()` は
その配列を参照して各エントリ名の末尾一致を判定する。これら以外の拡張子（例: 非 test の `.ts` / `.tsx`）は
収集対象に MUST NOT 含める。

#### Scenario: 追加 JS/JSX 拡張子が収集される

**Given** `rootDir` 配下に `a.test.js` / `b.spec.js` / `c.test.jsx` / `d.spec.jsx` が存在する
**When** `collectProjectTestFiles(rootDir)` を呼ぶ
**Then** 戻り値の配列に上記 4 ファイルすべてのパスが含まれる

#### Scenario: 追加 TSX 拡張子が収集される

**Given** `rootDir` 配下に `a.test.tsx` / `b.spec.tsx` が存在する
**When** `collectProjectTestFiles(rootDir)` を呼ぶ
**Then** 戻り値の配列に上記 2 ファイルのパスが含まれる

#### Scenario: 追加 ESM 明示拡張子が収集される

**Given** `rootDir` 配下に `a.test.mts` / `b.spec.mts` / `c.test.mjs` / `d.spec.mjs` が存在する
**When** `collectProjectTestFiles(rootDir)` を呼ぶ
**Then** 戻り値の配列に上記 4 ファイルすべてのパスが含まれる

#### Scenario: 既存 .test.ts / .spec.ts が引き続き収集される（後方互換）

**Given** `rootDir` 配下に `a.test.ts` / `b.spec.ts` が存在する
**When** `collectProjectTestFiles(rootDir)` を呼ぶ
**Then** 戻り値の配列に上記 2 ファイルのパスが含まれる

#### Scenario: test 拡張子に該当しないファイルは収集されない

**Given** `rootDir` 配下に `index.ts` / `component.tsx`（test/spec 拡張子でない）が存在する
**When** `collectProjectTestFiles(rootDir)` を呼ぶ
**Then** 戻り値の配列にこれらのファイルは含まれない

### Requirement: 追加拡張子の test ファイルに記載された must TC ID が found になる

`runTestCoveragePhase(slug, cwd)` は、must TC ID が追加対応拡張子（`.test.js` / `.spec.js` /
`.test.tsx` / `.spec.tsx` / `.test.jsx` / `.spec.jsx` / `.test.mts` / `.spec.mts` /
`.test.mjs` / `.spec.mjs`）の test ファイルに assertion 付きで出現する場合、その TC ID を
`foundTcIds` に含め MUST、`status` を `"passed"` と判定する。

#### Scenario: .test.js に記載された must TC ID が found になる

**Given** must TC の TC ID と assertion（`expect(`）が `cwd` 配下の `feature.test.js` に記載されている
**When** `runTestCoveragePhase(slug, cwd)` を呼ぶ
**Then** その TC ID は `foundTcIds` に含まれ、`status` は `"passed"`

#### Scenario: .test.tsx に記載された must TC ID が found になる

**Given** must TC の TC ID と assertion が `cwd` 配下の `Component.test.tsx` に記載されている
**When** `runTestCoveragePhase(slug, cwd)` を呼ぶ
**Then** その TC ID は `foundTcIds` に含まれ、`status` は `"passed"`
