-- formal スタイル: スキーマ検証と表示用メタデータの導出を行う Pandoc Lua フィルタ。
-- スキーマの正典は docs/formal-mode.md を参照。
-- 検証エラー時は [formal] で始まるメッセージを列挙して変換を中止する(非0終了)。
-- mermaid-filter などの重い処理より前に適用し、不適合文書を早期に弾く。

local stringify = pandoc.utils.stringify

local REQUIRED_META = { "doc-number", "title", "date", "organization", "revision-history" }

local errors = {}

local function add_error(msg)
  table.insert(errors, msg)
end

local meta_type = pandoc.utils.type

local function is_present(v)
  return v ~= nil and stringify(v) ~= ""
end

local function parse_iso_date(v)
  local s = stringify(v)
  local y, m, d = s:match("^(%d%d%d%d)%-(%d%d)%-(%d%d)$")
  if not y then
    return nil
  end
  y, m, d = tonumber(y), tonumber(m), tonumber(d)
  if m < 1 or m > 12 or d < 1 or d > 31 then
    return nil
  end
  return y, m, d
end

-- 元号表記(令和/平成)。それ以前の日付は西暦のみとする。
local function era_name(y, m)
  if y > 2019 or (y == 2019 and m >= 5) then
    local n = y - 2018
    return "令和" .. (n == 1 and "元" or tostring(n))
  end
  if y >= 1989 then
    local n = y - 1988
    return "平成" .. (n == 1 and "元" or tostring(n))
  end
  return nil
end

-- 改定履歴用: 「2026年7月15日」
local function format_plain_date(y, m, d)
  return string.format("%d年%d月%d日", y, m, d)
end

-- 表紙用: 「2026（令和8）年7月15日」
local function format_cover_date(y, m, d)
  local era = era_name(y, m)
  if era then
    return string.format("%d（%s）年%d月%d日", y, era, m, d)
  end
  return format_plain_date(y, m, d)
end

local function heading_label(header)
  local text = stringify(header.content)
  if text == "" then
    text = "(無題)"
  end
  return string.format("見出し「%s」(%d階層目)", text, header.level)
end

local function validate_and_decorate_meta(meta)
  for _, key in ipairs({ "version", "status" }) do
    if meta[key] ~= nil then
      local kind = meta_type(meta[key])
      if (kind ~= "Inlines" and kind ~= "Blocks" and kind ~= "string")
          or not is_present(meta[key]) then
        add_error(string.format("'%s' は空でない文字列で指定してください", key))
      end
    end
  end
  for _, key in ipairs(REQUIRED_META) do
    if not is_present(meta[key]) then
      add_error(string.format("必須メタデータ '%s' がありません", key))
    end
  end

  if is_present(meta["date"]) then
    local y, m, d = parse_iso_date(meta["date"])
    if not y then
      add_error(string.format(
        "'date' は YYYY-MM-DD 形式で指定してください (現在: '%s')", stringify(meta["date"])))
    else
      meta["date-display"] = pandoc.MetaString(format_cover_date(y, m, d))
    end
  end

  local history = meta["revision-history"]
  if is_present(history) then
    if meta_type(history) ~= "List" then
      add_error("'revision-history' は配列で指定してください")
    else
      for i, item in ipairs(history) do
        if meta_type(item) ~= "table" and meta_type(item) ~= "Map" then
          add_error(string.format(
            "revision-history[%d] は date と description を持つオブジェクトで指定してください", i))
        else
          if not is_present(item.date) then
            add_error(string.format("revision-history[%d] に 'date' がありません", i))
          else
            local y, m, d = parse_iso_date(item.date)
            if not y then
              add_error(string.format(
                "revision-history[%d].date は YYYY-MM-DD 形式で指定してください (現在: '%s')",
                i, stringify(item.date)))
            else
              item["date-display"] = pandoc.MetaString(format_plain_date(y, m, d))
            end
          end
          if not is_present(item.description) then
            add_error(string.format("revision-history[%d] に 'description' がありません", i))
          end
          if not is_present(item.place) then
            item.place = pandoc.MetaString("-")
          end
        end
      end
    end
  end

  local keywords = meta["keywords"]
  if keywords ~= nil then
    local display
    if meta_type(keywords) == "List" then
      display = table.concat(keywords:map(stringify), "、")
    else
      display = stringify(keywords)
    end
    if display ~= "" then
      meta["keywords-display"] = pandoc.MetaString(display)
    end
  end

  -- position は「Informative」「参考とするドキュメント」のように行を積む表記のため、
  -- 段落内の改行(SoftBreak)を強制改行に変換する。
  -- title / subtitle も複数行(YAML literal block)で書けば表紙の折返し位置を制御できる。
  for _, key in ipairs({ "position", "title", "subtitle" }) do
    if meta[key] ~= nil and meta_type(meta[key]) == "Blocks" then
      meta[key] = pandoc.walk_block(
        pandoc.Div(meta[key]),
        { SoftBreak = function() return pandoc.LineBreak() end }
      ).content
    end
  end

  if is_present(meta["position"]) or is_present(meta["keywords-display"])
      or is_present(meta["abstract"]) then
    meta["has-cover-box"] = pandoc.MetaBool(true)
  end

  return meta
end

local function validate_headings(blocks)
  local prev_level = 0
  local seen_heading = false
  local body_before_heading = false
  local numbered_chapters = 0
  local numbered_details = 0

  -- Walk only the body, in document order; headings in metadata are not chapters.
  pandoc.Pandoc(blocks):walk({ traverse = "topdown", Block = function(block)
    if block.t == "Header" then
      if block.level > 4 then
        add_error(heading_label(block) .. " : 見出しは4階層(####)までです")
      elseif not seen_heading and block.level > 1 then
        add_error(heading_label(block) .. " : 最初の見出しは章(#)にしてください")
      elseif block.level > prev_level + 1 then
        add_error(string.format(
          "%s : 直前の見出し(%d階層目)から階層が飛んでいます", heading_label(block), prev_level))
      end
      -- 5階層以上はエラー済みのため、以降の飛び越え判定の基準にしない
      if block.level <= 4 then
        prev_level = block.level
      end
      seen_heading = true
      if not block.classes:includes("unnumbered") then
        if block.level == 1 then
          numbered_chapters = numbered_chapters + 1
        end
        if block.level < 4 then
          numbered_details = 0
        elseif block.level == 4 then
          numbered_details = numbered_details + 1
          if numbered_details > 20 then
            add_error(heading_label(block) .. " : 番号付きの細目(####)は各項20件までです")
          end
        end
      end
    -- A Div is only a wrapper; its contents determine whether body text precedes a chapter.
    elseif not seen_heading and block.t ~= "Null" and block.t ~= "Div" then
      body_before_heading = true
    end
  end })

  if body_before_heading then
    add_error("最初の見出し(章)より前に本文があります。本文は必ず章(#)の配下に置いてください")
  end
  if numbered_chapters == 0 then
    add_error("番号付きの章(# 見出し)が1つ以上必要です")
  end
end

function Pandoc(doc)
  local meta = validate_and_decorate_meta(doc.meta)
  validate_headings(doc.blocks)

  if #errors > 0 then
    error("\n[formal] スキーマ検証エラー:\n- " .. table.concat(errors, "\n- ")
      .. "\n詳細は docs/formal-mode.md を参照してください。\n", 0)
  end

  doc.meta = meta
  return doc
end
