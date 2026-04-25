# Spec-Fixer Decisions — iteration 1

database/spec.md の delta spec を新規作成する :: requests.enabled と sessions.role CHECK 制約の変更を正の定義として記述する必要がある。既存 database/spec.md のシナリオ記述パターンに合わせる

slug 導出を deterministic derivation（DB カラム追加なし）方式で確定する :: slug は createdAt + title から純粋に算出可能であり、DB にカラムを追加する必要がない。session-completion-handler も同じ関数を呼べばよい。ただし Open Questions の回答を spec に昇格させる形で記述する

propose-actions.ts を 'use server' と明記する :: review-lessons の「モジュールの 'use server' 宣言はセキュリティ設計の一部」に従い、propose-actions.ts は認証コンテキストが必要な Server Action モジュールであることを spec に記述する

createRequest() をオブジェクト引数に変更する :: 既存の 4 引数 positional は fragile。options object にすることで将来の引数追加が安全になる。既存呼び出し元は workspace-client.tsx のフォーム送信のみ（bootstrap は直接 DB insert）なので影響は限定的

change-folder-viewer に path traversal 防止のシナリオを追加する :: getChangeFolderFileContent の filePath 引数に対する validation を spec に明記する。セキュリティレビュアーが skipped のため、spec-fixer 側で補完する
