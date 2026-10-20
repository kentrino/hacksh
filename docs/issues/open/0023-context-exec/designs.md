# Designs

## 推奨: context に exec を渡し、実行本体を分離する

```ts
async run({ exec }) {
  const { stdout } = await exec("git", ["branch", "--show-current"]);
  const result = await exec("git", ["symbolic-ref", "--short", "HEAD"], {
    reject: false,
  });
  if (result.status === "failed") return;
}
```

実行本体は `node:child_process.spawn` を使い、終了とストリームの完了を待つ。stdout/stderr を別々に収集し、起動エラーと終了結果を統一した型で扱う。`reject: false` でも不正なオプションなどのプログラミングエラーは例外にする。中断とタイムアウトでは直接起動した子を終了させる。子孫まで確実に停止できるとは約束しない。

context の exec は invocation の設定を結び付けた関数とする。logger に実行メソッドを追加するよりも、表示と副作用の責務が明確になる。実行本体の独立は単体テストにも使い、汎用的な依存注入フレームワークは導入しない。

既存ラッパーの全 Result フィールドや ExecaError を再現せず、採用する項目だけを公開する。

## 確定した契約

### 公開 API

```ts
interface CommandContext<S> {
  // 既存のフィールドに加える
  exec: Exec;
}

type Exec = <const O extends ExecOptions = {}>(
  file: string,
  args?: readonly string[],
  options?: O,
) => Promise<ExecReturn<O>>;

interface ExecOptions {
  cwd?: string;
  env?: Readonly<Record<string, string | undefined>>;
  input?: string;
  reject?: boolean; // 既定 true
  timeout?: number; // ミリ秒。未指定なら無制限
  signal?: AbortSignal;
  maxBuffer?: number; // ストリームごとのバイト数。既定 100_000_000
  forceKillAfterDelay?: number; // ミリ秒。既定 5_000
}

interface ExecCommand {
  file: string;
  args: readonly string[];
  cwd: string | undefined;
}

interface ExecSuccess {
  status: "succeeded";
  command: ExecCommand;
  stdout: string;
  stderr: string;
  exitCode: 0;
}

type ExecFailure = {
  status: "failed";
  command: ExecCommand;
  stdout: string;
  stderr: string;
} & (
  | { reason: "exit-code"; exitCode: number }
  | { reason: "signal"; signal: string }
  | { reason: "spawn"; error: Error }
  | { reason: "timeout" | "aborted" | "output-limit" }
);

type ExecResult = ExecSuccess | ExecFailure;

// reject が省略または true なら ExecSuccess、false または boolean なら ExecResult
type ExecReturn<O extends ExecOptions>;

class HackshExecError extends Error {
  get result(): ExecFailure;
}
```

公開するのは `Exec`、`ExecOptions`、`ExecCommand`、`ExecSuccess`、`ExecFailure`、`ExecFailureReason`、`ExecResult`、`ExecReturn` の型と `HackshExecError` とする。context 外で使う factory は公開しない。

### 結果の判別

- 結果の判別子は `status` とする。実際に実行して成功した結果は `"succeeded"`、失敗は `"failed"` を持つ。0025 は同じ判別子に `"skipped"` を加え、dryRun を指定しない呼び出しの戻り値型は変えない。
- `ExecReturn` は options の型から戻り値型を決める条件型とする。0025 の dryRun も同じ条件型に条件を加えて表す。オーバーロードの組み合わせは増やさない。
- 失敗は `reason` で区別する。

| reason | 条件 | 固有フィールド |
| --- | --- | --- |
| `spawn` | 子を起動できない。実行ファイルや cwd が存在しない、実行権限がない | `error`（起動時のエラー） |
| `exit-code` | 子が非ゼロで終了した | `exitCode` |
| `signal` | hacksh が終了させていない子がシグナルで終了した | `signal`（例: `"SIGTERM"`） |
| `timeout` | `timeout` を超え、hacksh が子を終了させた | なし |
| `aborted` | `signal` が中断され、hacksh が子を終了させた | なし |
| `output-limit` | stdout か stderr が `maxBuffer` を超え、hacksh が子を終了させた | なし |

- 複数の条件が重なった場合は、hacksh が終了させた理由（最初に起きた `timeout`・`aborted`・`output-limit`）、`spawn`、`signal`、`exit-code` の順に採用する。
- 呼び出し前に中断済みの `signal` を渡した場合は子を起動せず、`aborted` の失敗とする。

### 例外

- `reject` が省略または true の場合、失敗は `HackshExecError` で reject する。`result` で失敗結果を参照できる。
- message はコマンドの表示と理由を含み、子の出力は含めない。表示では空白・引用符・シェルのメタ文字を含む引数を JSON 文字列として引用する。`spawn` の場合は起動時のエラーを `cause` に設定する。
- `result` は列挙されないプロパティとし、エラー要約（pretty・JSON）に子の出力を載せない。エラー要約の kind は既存の `"error"` とする。
- 次のプログラミングエラーは `reject` の指定にかかわらず `TypeError` で reject し、子を起動しない。
  - `file` が空文字列・文字列以外、`args` が文字列の配列以外、`file`・`args`・`cwd`・env の値に NUL を含む。
  - `cwd` が空文字列・文字列以外、`input` が文字列以外、`reject` が boolean 以外。
  - `env` がオブジェクト以外、env の値が文字列・undefined 以外、env のキーが空・`=` か NUL を含む。
  - `timeout`・`maxBuffer` が正の整数以外、`forceKillAfterDelay` が0以上の整数以外、`signal` が AbortSignal 以外。

### 入出力

- 引数配列はシェルを介さず、そのまま子へ渡す。
- `input` を指定した場合は stdin へ書き込んで閉じる。未指定の場合、子の stdin は空（`ignore`）とする。子が入力を読まずに終了したことによる書き込みエラーは無視する。
- stdout と stderr は別々に収集し、UTF-8 として復号する。末尾の改行（`\n` または `\r\n`）を各ストリームから1つだけ取り除く。この扱いは変更できない。
- `maxBuffer` はストリームごとの上限とする。超過した場合、結果の出力は上限までのバイトを復号したものとする。

### 環境変数と cwd

- 子の環境変数の基底は invocation の環境とする。`runCommand`・`runMain` の `env` オプションを指定した場合はその値、未指定の場合は `process.env` を使う。同時に動く invocation の設定は混ざらない。
- `env` オプションは基底に重ねる。文字列の値は設定し、`undefined` の値はその変数を削除する。
- invocation の `env` と `env` オプションのどちらも指定しない場合、hacksh は `process.env` を列挙せず、子は親の環境を継承する。Deno で環境変数の権限を限定していても実行できる。
- `cwd` 未指定時は親の作業ディレクトリを使う。

### 終了と後始末

- `timeout`・中断・出力上限の超過では、直接起動した子へ `SIGTERM` を送る。`forceKillAfterDelay` 後に終了していなければ `SIGKILL` を送る。孫以降の子孫は停止の対象外とする。
- 通常は子の終了と stdout/stderr の完了を待つ。hacksh が子を終了させた場合は、子の終了後に stdout/stderr のパイプを破棄して待機を終える。子孫がパイプを保持していても待ち続けない。
- 結果を返す時点で、タイマーと `signal` のリスナーを解放する。

### テストでの差し替え

- 実行本体は context から独立したモジュールとし、hacksh の単体テストは実行本体を直接呼ぶ。
- コマンド作者は `Exec` 型を満たす関数を context に入れて `run` を呼ぶことで、外部コマンドを差し替えられる。`runCommand` に差し替え用のオプションは追加しない。
