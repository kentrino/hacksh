# Designs

## 推奨: 捕捉を既定にし、端末使用は明示する

```ts
// API 候補: 取得した JSON は作者が解析する。
const { stdout } = await exec("orca", ["terminal", "list", "--json"]);

// 端末での対話が必要であることを宣言する。
const selection = await exec("fzf", [], {
  input: table,
  interactive: true,
});

await exec("gh", ["run", "watch", id], {
  stdio: "inherit",
  interactive: true,
});
```

`interactive` は PTY を作る指定ではなく、既存の出力モードと端末条件を確認するための宣言とする。fzf の結果を返す stdout と、fzf が対話に使用する端末は別である。stdout が pipe だから非対話と判断してはいけない。

まず実行開始情報を既存 logger の構造化データで表せるか確認し、専用イベントが必要ならその理由を記録する。実行情報にはファイル名・引数配列・cwd などを持たせる。非表示・秘匿の指定は実行する値を変えない。

子の出力を逐次 printer に流す機能は初期必須範囲に含めない。capture と inherit の契約を先に確定する。子に端末を渡す間は hacksh の prompt と競合させない。

## 確定した契約

### 実行情報の表示イベント

実行情報は logger の `LogRecord` ではなく、専用の `PrintEvent` とする。

```ts
interface ExecPrintEvent {
  type: "exec";
  phase: "start"; // 0025 が "skip" を加える
  command: { file: string; args: readonly string[]; cwd?: string }; // 秘匿値を置き換えた値。cwd 未指定ならキーを持たない
  stdio: {
    stdin: "ignore" | "input" | "inherit";
    stdout: "pipe" | "inherit";
    stderr: "pipe" | "inherit";
  };
  interactive: boolean;
}
```

専用イベントにする理由は次のとおり。

- `LogRecord` の `properties` は任意のオブジェクトで、JSON の利用側は category や property 名から実行情報を推測する必要がある。専用イベントなら `type` で判別でき、型も固定できる。
- logger には表示レベルの絞り込みがなく、非表示の指定は結局 exec 側に必要になる。
- 0025 の実行予定と実際の実行を、同じイベントの `phase` で区別できる。
- 作者が `logger.info` でコマンドを自作表示すると秘匿指定を通らない。表示を exec に一本化する。

表示の規則は次のとおり。

- 既定で表示する。`display: false` を指定した呼び出しはイベントを出さない。
- イベントは pretty・JSON とも stderr に出す。捕捉した子の出力を作者が stdout へ書くことが多く、実行のトレースを結果のデータと混ぜないため（`set -x` と同じ扱い）。
- pretty では `$` の印に続けてコマンドを1行で表示し、`cwd` があれば継続行に表示する。引数の引用は `HackshExecError` のメッセージと同じ規則（空白・引用符・シェルのメタ文字を含む引数を JSON 文字列にする）とする。JSON では1行1イベントで出す。
- `env` と `input` の内容は表示しない。
- イベントは子を起動する直前に出し、printer への出力を待ってから起動する。端末を継承する子の出力より前に表示が並ぶ。printer の失敗は logger と同じく保持して invocation の終了時に報告し、子の起動は止めない。
- 起動前に拒否した呼び出しはイベントを出さない。起動を試みて `spawn` で失敗した呼び出しはイベントを出す。

### 秘匿値

`redact: readonly string[]` に秘匿する値を指定する。値は file・args・cwd の中で部分文字列として `***` に置き換わる（`--token=abc` の `abc` も対象）。長い値から順に置き換える。実行する値は変えない。

| 対象                                            | 置き換え                                         |
| ----------------------------------------------- | ------------------------------------------------ |
| 表示イベントの `command`                        | する                                             |
| 結果の `command`（成功・失敗、0025 の省略結果） | する                                             |
| `HackshExecError` の message                    | する                                             |
| `spawn` 失敗の `error`（`cause` にもなる）      | する（message・stack・path・spawnargs・syscall） |
| 子の `stdout`・`stderr`                         | しない。作者のデータとして返す                   |
| `env`・`input`                                  | 表示しないため対象外                             |

`spawn` 失敗の `error` は列挙可能な `spawnargs`・`path`・`syscall`（`spawn <file>`）を持ち、エラー要約の `cause` に載る。`redact` を指定した場合は、message・stack・path・spawnargs・syscall を置き換えた新しい `Error` を `error` とし、`code`・`errno` を引き継ぐ。`redact` が空なら 0023 と同じく元のエラーを使う。

`redact` が配列以外、要素が空文字列・文字列以外・NUL を含む場合は `TypeError` とする。

### stdio と対話の宣言

```ts
interface ExecOptions {
  // 0023 のオプションに加える
  stdin?: "pipe" | "inherit"; // 既定 "pipe"。input があれば書き込み、なければ空
  stdout?: "pipe" | "inherit"; // 既定 "pipe"
  stderr?: "pipe" | "inherit"; // 既定 "pipe"
  interactive?: boolean; // 既定 false
  display?: boolean; // 既定 true
  redact?: readonly string[];
}

// fzf 相当: 文字列入力、結果は捕捉、端末で対話する
const { stdout } = await exec("fzf", [], { input: table, interactive: true });

// gh run watch 相当: 全 stdio を継承する
await exec("gh", ["run", "watch", id], {
  stdin: "inherit",
  stdout: "inherit",
  stderr: "inherit",
});
```

- stdio はストリームごとのキーで指定する。`stdio` の一括指定や配列指定は設けない。順序で意味が変わる配列や、継承と対話を結び付けたプリセットより、指定の組み合わせが明確になる。
- `"inherit"` のストリームは親プロセスのファイル記述子 0・1・2 をそのまま子に渡す。この出力は printer を通らず、`runCommand`・`runMain` に渡した `stdout`・`stderr` の writer も通らない。
- 継承したストリームは捕捉しない。結果の `stdout`・`stderr` は空文字列とし、`maxBuffer` と `output-limit` は捕捉するストリームだけに適用する。結果型は 0023 から変えない。
- `input` と `stdin: "inherit"` の同時指定は矛盾として `TypeError` にする。options のリテラルでは型エラーにする。
- `interactive: true` は PTY を作る指定ではなく、子が端末で対話することの宣言とする。判定には invocation の出力モードの `interactive`（pretty・CI でない・stdin と stdout が TTY）を使う。子の stdout が pipe であることは判定に使わない。子が `/dev/tty` を直接開くことは検出しないため、作者が宣言する。

### 起動前の拒否

検査は次の順に行い、最初に該当したもので終える。いずれも子を起動せず、表示イベントも出さない。

1. 引数・オプションの検査。違反は `reject` にかかわらず `TypeError`（0023 と同じ）。
2. 中断済みの `signal`。`aborted`（0023 と同じ）。
3. JSON モードで `"inherit"` のストリームがある。`json-output`。
4. `interactive: true` で出力モードが非対話。`non-interactive`。
5. 端末を使う呼び出しが、端末を使用中の prompt または別の exec と重なる。`overlapping`。

3〜5 は失敗結果とし、`reject` に従う。同じコードが端末では成功するため、プログラミングエラーではなく環境による失敗として扱う。`reject: false` の作者は理由で分岐できるが、hacksh が別の動作へ切り替えることはしない。`stdout`・`stderr` は空文字列とする。

| reason            | 条件                                         | message                                                      |
| ----------------- | -------------------------------------------- | ------------------------------------------------------------ |
| `json-output`     | JSON モードで stdio のいずれかが `"inherit"` | `Command cannot use the terminal in JSON output mode: <cmd>` |
| `non-interactive` | `interactive: true` で出力モードが非対話     | `Command requires an interactive terminal: <cmd>`            |
| `overlapping`     | 端末を使う prompt または exec が実行中       | `Command cannot use the terminal while it is in use: <cmd>`  |

失敗理由の優先順位は、これら起動前の理由を 0023 の順位より先に置く。

### prompt との同時使用

- `interactive: true` か、いずれかのストリームが `"inherit"` の呼び出しを「端末を使う呼び出し」とする。
- invocation ごとに端末の使用権を一つ持ち、hacksh の prompt と端末を使う exec が共有する。使用中に端末を使う exec を呼ぶと `overlapping` で失敗する。端末を使う exec の実行中に prompt を呼ぶと `HackshPromptError`（`overlapping`）で失敗する。待ち合わせはしない。
- 捕捉だけの exec は使用権を取らず、prompt と並行できる。表示イベントは pretty の prompt 再描画の規則に従う。
- 使用権は結果を返す時点で解放する。prompt は終了時に raw モードと stdin の流れを戻すため、子は通常モードの端末を受け取る。
- Ctrl-C などのシグナルは端末のフォアグラウンドのプロセスグループ全体に届く。hacksh は子へのシグナル転送やジョブ管理をしない。

### 0025 との接続

dry-run は同じ検査の 1 を行い、同じ `ExecPrintEvent` を `phase: "skip"` で出し、置き換え済みの `command` を持つ省略結果を返す。2〜5 を省略時に行うか、`display: false` が省略の表示も隠すかは 0025 で決める。イベントの形はこれらに依存しない。
