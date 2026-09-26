# トラブルシューティング

このドキュメントでは、Markdown Mermaid PDF の使用時によくある問題とその解決方法を説明します。

## 日本語フォントが表示されない

コンテナ内でフォントを確認：

```bash
docker run --rm --entrypoint fc-list markdown-mermaid-pdf:latest | grep -i "noto sans cjk jp"
```

フォントが見つからない場合は、イメージを再ビルドしてください：

```bash
make rebuild
```

## Mermaid 図表が生成されない

Puppeteer のログを確認：

```bash
docker run --rm \
  -e PUPPETEER_DISABLE_HEADLESS_WARNING=false \
  -v $(pwd)/workspace:/workspace \
  markdown-mermaid-pdf:latest \
  document.md output.pdf
```

### よくある原因

1. **Chromium の起動に失敗している**
   - このイメージは既定で Puppeteer/Chromium に `--no-sandbox --disable-setuid-sandbox` を渡します
   - ワークスペース内の `.puppeteer.json` や `.mermaid-config.json` を自前で置いている場合は、その設定で上書きしていないか確認
   - Docker が十分なメモリを確保しているか確認（推奨: 2GB以上）

2. **Mermaid 構文エラー**
   - Markdown ファイル内の Mermaid コードブロックの構文を確認
   - [Mermaid Live Editor](https://mermaid.live/) で構文を検証

3. **ネットワークタイムアウト**
   - Puppeteer がタイムアウトしている場合、`.puppeteer.json` の設定を調整

4. **信頼できない入力を処理している**
   - このコンテナは Chromium を `--no-sandbox` 付きで起動します
   - 外部から受け取った未検証の Markdown / Mermaid をそのまま処理しないでください

## PDF が生成されない

詳細ログを有効化：

```bash
docker run --rm \
  -v $(pwd)/workspace:/workspace \
  markdown-mermaid-pdf:latest \
  document.md output.pdf 2>&1 | tee conversion.log
```

### よくある原因

1. **LaTeX コンパイルエラー**
   - ログファイル内で `! LaTeX Error` を検索
   - 特殊文字やエスケープが必要な文字を確認

2. **ファイルパスの問題**
   - 入力ファイルが `/workspace` ディレクトリ内にあるか確認
   - ファイル名にスペースや特殊文字が含まれていないか確認

3. **メモリ不足**
   - Docker のメモリ制限を確認・増加
   - 大きな画像や複雑な図表がある場合は特に注意

## formal スタイルで変換が中止される

`--style formal` は、スキーマ検証に通らない文書の変換を意図的に中止します（非 0 終了）。
エラーメッセージに違反内容がまとめて列挙されます：

```
[formal] スキーマ検証エラー:
- 必須メタデータ 'doc-number' がありません
- 見出し「検証の自動化」(3階層目) : 直前の見出し(1階層目)から階層が飛んでいます
```

### よくある原因

1. **必須フロントマターの欠落**
   - `doc-number` / `title` / `date` / `organization` / `revision-history` は必須です
2. **日付形式の誤り**
   - `date` と `revision-history[].date` は `YYYY-MM-DD` 形式で指定します（例: `2026-07-15`）
3. **見出し階層の違反**
   - `#`(章) → `##`(節) → `###`(項) → `####`(細目) を飛ばさずに使います
   - 最初の見出し（章）より前に本文を書くことはできません

スキーマの正典は [docs/formal-mode.md](docs/formal-mode.md) を参照してください。

### formal スタイルで表の列幅を調整したい

パイプ表は区切り行のハイフンの比率が列幅になります（表のいずれかの行が約72文字を
超える場合に有効）。列からはみ出す場合は、対象列のハイフンを増やしてください。

### 見本の公開文書と細部が異なる

formal スタイルは公開文書の構成・書式・トーンの再現を目的としており、Word 原本との
ピクセル単位の一致は目標にしていません（docs/formal-mode.md の「再現の方針と制限事項」参照）。

## コンテナが起動しない

Docker のバージョンを確認：

```bash
docker --version
docker compose version
```

必要なバージョン：

- Docker 20.10 以上
- Docker Compose v2 以上

## パフォーマンスが遅い

### 変換速度の改善

1. **Docker のリソース割り当てを増やす**
   - Docker Desktop の設定で CPU とメモリを増やす

2. **ボリュームマウントの最適化**
   - 必要最小限のファイルのみ `workspace/` に配置
   - 大きな不要ファイルを削除

3. **Mermaid 図表の数を確認**
   - 各図表は Chromium を起動するため時間がかかる
   - 必要に応じて図表を外部画像として保存し埋め込む

## CI の lint (Hadolint / Dockle) が失敗する

`build-main.yml` の `lint` ジョブは Dockerfile(Hadolint)とビルド済みイメージ
(Dockle、CIS ベースのチェック)を検査し、失敗すると GHCR への publish を止めます。

- ローカルでの再現は `make lint`(Dockerfile のみなら `make lint-dockerfile`、
  イメージのみなら `make lint-image`)。CI と同じピン済みツールで同じ引数を実行します。
- ツールのバージョン(digest ピン)と許容リストは `Makefile` に、
  Hadolint のルール除外は `.hadolint.yaml` に理由コメント付きでまとめています。
- 意図的に許容しているチェック:
  - `DL3008`: apt パッケージは非ピン方針(CVE は週次 Trivy が担当)
  - `CIS-DI-0001`: root 実行は bind-mount 出力の所有権を考慮した仕様
  - `DKL-DI-0006`: `latest` タグは「安定版のみ」のタグポリシー
  - `-ae mdf`: texlive mdframed の `*.mdf` を資格情報と誤検知するため
- 新しい指摘が出た場合は、まず Dockerfile / イメージ側の修正を検討し、
  仕様として受け入れる場合のみ理由コメント付きで許容リストへ追加してください。

## GitHub Actions の arm64 CI が遅い

Mermaid 描画（Chromium）は CPU とメモリを使うため、build や smoke test に時間がかかることがあります。

- `main` / release CI は `ubuntu-24.04-arm` の native runner で `linux/arm64` を検証します
- runner が混み合うと待機時間も加わります
- `linux/amd64` と `linux/arm64` は別 job なので、どちらが遅いかを run ごとに切り分けられます

## 権限エラー

コンテナがルートユーザーとして実行されるため、生成されたファイルの所有権が変更される場合があります：

```bash
# 所有権を変更
sudo chown -R $USER:$USER workspace/

# または、コンテナ実行時にユーザーを指定
docker run --rm --user $(id -u):$(id -g) \
  -v $(pwd)/workspace:/workspace \
  markdown-mermaid-pdf:latest \
  document.md output.pdf
```

Docker Compose を使う場合も同様に `--user` を付けられます：

```bash
docker compose run --rm \
  --user $(id -u):$(id -g) \
  markdown-mermaid-pdf \
  document.md output.pdf
```

## さらなるサポート

上記で解決しない場合：

1. [GitHub Issues](https://github.com/hwatanabe-jp/markdown-mermaid-pdf/issues) で既存の問題を検索
2. 新しい Issue を作成（以下の情報を含める）：
   - エラーメッセージ全文
   - 使用している OS とアーキテクチャ
   - Docker バージョン
   - 再現手順

## 文書一式の生成で失敗する・リンクで移動できない

`--set documents.json [出力ディレクトリ]` は、全件の検証と変換に成功した場合だけ
出力ディレクトリを確定します。`[document-set]` の後に表示される文書と理由を確認してください。

- `output directory already exists`: 成果物の上書きを防ぐため停止しています。
  別の出力先を指定するか、以前の成果物を移動してから再実行してください。
- `duplicate` / `ambiguous heading`: 文書 ID・番号・入力・出力名、明示的な見出し ID の
  重複を確認してください。出力名は大文字小文字と Unicode 正規化も考慮します。
- `unknown document` / `unknown heading`: `doc:ID#見出しID` の ID と設定・Markdown を照合してください。
- 画像が見つからない: 画像パスは元の Markdown のディレクトリを基準に指定してください。
  Mermaid の設定は従来どおりコマンドの実行ディレクトリにあるものを使用します。
- PDF のリンクで別文書を開けない: 一式を同じディレクトリに置き、生成後に PDF を改名していないか
  確認してください。ブラウザ・メールのプレビューではなく、ローカルの PDF 間移動に対応する
  デスクトップビューアで開いてください。閲覧ソフトによる制限時や印刷物では、表示された
  文書番号・タイトル・見出し情報から参照先を特定できます。

通常の変換失敗では一時ディレクトリを削除します。プロセスの強制終了や電源断では、
出力先の親に `.document-set-*` が残ることがあります。稼働中の変換がないことを確認してから
残った一時ディレクトリを削除できます。詳細は [formal モード](docs/formal-mode.md#文書一式の生成) を参照してください。
