-- formal スタイル: 図表を標準ガイドライン風の LaTeX に変換する Pandoc Lua フィルタ。
--   表: 全罫線 + ヘッダー行グレー地 + 列幅・キャプション位置の指定(表 N-M)
--   図: 中央揃え + キャプション位置の指定(図 N-M)
--   別紙(番号なしの章): 直前で改ページ
-- mermaid-filter が図を画像化した後に適用すること。
local layout = dofile(pandoc.path.directory(PANDOC_SCRIPT_FILE) .. "/layout.lua")
local options
local function layout_error(message) error("[formal] " .. message, 0) end

local function blocks_to_latex(blocks)
  local out = pandoc.write(pandoc.Pandoc(blocks), "latex")
  return (out:gsub("%s+$", ""))
end

local function inlines_to_latex(inlines)
  return blocks_to_latex({ pandoc.Plain(inlines) })
end

-- Explicit PDF file specifications avoid URI escaping (e.g. spaces becoming
-- literal "%20" in /F) and supply /UF for Unicode filenames. Values are hex,
-- never authored LaTeX. XeLaTeX's xdvipdfmx supplies each link's bounding box.
function Link(el)
  local file = el.attributes["document-set-file"]
  if not file then return nil end
  local unicode_file = el.attributes["document-set-unicode-file"]
  local destination = el.attributes["document-set-destination"] or ""
  for _, value in ipairs({ file, unicode_file or "invalid", destination }) do
    if value:find("[^0-9a-f]") or #value % 2 ~= 0 then
      error("[formal] invalid document-set file link", 0)
    end
  end
  local dest = destination == "" and "[0 /Fit]" or "<" .. destination .. ">"
  return pandoc.RawInline("latex",
    "\\leavevmode\\special{pdf:bann << /Type /Annot /Subtype /Link /Border [0 0 0]"
    .. " /A << /S /GoToR /F << /Type /Filespec /F <" .. file .. "> /UF <"
    .. unicode_file .. "> >> /D " .. dest .. " >> >>}"
    .. inlines_to_latex(el.content) .. "\\special{pdf:eann}")
end

local ALIGN_PREFIX = {
  AlignCenter = ">{\\centering\\arraybackslash}",
  AlignRight = ">{\\raggedleft\\arraybackslash}",
}

-- 列幅: 明示幅(区切り行のハイフン比)があれば尊重し、残りを既定列で均等に分ける。
local function column_spec(colspecs, widths)
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
  for i, spec in ipairs(colspecs) do
    local prefix = ALIGN_PREFIX[spec[1]] or ""
    if widths then
      -- Distribute the usable content width, excluding all padding and rules.
      table.insert(parts, string.format(
        "%sp{\\dimexpr%.6f\\linewidth-%.6f\\tabcolsep-%.6f\\arrayrulewidth\\relax}|",
        prefix, widths[i], widths[i] * 2 * #colspecs, widths[i] * (#colspecs + 1)))
    else
      local width = spec[2] or default_width
      table.insert(parts,
        string.format("%sp{\\dimexpr%.4f\\linewidth-2\\tabcolsep-2\\arrayrulewidth\\relax}|",
          prefix, width))
    end
  end
  return table.concat(parts)
end

-- Estimate display width, not byte length. CJK/fullwidth characters count as
-- two units; combining marks do not add width. Cap outliers such as long URLs.
local function display_width(text)
  local maximum = 0
  for line in text:gmatch("[^\r\n]+") do
    local width = 0
    for _, cp in utf8.codes(line) do
      if cp >= 0x300 and cp <= 0x36f then
        -- Combining diacritical marks.
      elseif (cp >= 0x1100 and cp <= 0x115f)
          or (cp >= 0x2e80 and cp <= 0xa4cf)
          or (cp >= 0xac00 and cp <= 0xd7a3)
          or (cp >= 0xf900 and cp <= 0xfaff)
          or (cp >= 0xfe10 and cp <= 0xfe6f)
          or (cp >= 0xff01 and cp <= 0xff60)
          or (cp >= 0xffe0 and cp <= 0xffe6)
          or (cp >= 0x1f300 and cp <= 0x1faff)
          or (cp >= 0x20000 and cp <= 0x3ffff) then
        width = width + 2
      else
        width = width + 1
      end
    end
    maximum = math.max(maximum, math.min(width, 120))
  end
  return maximum
end

local function automatic_widths(tbl)
  local scores = {}
  for i = 1, #tbl.colspecs do scores[i] = 1 end
  local function measure(rows)
    for _, row in ipairs(rows) do
      local col = 1
      for _, cell in ipairs(row.cells) do
        local span = cell.col_span or 1
        local width = display_width(pandoc.utils.stringify(cell.contents)) / span
        for i = col, math.min(col + span - 1, #scores) do
          scores[i] = math.max(scores[i], width)
        end
        col = col + span
      end
    end
  end
  measure(tbl.head.rows)
  for _, body in ipairs(tbl.bodies) do measure(body.head); measure(body.body) end
  measure(tbl.foot.rows)
  local total = 0
  for i, score in ipairs(scores) do scores[i] = math.sqrt(score); total = total + scores[i] end
  local minimum = math.min(0.08, 0.5 / #scores)
  for i, score in ipairs(scores) do
    scores[i] = minimum + (1 - minimum * #scores) * score / total
  end
  return scores
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
  local widths = layout.widths(tbl.attributes["column-widths"]
    or options["table-column-widths"], #tbl.colspecs, layout_error)
  if widths == "auto" then widths = automatic_widths(tbl)
  elseif widths == "default" then widths = nil end
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

  local lines = { "\\begin{longtable}{" .. column_spec(tbl.colspecs, widths) .. "}" }
  if caption_latex and options["table-caption-position"] == "top" then
    table.insert(lines, "\\caption{" .. caption_latex .. "}\\\\")
  end
  append_header(lines)
  table.insert(lines, "\\endfirsthead")
  append_header(lines)
  table.insert(lines, "\\endhead")
  if caption_latex and options["table-caption-position"] == "bottom" then
    table.insert(lines, "\\endfoot")
    table.insert(lines, "\\caption{" .. caption_latex .. "}\\\\")
    table.insert(lines, "\\endlastfoot")
  end
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
    local caption = pandoc.RawBlock("latex", "\\caption{" .. inlines_to_latex(img.caption) .. "}")
    local blocks = { pandoc.RawBlock("latex", "\\begin{figure}[H]\n\\centering") }
    if options["figure-caption-position"] == "top" then table.insert(blocks, caption) end
    table.insert(blocks, pandoc.Plain({ bare }))
    if options["figure-caption-position"] == "bottom" then table.insert(blocks, caption) end
    table.insert(blocks, pandoc.RawBlock("latex", "\\end{figure}"))
    return blocks
  end
  return {
    pandoc.RawBlock("latex", "\\begin{center}"),
    pandoc.Plain({ bare }),
    pandoc.RawBlock("latex", "\\end{center}"),
  }
end

-- 別紙(番号なしの章)は titlesec の \sectionbreak が効かないため明示的に改ページする。
function Header(el)
  local blocks = {}
  if el.level == 1 and el.classes:includes("unnumbered") then
    table.insert(blocks, pandoc.RawBlock("latex", "\\clearpage"))
  end
  table.insert(blocks, el)
  local anchor = el.attributes["document-set-anchor"]
  if anchor then
    if not anchor:match("^docset%-h%d+$") then
      error("[formal] invalid document-set anchor", 0)
    end
    table.insert(blocks, pandoc.RawBlock("latex", "\\hypertarget{" .. anchor .. "}{}"))
  end
  return blocks
end

-- Configure metadata and table wrappers before transforming their contents.
return {{ Pandoc = function(doc)
  doc, options = layout.prepare(doc, layout_error)
  return doc:walk({ Link = Link, Table = Table, Para = Para, Header = Header })
end }}
