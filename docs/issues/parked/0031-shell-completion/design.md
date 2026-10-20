# シェル補完の設計

## 構成

hacksh はすべてのCLIに次のサブコマンドを用意する。

- `completion install` は、利用者のシェル向けの補完ファイルをCLIごとに1つ配置する。
- `completion <shell>` は、補完ファイルの内容を標準出力へ書く。Homebrew の `generate_completions_from_executable` のようなパッケージマネージャからの配布や、手動での配置に使う。
- `__complete` は、入力途中の引数列を受け取り、候補を返す。hidden とし、補完ファイルからだけ呼ぶ。

補完ファイルには候補を埋め込まない。TAB のたびにCLI自身の `__complete` を呼ぶ薄いスクリプトにする。候補が常に現在の定義と一致し、CLIを更新しても補完ファイルを置き直す必要がない。代わりに、補完ごとにCLIが起動する。

## 配置先

補完ファイルはCLIごとに分け、hacksh共通のディレクトリに置く。

| シェル | 配置先 | 利用者の設定 |
|---|---|---|
| zsh | `${XDG_DATA_HOME:-~/.local/share}/hacksh/completions/zsh/_<cli>` | 最初の1回だけ `fpath` への追加と `compinit` |
| bash | `${XDG_DATA_HOME:-~/.local/share}/hacksh/completions/bash/<cli>` | 最初の1回だけディレクトリ内を読み込む設定 |
| fish | `${XDG_CONFIG_HOME:-~/.config}/fish/completions/<cli>.fish` | 不要 |

zsh で利用者が一度だけ追加する設定は次のとおり。

```zsh
fpath+=~/.local/share/hacksh/completions/zsh
autoload -Uz compinit && compinit
```

`compinit` を既に呼んでいる環境では2行目は不要。fish は標準の補完ディレクトリを設定なしで読み込むため、共通ディレクトリを使わない。

`completion install` はシェル設定ファイルを変更しない。共通ディレクトリがシェル設定に入っていない場合は、追加すべき設定を表示する。

## 採らなかった案

- 補完ファイルへの候補の埋め込みは、CLIの更新や定義の変更のたびに置き直しが必要になる。
- hacksh共通の補完ファイル1本で全CLIを扱う案は、CLIの追加や削除のたびに共通ファイルを書き換える必要がある。後から入れたCLIの hacksh バージョンでファイルが上書きされ、別のCLIの補完を壊しうる。
- 通常の実行時に補完を自動登録する案は、実行のたびに利用者のホームディレクトリへ書き込む。
- `.zshrc` で `eval "$(<cli> completion zsh)"` する案は、シェルの起動ごとにCLIが起動する。
- zsh で `fpath` 上の書き込み可能なディレクトリを探して置く案は、プラグインマネージャの管理するディレクトリに書き込むおそれがあり、配置先も予測しにくい。

## 他のツールの例

zsh にはユーザー用の標準の補完ディレクトリがなく、主要なツールは配置先と設定を利用者に案内している。

- rustup と Poetry は `~/.zfunc` に置き、`fpath+=~/.zfunc` を案内する。
- Deno は `~/.zsh` に置き、`fpath` への追加と `compinit` を案内する。
- Cobra の生成するヘルプと GitHub CLI は、`site-functions` に置く方法を案内する。
- uv は `.zshrc` での `eval` を案内する。
