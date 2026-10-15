---
title: 外部コマンドの実行を run のコンテキストに統合する
---

# Goal

コマンドの作者が `run` から外部コマンドを実行し、結果の取得、失敗の判定、実行内容の表示、dry-run を共通の API で扱える状態にする。chezmoi の既存スクリプトで使う execa の機能を基準に、hacksh の printer と出力モードに統合する。

# Scope

- プロセス実行と context への提供（0023）。
- 実行情報・子プロセス出力と printer、端末の扱い（0024）。
- 呼び出し単位の dry-run と省略結果（0025）。

# Rules

- 依存は `zod`（peer）以外に増やさない。実行本体には Node.js 標準モジュールを使う。
- 実行ファイルと引数配列を分け、暗黙にシェルを介さない。
- hacksh が表示する実行情報は既存の printer を通す。子プロセスに端末を直接渡す場合の境界を明示する。
- JSON 出力に子プロセスの生出力を混在させない。対話が必要な操作を非対話環境で暗黙に別の動作へ切り替えない。
- dry-run は外部コマンドの呼び出しごとに指定する。状態取得と変更操作の区別は作者が行う。
- 必要な機能と挙動を取り込む。execa 全体との互換性を約束しない。

# Criteria

- `rebase` 相当の処理で、状態取得、失敗時の分岐、変更操作の dry-run を書ける。
- `git-worktree` 相当の処理で、`cwd` と実行内容の表示を指定できる。
- `gh-watch` 相当の処理で、文字列入力から選択結果を取得する操作と、外部コマンドに端末を渡す操作を区別できる。
- 失敗・実行省略・実際の成功を型と結果から区別できる。
- 対応する Node.js 最小バージョンと Deno の既存パッケージ検証で、外部コマンド実行を確認できる。

# Non-goals

- execa の全 API、テンプレートタグ、シェル構文、プロセス間パイプ連結、IPC、任意のストリーム変換の再現。
- PTY エミュレーション、ジョブ管理、プロセスツリー全体の管理。
- chezmoi のスクリプトの変更・移行、公開・リリース。
- 自動的な変更操作の推定、コマンド全体の副作用を防ぐ dry-run。

# References

実例は `~/.local/share/chezmoi/dot_local/bin/` の以下を参照する。実装・テストはこの個人環境や外部サービスに依存させず、同じ振る舞いをローカルの子プロセスで再現する。

- `lib/execa.ts`: コマンド表示、dry-run、失敗を結果に戻すラッパー。
- `executable_rebase`、`executable_create-branch`: 結果取得、失敗時の分岐、再throw、変更操作だけの省略。
- `executable_git-worktree`: cwd と commandPrinter の指定。
- `executable_gh-watch`: fzf への文字列入力と結果取得、gh run watch の端末継承。
- https://github.com/sindresorhus/execa — 機能と挙動の参考。
