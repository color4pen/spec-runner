# Design: release-please による自動バージョニング + publish 連携

## Context

現在の publish フローは手動: `npm version` → `git push --tags` → publish.yml（`v*` tag push トリガー）。
request をマージするたびにバージョニングを忘れるリスクがある。

release-please（Google 製 GitHub Action）を導入し、main push → conventional commits 解析 → version bump PR 自動生成 → PR マージで tag 作成 → 既存 publish.yml が起動、という自動パイプラインを構築する。

### 現状の squash merge と PR title

- `specrunner finish` は GitHub REST API で squash merge を実行する（`src/core/finish/orchestrator.ts`）
- GitHub の squash merge は **PR title** をデフォルトの commit message として使用する
- PR title は `renderPrTitle()` が `parsedRequest.title`（request.md の H1 見出し）をそのまま返す
- 現在 conventional commits prefix は付与されていない

### TYPE_CONFIG との対応

`src/config/type-config.ts` に request type → branch prefix のマッピングが存在する:
- `new-feature` → `feat/`, `spec-change` → `change/`, `refactoring` → `refactor/`, `bug-fix` → `fix/`, `chore` → `chore/`

branch prefix と conventional commits prefix は近いが一致しない（`change/` vs `feat:`）ため、別途マッピングが必要。

## Goals / Non-Goals

**Goals**:

- release-please workflow を追加し、main push で自動 version bump PR が生成される
- release-please の tag 作成が既存 publish.yml を起動する連鎖を実現する
- PR title に conventional commits prefix を付与し、squash merge 時に release-please が認識できるようにする
- package.json version を `0.1.0` にリセットする

**Non-Goals**:

- publish.yml の変更（現状の `v*` tag push トリガーを維持）
- changesets 等の代替ツール検討
- CHANGELOG の過去分生成
- major version 自動判定（0.x の間は release-please デフォルト）

## Decisions

### D1: release-please-action@v4 を manifest mode なしで使用する

**Rationale**: 単一パッケージ（monorepo ではない）のため、manifest mode (`.release-please-manifest.json` + `release-please-config.json`) は不要。action の `release-type: node` 指定だけで package.json の version 更新 + tag 作成が動作する。

**Alternatives**: manifest mode を使う → 単一パッケージでは過剰設定。

### D2: conventional commits prefix を TYPE_CONFIG に追加する

**Rationale**: `type-config.ts` は request type の single source of truth。branch prefix の隣に `conventionalPrefix` を追加し、`renderPrTitle()` がこれを参照して PR title に prefix を付ける。

マッピング:
| request type | conventionalPrefix |
|---|---|
| `new-feature` | `feat` |
| `bug-fix` | `fix` |
| `spec-change` | `feat` |
| `refactoring` | `refactor` |
| `chore` | `chore` |

**Alternatives**:
- `renderPrTitle()` 内にハードコードする → type-config の一元管理の原則に反する
- branch prefix から推論する → `change/` → `feat:` の変換が暗黙的で壊れやすい

### D3: PR title format は `<prefix>: <title>` とする

**Rationale**: GitHub の squash merge デフォルトは「PR title (#PR番号)」。conventional commits の `feat: タイトル (#123)` 形式になり、release-please が正しく解析する。

`renderPrTitle()` の戻り値を `feat: release-please による自動バージョニング` のように変更する。

### D4: package.json version を 0.1.0 にリセットし、release-please の初回動作に備える

**Rationale**: 要件により `0.2.0` → `0.1.0` にリセット。release-please は package.json の current version を読み取って次の version を計算する。`0.1.0` から開始すれば、最初の `feat:` commit で `0.2.0` に bump される。

### D5: release-please workflow の token は `GITHUB_TOKEN` を使用する

**Rationale**: `google-github-actions/release-please-action@v4` は `GITHUB_TOKEN` で動作する。Personal Access Token は不要。`permissions: contents: write, pull-requests: write` を明示して最小権限を確保する。

## Risks / Trade-offs

[Risk] release-please が作成する tag (`v0.2.0` 等) が publish.yml のトリガーと一致しない可能性
→ **Mitigation**: release-please は `v` prefix 付きの tag を作成するのがデフォルト動作。publish.yml の `v*` パターンに一致する。初回導入後に実際の tag 形式を確認する。

[Risk] 既存の手動 tag (`v0.1.0`, `v0.2.0`) が release-please の初回解析に影響する可能性
→ **Mitigation**: release-please は直近の Release (GitHub Release) を基準にする。Release が存在しない場合、package.json の version から開始する。既存 tag が Release に紐付いていなければ問題なし。

[Risk] squash merge の commit_title がリポジトリ設定で PR title 以外に設定されている可能性
→ **Mitigation**: GitHub リポジトリ設定の "Default commit message" で "Pull request title" が選択されていることを確認する（手動確認事項として受け入れ基準に含める）。

## Open Questions

なし（architect 評価済みの設計判断により主要な選択は確定）。
