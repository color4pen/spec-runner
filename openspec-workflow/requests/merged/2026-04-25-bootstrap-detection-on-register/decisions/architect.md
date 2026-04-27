# Architect Decisions — 2026-04-25-bootstrap-detection-on-register

## Spec Review (Iteration 1)

`detectBootstrapStatus` を registerRepository 内のプライベートヘルパーとして配置する設計を妥当と判断する :: 現時点で再利用箇所がなく、YAGNI 原則に従う。export 昇格は将来の需要が顕在化してからで十分

既存 `getFileContent` / `getDirectoryContents` の再利用を妥当と判断する :: 新しいラッパーを作る理由がない。404 → null / 空配列 のエラーハンドリング設計が存在チェック用途に合致している

Promise.all による並列化を妥当と判断する :: 2つの独立した API 呼び出しであり、直列化する理由がない。`Promise.allSettled` ではなく `Promise.all` で十分（try-catch で全体をラップする設計のため、個別の成功/失敗を区別する必要がない）

`repository-binding/spec.md` の Explicit registration シナリオとの整合性を確認する :: delta spec は `repository-registration/spec.md` のみを MODIFIED しているが、`repository-binding/spec.md` にも同一シナリオ（"Explicit registration from search UI"）が存在し `bootstrap_status` を `uninitialized` 固定と記述している。delta spec で `repository-binding/spec.md` の更新が漏れている

bootstrap-status-tracking の状態マシンとの整合性を確認する :: `ready` は terminal state。`ready` で INSERT されたレコードは状態マシンの遷移パスに入らないため、既存の遷移マップとの矛盾はない。ただし `ready` で直接 INSERT するパスが状態マシンの定義外であることを明示すべき

design.md の `getDirectoryContents` の使い方に関する記述精度を評価する :: Decision 2 で「path がファイルの場合は非配列を返し空配列になる → 不適」と記載あり。実装コード（github-api.ts L289）を見ると `!Array.isArray(data)` で空配列を返す設計になっており、設計の記述と実装が一致している
