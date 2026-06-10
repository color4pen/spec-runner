# Conformance Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): `- **verdict**: <value>` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:   implementation conforms to tasks.md, design.md, spec.md, and request.md
  - needs-fix:  one or more upstream artifacts are not satisfied by the implementation
  - escalation: conformance cannot be determined (missing artifacts, unresolvable ambiguity)
- The Findings table records the per-artifact judgment.
-->

- **verdict**: approved

## Conformance Findings

| Artifact | Conforms | Notes |
|----------|----------|-------|
| tasks.md | ✓ | T-01〜T-06 全 checkbox が [x] 済み |
| design.md | ✓ | D1〜D5 全決定が実装に反映されている（詳細は下記） |
| spec.md | ✓ | 3 Requirement の全 Scenario を満たす |
| request.md | ✓ | 受け入れ基準 5 項目すべてクリア |

## J1: Design fidelity

### D1: OIDC migration（publish.yml）

| 確認点 | 結果 |
|--------|------|
| `NODE_AUTH_TOKEN` env 削除 | ✓ publish.yml の publish step から env block が消えている |
| `npm install -g npm@latest` を setup-node 直後に追加 | ✓ :34（setup-node:29 の次） |
| npm 更新 step が `npm publish` より前 | ✓ :34 < :42 |
| `permissions.id-token: write` 維持 | ✓ :23 |
| `npm publish --provenance` 維持 | ✓ :42 |
| `registry-url: https://registry.npmjs.org` 維持 | ✓ :32 |

### D2: SHA pin（全 7 出現箇所）

design.md D2 の SHA 表と実装が一致している。

| action | tag | 実装 SHA | design.md と一致 |
|--------|-----|----------|-----------------|
| `actions/checkout` | v4 | `34e114876b0b11c390a56381ad16ebd13914f8d5` | ✓ |
| `actions/setup-node` | v4 | `49933ea5288caeca8642d1e84afbd3f7d6820020` | ✓ |
| `oven-sh/setup-bun` | v2 | `0c5077e51419868618aeaa5fe8019c62421857d6` | ✓ |
| `google-github-actions/release-please-action` | v4 | `e4dc86ba9405554aeba3c6bb2d169500e7d3b4ee` | ✓（dereference 後 commit SHA） |

行末コメントは元タグ（`# v4` / `# v2`）そのまま。全 workflow で `@vN` タグ参照ゼロ。

### D3: ci.yml trigger

`on.push` に `paths-ignore: ["specrunner/changes/**"]` が追加されている。`on.pull_request:` は body なしのまま無変更。

### D4: SHA 検証方法の記録

design.md Migration Plan に `git ls-remote ... '<tag>^{}'` コマンドと annotated tag dereference の注意が記載されており、change folder が PR diff に含まれることで受け入れ基準「検証方法を PR に記載」を満たす。

### D5: guard test

`tests/grep-workflow-actions-pinned.test.ts` が追加され、TC-001〜007 / TC-013 を assert している。SHA 値でなく構造（40 桁 hex + コメント）を検証し、将来のタグ移動で壊れない設計。

## J2: Spec requirements

| Requirement | 確認 |
|-------------|------|
| publish.yml は OIDC で publish しなければならない（MUST） | ✓ NODE_AUTH_TOKEN/NPM_TOKEN なし、id-token:write + --provenance 維持、npm 更新 step あり |
| 全 `uses:` は 40 桁 SHA + タグコメント（MUST）、タグ参照ゼロ | ✓ 全 7 出現箇所 |
| ci.yml push trigger に paths-ignore（MUST）、pull_request 無変更 | ✓ |

## J3: Acceptance criteria（request.md）

| 基準 | 結果 |
|------|------|
| publish.yml に NODE_AUTH_TOKEN / NPM_TOKEN への参照が残っていない | ✓ |
| 全 workflow の `uses:` がコメント付き SHA 参照（タグ参照ゼロ） | ✓ |
| SHA が各タグの実際の commit と一致（検証方法を PR に記載） | ✓ design.md Migration Plan が PR diff に含まれる |
| ci.yml の pull_request trigger が無変更 | ✓ |
| `typecheck && test` が green | ✓ build/typecheck/test/lint 全 passed（318 test files / 3936 tests） |

## J4: Scope

変更ファイルは `.github/workflows/` 3 ファイル + `tests/grep-workflow-actions-pinned.test.ts` のみ。`src/` への変更なし。workflow の job 構造・step 順序（npm 更新 step 追加を除く）に変更なし。スコープ逸脱なし。
