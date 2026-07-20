-- formal スタイル: 図表を標準ガイドライン風の LaTeX に変換する Pandoc Lua フィルタ。
--   表: 全罫線 + ヘッダー行グレー地 + キャプション上部(表 N-M)
--   図: 中央揃え + キャプション上部(図 N-M)
--   別紙(番号なしの章): 直前で改ページ
-- mermaid-filter が図を画像化した後に適用すること。

local function blocks_to_latex(blocks)
  local out = pandoc.write(pandoc.Pandoc(blocks), "latex")
  return (out:gsub("%s+$", ""))
end

local function inlines_to_latex(inlines)
  return blocks_to_latex({ pandoc.Plain(inlines) })
end

local ALIGN_PREFIX = {
  AlignCenter = ">{\\centering\\arraybackslash}",
  AlignRight = ">{\\raggedleft\\arraybackslash}",
}

-- 列幅: 明示幅(区切り行のハイフン比)があれば尊重し、残りを既定列で均等に分ける。
local function column_spec(colspecs)
  local explicit_total = 0
  local default_count = 0
  for _, spec in ipairs(colspecs) do
    if spec[2] then
      explicit_total = explicit_total + spec[2]
    else
      default_count = default_count + 1
    end
  end
  local default_width = 0
  if default_count > 0 then
    default_width = math.max(0.08, (1 - math.min(explicit_total, 0.92)) / default_count)
  end

  local parts = { "|" }
  for _, spec in ipairs(colspecs) do
    local prefix = ALIGN_PREFIX[spec[1]] or ""
    local width = spec[2] or default_width
    table.insert(parts,
      string.format("%sp{\\dimexpr%.4f\\linewidth-2\\tabcolsep-2\\arrayrulewidth\\relax}|",
        prefix, width))
  end
  return table.concat(parts)
end

local function row_to_latex(row, is_header)
  local cells = {}
  for _, cell in ipairs(row.cells) do
    local content = blocks_to_latex(cell.contents)
    if is_header then
      content = "{\\sffamily " .. content .. "}"
    end
    table.insert(cells, content)
  end
  local line = table.concat(cells, " & ") .. " \\\\"
  if is_header then
    line = "\\rowcolor{formaltablehead}" .. line
  end
  return line
end

function Table(tbl)
  local caption_latex
  if tbl.caption and tbl.caption.long and #tbl.caption.long > 0 then
    local rendered = blocks_to_latex(tbl.caption.long):gsub("%s+", " ")
    if rendered ~= "" then
      caption_latex = rendered
    end
  end

  local header_rows = {}
  if tbl.head and tbl.head.rows then
    for _, row in ipairs(tbl.head.rows) do
      local has_content = false
      for _, cell in ipairs(row.cells) do
        if pandoc.utils.stringify(cell.contents) ~= "" then
          has_content = true
          break
        end
      end
      if has_content then
        table.insert(header_rows, row_to_latex(row, true))
      end
    end
  end

  local body_rows = {}
  for _, body in ipairs(tbl.bodies) do
    for _, row in ipairs(body.body) do
      table.insert(body_rows, row_to_latex(row, false))
    end
  end
  if tbl.foot and tbl.foot.rows then
    for _, row in ipairs(tbl.foot.rows) do
      table.insert(body_rows, row_to_latex(row, false))
    end
  end
  if #body_rows == 0 then
    body_rows = { "\\multicolumn{" .. #tbl.colspecs .. "}{|l|}{} \\\\" }
  end

  local function append_header(lines)
    table.insert(lines, "\\hline")
    for _, r in ipairs(header_rows) do
      table.insert(lines, r)
      table.insert(lines, "\\hline")
    end
  end

  local lines = { "\\begin{longtable}{" .. column_spec(tbl.colspecs) .. "}" }
  if caption_latex then
    table.insert(lines, "\\caption{" .. caption_latex .. "}\\\\")
  end
  append_header(lines)
  table.insert(lines, "\\endfirsthead")
  append_header(lines)
  table.insert(lines, "\\endhead")
  for _, r in ipairs(body_rows) do
    table.insert(lines, r)
    table.insert(lines, "\\hline")
  end
  table.insert(lines, "\\end{longtable}")

  return pandoc.RawBlock("latex", table.concat(lines, "\n"))
end

-- 図は Image 要素のまま挟み込む(raw の \includegraphics にすると pandoc が
-- mermaid-filter の data URI 画像を一時ファイル化できなくなるため)。
function Para(el)
  if #el.content ~= 1 or el.content[1].t ~= "Image" then
    return nil
  end
  local img = el.content[1]
  local bare = img:clone()
  bare.caption = {}
  bare.title = ""
  if img.title == "fig:" and #img.caption > 0 then
    return {
      pandoc.RawBlock("latex",
        "\\begin{figure}[H]\n\\centering\n\\caption{" .. inlines_to_latex(img.caption) .. "}"),
      pandoc.Plain({ bare }),
      pandoc.RawBlock("latex", "\\end{figure}"),
    }
  end
  return {
    pandoc.RawBlock("latex", "\\begin{center}"),
    pandoc.Plain({ bare }),
    pandoc.RawBlock("latex", "\\end{center}"),
  }
end

-- 別紙(番号なしの章)は titlesec の \sectionbreak が効かないため明示的に改ページする。
function Header(el)
  if el.level == 1 and el.classes:includes("unnumbered") then
    return { pandoc.RawBlock("latex", "\\clearpage"), el }
  end
  return nil
end
