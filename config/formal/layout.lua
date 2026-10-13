-- Shared layout validation for single documents, document-set preflight and rendering.
local M = {}

function M.widths(value, count, report)
  if value == "auto" or value == "default" then return value end
  local widths, total = {}, 0
  for token in (value .. ","):gmatch("(.-),") do
    token = token:match("^%s*(.-)%s*$")
    local number = token:match("^%d+%.?%d*$") and tonumber(token)
    if not number or number <= 0 or number == math.huge then
      report("column-widths は auto、default、または正の数のカンマ区切りで指定してください")
      return nil
    end
    widths[#widths + 1], total = number, total + number
  end
  if #widths ~= count then
    report(string.format("column-widths の指定数(%d)が表の列数(%d)と一致しません", #widths, count))
    return nil
  end
  if total == math.huge then
    report("column-widths の合計が大きすぎます")
    return nil
  end
  for i, width in ipairs(widths) do
    widths[i] = width / total
    if widths[i] < 0.001 then
      report("column-widths の各列の比率は全体の 0.1% 以上にしてください")
      return nil
    end
  end
  return widths
end

function M.prepare(doc, report)
  local options = {}
  local meta = doc.meta
  for key, default in pairs({
    ["figure-caption-position"] = "top",
    ["table-caption-position"] = "top",
    ["table-column-widths"] = "default",
  }) do
    local value = meta[key]
    local present = value ~= nil
    local kind = present and pandoc.utils.type(value)
    local text = present and pandoc.utils.stringify(value) or default
    local valid = key == "table-column-widths"
      and (text == "auto" or text == "default")
      or key ~= "table-column-widths" and (text == "top" or text == "bottom")
    if (present and kind ~= "Inlines" and kind ~= "string") or not valid then
      report("'" .. key .. "' は " .. (key == "table-column-widths"
        and "auto または default" or "top または bottom") .. " で指定してください")
    elseif present then
      -- Templates must receive the validated enum, never authored inline TeX.
      meta[key] = pandoc.MetaString(text)
    end
    options[key] = text
  end
  doc.meta = meta
  -- A table-layout wrapper deliberately scopes exactly one table, avoiding
  -- accidental inheritance into unrelated tables or nested document sections.
  doc.blocks = pandoc.Pandoc(doc.blocks):walk({ traverse = "topdown",
    Div = function(div)
      if not div.classes:includes("table-layout") then return nil end
      if #div.content ~= 1 or div.content[1].t ~= "Table" then
        report("table-layout の中には表を1つだけ配置してください")
      elseif not div.attributes["column-widths"] then
        report("table-layout に column-widths を指定してください")
      else
        div.content[1].attributes["column-widths"] = div.attributes["column-widths"]
      end
      return div
    end,
    Table = function(tbl)
      local value = tbl.attributes["column-widths"]
      if value then M.widths(value, #tbl.colspecs, report) end
    end,
  }).blocks
  return doc, options
end

return M
