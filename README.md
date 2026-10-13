# Markdown Mermaid PDF

Markdown を PDF に変換する Docker コンテナです。Pandoc と XeLaTeX を使い、日本語と Mermaid 図表に対応しています。

## 機能

- Markdown から PDF への変換（Pandoc + XeLaTeX）
- Mermaid 図表のサポート（mermaid-filter + Puppeteer + Chromium）
- 日本語フォント対応（Noto Sans CJK JP / Noto Serif CJK JP）
- カスタマイズ可能な PDF 設定
- デジタル庁の標準ガイドライン群風の体裁で文書を生成する formal スタイル（`--style formal`）

## 必要な環境

- Docker 20.10 以上
- Docker Compose v2 以上（オプション）

## クイックスタート

リポジトリのルートディレクトリで実行します。サンプルの出力先は `workspace/example.pdf` です。

```bash
# イメージをビルド
make build

# サンプル PDF を生成
make example

# 詳細なコマンドを確認
make help
```

## 使用方法

### Makefile を使用（推奨）

変換する Markdown を `workspace/` に置き、入力名と出力名を指定します。

```bash
make convert INPUT=document.md OUTPUT=output.pdf
```

出力名を省略すると、入力ファイルの拡張子を `.pdf` に変えて保存します。
コマンドの一覧は `make help` または [Makefile コマンド一覧](#makefile-コマンド一覧) で確認できます。

### Docker を直接使用

次の例では、`workspace/document.md` を読み込み、`workspace/output.pdf` に出力します。

```bash
# 公開済みの安定版を取得
docker pull ghcr.io/hwatanabe-jp/markdown-mermaid-pdf:latest

# PDF を生成
docker run --rm \
  -v "$(pwd)/workspace:/workspace" \
  ghcr.io/hwatanabe-jp/markdown-mermaid-pdf:latest \
  document.md output.pdf

# コンテナ内でシェルを起動
docker run --rm -it \
  -v "$(pwd)/workspace:/workspace" \
  --entrypoint /bin/bash \
  ghcr.io/hwatanabe-jp/markdown-mermaid-pdf:latest
```

`ghcr.io/hwatanabe-jp/markdown-mermaid-pdf:main` を使うと、`main` ブランチの検証済みビルドも取得できます。

### Docker Compose を使用（ローカルビルド前提）

`docker-compose.yml` はローカルの `markdown-mermaid-pdf:latest` を使います。
先に `make build` または `docker compose build` を実行してください。

```bash
# ローカル用イメージをビルド
docker compose build

# Docker Compose を使用
docker compose run --rm markdown-mermaid-pdf document.md output.pdf

# Docker Compose でシェルを起動
docker compose run --rm markdown-mermaid-pdf-shell
```

### イメージとタグの選び方

| イメージ | 用途 |
|----------|------|
| `ghcr.io/hwatanabe-jp/markdown-mermaid-pdf:latest` | 公開済みの安定版リリース専用 |
| `ghcr.io/hwatanabe-jp/markdown-mermaid-pdf:main` | `main` ブランチの検証済みビルド |
| `markdown-mermaid-pdf:latest` | `make build` / `docker compose build` で作成するローカル用イメージ |

公開イメージの検証内容は [イメージの公開と検証](#イメージの公開と検証) を参照してください。

## Makefile コマンド一覧

| コマンド                    | 説明                                  |
| --------------------------- | ------------------------------------- |
| `make build`                | Docker イメージをビルド               |
| `make rebuild`              | キャッシュなしで再ビルド              |
| `make run`                  | Docker Compose 経由でシェルを起動     |
| `make example`              | example.md から PDF を生成            |
| `make example-set`         | マスタ・詳細文書の一式を個別 PDF として生成 |
| `make example-formal`       | formal-example.md から formal スタイルの PDF を生成 |
| `make test`                 | PDF が正常に生成されるかテスト        |
| `make test-unit`            | Docker 不要の軽量テスト（Node.js が必要） |
| `make convert INPUT=<file>` | 指定したファイルを変換                |
| `make shell`                | コンテナ内で bash シェルを起動        |
| `make clean`                | 生成された PDF をクリーンアップ       |
| `make clean-all`            | PDF と Docker イメージを削除          |
| `make info`                 | Docker イメージとツールバージョン表示 |
| `make license-check`        | ライセンスコンプライアンスを検証      |
| `make help`                 | ヘルプメッセージを表示                |

`make test-unit` は参照解決・設定選択・Makefile の回帰テストを実行します。
Pandoc がインストールされていれば formal の検証・図表整形・番号整合性も検査し、なければその検査だけを
スキップします。`PANDOC_BIN` で Pandoc の実行ファイルを指定できます。PDF 生成は `make test` で検証します。

空白を含むパスは、例えば `make convert INPUT='資料/設計 書.md' OUTPUT='設計 書.pdf'` のように指定できます。
`make clean` は workspace 直下の PDF・ログと、サンプル一式の `workspace/formal-set/dist/` を削除します。

## formal スタイル

`--style formal` を付けると、デジタル庁の標準ガイドライン群風の体裁を持つ PDF を生成できます。
表紙（文書番号・和暦併記の日付・概要の枠囲み）、改定履歴、点線リーダー付き目次、
水色帯の章見出し、章別の図表番号（図 2-1／表 1-1）などを自動で生成します。

```bash
docker run --rm \
  -v "$(pwd)/workspace:/workspace" \
  ghcr.io/hwatanabe-jp/markdown-mermaid-pdf:latest \
  document.md output.pdf --style formal
```

文書は formal スキーマに従い、必須のフロントマターと見出し規則を満たす必要があります。
規則に適合しない場合は変換を中止し、違反内容をエラーメッセージに列挙します。

YAML フロントマターの `figure-caption-position`・`table-caption-position` に
`top`／`bottom` を指定すると、図・表のキャプション位置を選べます（既定は両方 `top`）。
`table-column-widths: auto` で表の列幅を内容に応じて調整でき、表ごとに
`column-widths="20,30,50"` のような比率指定もできます。未指定時は従来の列幅を維持します。
記法と優先順位は [キャプション位置と表の列幅](docs/formal-mode.md#キャプション位置と表の列幅) を参照してください。

- スキーマの定義と記入例: [formal モードの仕様](docs/formal-mode.md)
- サンプル文書: [workspace/formal-example.md](workspace/formal-example.md)（`make example-formal` で変換）

### マスタ文書・詳細文書の一括生成

設定ファイルで対象と出力名を指定すると、formal 文書を個別 PDF の一式として生成できます。
文書一覧、版・状態の表紙表示、文書間・見出し間の参照に対応します。

```bash
docker run --rm -v "$PWD/workspace:/workspace" \
  ghcr.io/hwatanabe-jp/markdown-mermaid-pdf:latest \
  --set formal-set/documents.json formal-set/dist
```

出力先には未作成のディレクトリを指定してください。すべての文書の検証と変換に成功した場合だけ、出力先に PDF 一式を保存します。
サンプルは `workspace/formal-set/`（`make example-set`）にあります。
設定・参照記法・PDF ビューアの制約は [formal モードの文書一式の生成](docs/formal-mode.md#文書一式の生成) を参照してください。

## Mermaid 図表の使用例

[workspace/example.md](workspace/example.md) に Mermaid 図表を含むサンプルドキュメントがあります。フローチャート、ガントチャート、シーケンス図などに対応しています。

記法の詳細は [Mermaid 公式ドキュメント](https://mermaid.js.org/)を参照してください。

## カスタマイズ

- **Mermaid/Puppeteer 設定**: `/config/.mermaid-config.json`, `/config/.puppeteer.json`, `/config/.mermaid.css`
- **LaTeX 設定**: `/config/header.tex` でフォント、レイアウト、見出しスタイルを変更可能

Mermaid/Puppeteer の設定は、次の順に優先されます。

1. 環境変数で指定した設定（`MERMAID_FILTER_MERMAID_CONFIG`、`MERMAID_FILTER_PUPPETEER_CONFIG`、`MERMAID_FILTER_MERMAID_CSS`）
2. 作業ディレクトリ内の `.mermaid-config.json`、`.puppeteer.json`、`.mermaid.css`
3. イメージ内の既定設定

既定設定をワークスペースへコピーしないため、
`default` と `formal` を切り替えると実行ごとに既定テーマを選び直します。
formal の既定 Mermaid 設定は `/config/formal/mermaid-config.json` です。

LaTeX 設定を変更してイメージをビルドする例です。

```dockerfile
FROM ghcr.io/hwatanabe-jp/markdown-mermaid-pdf:latest
COPY my-custom-header.tex /config/header.tex
```

### 改ページの指定

Markdown の標準記法には改ページがありません。本コンテナでは、Markdown 中に次のコメントを書くと PDF に改ページを挿入できます。

```markdown
ここが1ページ目の末尾です。

<!-- pagebreak -->

ここから2ページ目の本文です。
```

同梱の Lua フィルタ `/config/pagebreak.lua` が `<!-- pagebreak -->` を検出し、LaTeX では `\newpage`、HTML では改ページ用 div に変換します。

## セキュリティと実行モデル

- Mermaid 描画は Chromium を `--no-sandbox` 付きで起動するため、信頼できる入力だけを処理してください
- 既定ではコンテナは root で動作するため、ホストと共有したディレクトリに生成するファイルの所有者が、ホスト側のユーザーと異なる場合があります
- 所有権をホスト側に合わせたい場合は `--user $(id -u):$(id -g)` を指定してください

```bash
docker run --rm \
  --user $(id -u):$(id -g) \
  -v "$(pwd)/workspace:/workspace" \
  ghcr.io/hwatanabe-jp/markdown-mermaid-pdf:latest \
  document.md output.pdf
```

## トラブルシューティング

問題が発生した場合は [TROUBLESHOOTING.md](TROUBLESHOOTING.md) を参照してください。

## イメージの公開と検証

公開リリースは `linux/amd64` と `linux/arm64` に対応するマルチアーキテクチャイメージです。
両アーキテクチャの native runner で、PDF 生成などを確認するスモークテストを実行しています。

- main・安定版の公開前に Hadolint / Dockle とスモークテストを実行します
- main・release CI で使う GitHub Actions は、完全なコミット SHA に固定しています
- 公開イメージにはビルドの来歴情報（build provenance）とソフトウェア部品表の証明情報（SBOM attestation）を付与します
- Mermaid 関連の npm 依存パッケージは CI で深刻度 high / critical の脆弱性情報を検査し、安定版 `latest` も定期スキャンします

CI では各アーキテクチャのイメージを1回ずつビルドし、amd64 の公開候補には Dockle と
スモークテストの両方を実行します。ビルドキャッシュはアーキテクチャ別に分け、main と release で共用します。
同じ PR・ブランチへの連続更新では古い CI 実行をキャンセルします。手動実行は push と別枠で扱い、
常に両アーキテクチャを検証します。

`README.md`、`TROUBLESHOOTING.md`、`AGENTS.md`、`CLAUDE.md`、`docs/**` だけの変更では、
PR のイメージ検証を省略し、main への push では CI を起動しません。この場合、公開済みの `:main` は更新されません。
`workspace/` のサンプル Markdown、設定、スクリプト、ワークフローなどの変更は検証対象です。
PR の必須チェック名は維持し、変更判定や Dockerfile lint が失敗した場合は検証チェックも失敗します。

## ライセンス

このプロジェクトは **MIT License** でライセンスされています。詳細は [LICENSE](LICENSE) を参照してください。

### サードパーティライセンス

この Docker イメージには次のオープンソースソフトウェアが含まれています。

- Pandoc (GPL v2+), XeLaTeX/TeX Live (LPPL), Chromium (BSD 3-Clause)
- Node.js (MIT), npm (Artistic License 2.0), mermaid-filter (BSD 2-Clause)
- Noto Sans CJK JP (SIL Open Font License 1.1)

すべてのコンポーネントは商用利用可能です。詳細は [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) を参照してください。

## 参照

- [Pandoc 公式ドキュメント](https://pandoc.org/)
- [Mermaid 公式ドキュメント](https://mermaid.js.org/)
- [mermaid-filter](https://github.com/raghur/mermaid-filter)
