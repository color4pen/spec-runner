# Design: README 整備 + specrunner init の npx 対応改善

## Context

SpecRunner は `@color4pen/specrunner` として GitHub Packages に npm publish される。新規ユーザーのオンボーディングフローは `npm install` → `npx specrunner init` → `npx specrunner login` だが、現状 2 つの問題がある:

1. **README にインストール手順がない**: GitHub Packages からのインストールには `.npmrc` 設定が必要だが、README にその記載がない。Quick Start がいきなり `specrunner init` から始まっている。
2. **init がプロジェクトディレクトリ構造を作らない**: `specrunner init` は user global config (`~/.config/specrunner/config.json`) と `.gitignore` の設定のみ行う。`specrunner/drafts/`、`specrunner/changes/`、`specrunner/specs/` 等のプロジェクトディレクトリは作成されない。`specrunner doctor` の workflow-structure check がこれらの不在を warn するため、init 後すぐに doctor を走らせると警告が出る。

また README の Quick Start に記載されているコマンド例（`specrunner request new` → `specrunner job start` → `specrunner job finish`）は正しいが、`specrunner run` alias の方がシンプルで README 向き。

## Goals / Non-Goals

**Goals**:

- README にインストール手順（`.npmrc` + `npm install`）を追加する
- README の Quick Start を「install → init → login → request new → run → job finish」の流れに整理する
- `specrunner init` がプロジェクトディレクトリ構造（`specrunner/drafts/`、`specrunner/changes/`）を作成するようにする
- `bun run typecheck && bun run test` が green であること

**Non-Goals**:

- 詳細な API ドキュメントやユーザーガイドの作成
- Web サイトの作成
- CONTRIBUTING.md の整備
- init の大きな構造変更（managed runtime setup の統合など）

## Decisions

### D1: README の構成を「Installation → Quick Start → Command Reference → Configuration → Runtime Modes → Troubleshooting」とする

**Rationale**: 新規ユーザーの導線を「まずインストール→次に Quick Start」と自然に誘導するため。現状の README は Quick Start から始まっているが、npm install の手順なしでは `specrunner` コマンドが存在しない。

**Alternatives considered**:
- Installation を Quick Start 内にインラインする → Quick Start が長くなるため分離した方が明確

### D2: init でプロジェクトディレクトリ（`specrunner/drafts/`、`specrunner/changes/`）を作成する

CWD が git repository の場合に限り、`specrunner/drafts/` と `specrunner/changes/` を `mkdir -p` 相当で作成する。CWD が git repo でない場合はスキップ（既存の `.gitignore` 処理と同じガード）。

**Rationale**: doctor の workflow-structure check が `specrunner/drafts/` と `specrunner/changes/` を検証しており、init 後に手動でディレクトリを作る必要があるのは不自然。init の責務として「プロジェクト構造の初期化」を含めるのが妥当。

**Alternatives considered**:
- `specrunner/specs/` も作る → specs は pipeline が自動生成するため不要。doctor も specs/ を検証していない
- `specrunner/drafts/<slug>/` を作る → slug は `request new` で初めて確定するため init 時には不適切
- `.specrunner/config.json`（project local config）も生成する → 空の project config は不要。必要になったときにユーザーが作る

### D3: README の Quick Start では `specrunner run` alias を使う

**Rationale**: `specrunner job start` より `specrunner run` の方が短く、初回体験として覚えやすい。Command Reference に正式なコマンド体系を載せれば十分。

**Alternatives considered**:
- `specrunner job start` を使う → 正式だが冗長で Quick Start 向きではない

### D4: README の環境変数セクションは最小限にする

`SPECRUNNER_API_KEY` のみ記載。managed runtime でのみ必要であること、local runtime では不要であることを明記。`SPECRUNNER_DEBUG` はトラブルシューティングセクションで既に記載されているため重複させない。

**Rationale**: architect 評価「README は簡潔に」に従う。

## Risks / Trade-offs

- [Risk] init がディレクトリを作ると、非 specrunner プロジェクトで `specrunner init` を間違えて実行した場合に `specrunner/` ディレクトリが残る → Mitigation: CWD が git repo の場合のみ作成するため、影響は限定的。`rm -rf specrunner/` で簡単に戻せる
- [Risk] README のコマンド例が将来のコマンド名変更で陳腐化する → Mitigation: 本リクエストのスコープ外。変更時に README を更新すればよい

## Open Questions

- なし
