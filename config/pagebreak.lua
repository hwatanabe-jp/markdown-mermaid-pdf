-- Convert HTML comment `<!-- pagebreak -->` into format-specific page breaks.
-- For LaTeX/PDF we emit \newpage, for HTML we emit a styled div, and fall back
-- to \newpage for other formats.

local pattern = "^%s*<!%-%-%s*pagebreak%s*%-%->%s*$"

local function make_break_block()
  if FORMAT:match("latex") then
    return pandoc.RawBlock("latex", "\\newpage")
  elseif FORMAT:match("html") then
    return pandoc.RawBlock("html", '<div style="page-break-after: always;"></div>')
  else
    return pandoc.RawBlock("latex", "\\newpage")
  end
end

local function make_break_inline()
  if FORMAT:match("latex") then
    return pandoc.RawInline("latex", "\\newpage")
  elseif FORMAT:match("html") then
    return pandoc.RawInline("html", '<div style="page-break-after: always;"></div>')
  else
    return pandoc.RawInline("latex", "\\newpage")
  end
end

function RawBlock(el)
  if el.format == "html" and el.text:match(pattern) then
    return make_break_block()
  end
  return nil
end

function RawInline(el)
  if el.format == "html" and el.text:match(pattern) then
    return make_break_inline()
  end
  return nil
end
