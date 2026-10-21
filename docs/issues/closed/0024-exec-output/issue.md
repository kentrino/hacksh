---
title: 外部コマンドの表示と端末継承が printer の制御外になる
theme: process-execution
---

# Problem

chezmoi の execa ラッパーは実行内容を console.log または commandPrinter へ書く。これをそのまま導入すると hacksh の出力モードと別経路になる。また、gh run watch や git rebase の端末継承は、JSON 出力に生の出力を混ぜる可能性がある。fzf のように、入力と結果は捕捉しながら端末で対話するコマンドもある。

解決後は実行情報を printer 経由で表示でき、子の出力を取得する操作と、子に端末を渡す操作の契約が明確になる。

# Rules

- 0023 の実行 API を使う。別のプロセス実行機構は作らない。
- hacksh が生成する実行情報は printer を通し、コマンドと引数を構造化して保持する。表示用の文字列を実行に使わない。
- 子の stdout/stderr は既定で捕捉し、自動的に親の stdout/stderr へ流さない。
- 端末の直接継承は明示指定に限る。この子の直接出力は printer を通らない境界として文書化する。
- JSON モードでは端末継承を起動前に拒否する。対話を要求する呼び出しは非対話環境で起動前に失敗する。勝手に捕捉モードへ切り替えない。
- 任意の外部コマンドが /dev/tty などを直接開く動作までは検出・隔離できない。作者が対話の必要性を宣言できるようにする。

# Acceptance Criteria

- 同じ実行内容を pretty と JSON の printer で扱え、JSON に子の生出力が混ざらない。
- stdout を捕捉しつつ stdin/stderr を継承する指定と、全 stdio の継承を扱える。
- 文字列 input と stdin 継承などの矛盾を起動前に拒否する。
- fzf 相当の「文字列入力＋結果捕捉＋対話要求」と、gh run watch 相当の端末継承を fixture で検証する。
- JSON・非対話環境で拒否したケースは子を起動していないことを確認する。
- 実行情報を非表示にでき、引数中の秘匿値を表示しない手段を定義する。

# Decisions

契約の詳細は `designs.md` にある。

- 実行情報は logger のレコードではなく、専用の `ExecPrintEvent`（`type: "exec"`、`phase: "start"`）とする。
- 既定で表示し、`display: false` の呼び出しだけイベントを出さない。イベントは pretty と JSON のどちらも stderr に出す。
- `redact` は表示、結果の `command`、`HackshExecError` の message、spawn 失敗の `error` を置き換える。子の stdout と stderr は置き換えない。
- `stdin`・`stdout`・`stderr` は個別に指定する。`interactive: true` は PTY ではなく、端末で対話するという宣言である。
- JSON での inherit は `json-output`、非対話での `interactive: true` は `non-interactive`、prompt または別の端末使用 exec との重複は `overlapping` として、子を起動する前に拒否する。捕捉モードへは切り替えない。

# Evidence

- 実装: ee7ae8a
- レビュー範囲: 2718da1..15cc4f9。指摘なし。

# Related Files

- `src/printer.ts` — PrintEvent と printer
- `src/logger.ts` — 構造化ログ
- `docs/themes/terminal-output.md`
- `docs/issues/closed/0023-context-exec/issue.md`
