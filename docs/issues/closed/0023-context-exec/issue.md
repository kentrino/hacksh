---
title: run から外部コマンドを共通の API で実行できない
theme: process-execution
---

# Problem

`CommandContext` は logger を提供するが、外部コマンド実行の手段を持たない。chezmoi では独自の execa ラッパーを使い、さらに rebase や create-branch が失敗を例外へ戻すラッパーを重ねている。結果取得、実行失敗、cwd の指定をコマンドごとに組み立てる必要がある。

解決後は context から共通の実行 API を受け取り、実行ファイルと引数配列を渡して stdout・stderr・終了状態を取得できる。通常の失敗は例外で伝わり、失敗を分岐に使う呼び出しは明示的に結果として受け取れる。

# Rules

- 実行本体は context や描画から分離し、呼び出し単位の printer・出力モードとの接続は0024で扱う。
- Node.js 標準モジュールを使用し、暗黙のシェル起動をしない。
- デフォルトで失敗を例外にする。結果として受け取る指定も用意し、起動不能・非ゼロ終了・シグナル終了を区別する。
- 出力の収集量には上限を設ける。中断・タイムアウト・出力上限超過時の子プロセス終了とリスナー解放を定義する。
- 最初の範囲は引数配列、cwd、環境変数、文字列入力、文字列出力、終了結果、中断・タイムアウトとする。端末継承は0024と共通の実行本体を使う。

# Acceptance Criteria

- context の型から実行 API が使え、複数の invocation の設定が混ざらない。
- 空白・引用符・シェルのメタ文字を含む引数がそのまま子へ渡る。
- cwd・環境変数・入力・stdout/stderr の捕捉を検証できる。
- 正常終了、非ゼロ終了、起動不能、シグナル終了を例外と結果の双方で検証できる。
- 大量出力、中断、タイムアウトで待機が終わり、管理対象の子とリスナーを残さない。
- パッケージ利用側から Node.js 最小対応版と Deno で実行・失敗を確認できる。git・gh・個人環境に依存しない fixture を使う。

# Open Decisions

- API 名、結果・例外の最小フィールド、末尾改行の扱い。
- env の継承・上書き・削除、出力上限、終了猶予の具体的な契約。
- context 外で利用する factory の公開範囲と、テスト時の実行本体の差し替え方。

# Related Files

- `src/command.ts` — CommandContext
- `src/run.ts` — invocation と run 呼び出し
- `src/index.ts` — 公開 API
- `scripts/test-packed-consumers.mjs` — Node.js / Deno のパッケージ検証
- `docs/issues/closed/0024-exec-output/issue.md`
- `docs/issues/closed/0025-exec-dry-run/issue.md`
