-- Convert HTML comment `<!-- pagebreak -->` into format-specific page breaks.
-- For HTML we emit a styled div; LaTeX/PDF and all other formats get \newpage.

local pattern = "^%s*<!%-%-%s*pagebreak%s*%-%->%s*$"

local function break_raw()
  if FORMAT:match("html") then
    return "html", '<div style="page-break-after: always;"></div>'
  end
  return "latex", "\\newpage"
end

function RawBlock(el)
  if el.format == "html" and el.text:match(pattern) then
    return pandoc.RawBlock(break_raw())
  end
  return nil
end

function RawInline(el)
  if el.format == "html" and el.text:match(pattern) then
    return pandoc.RawInline(break_raw())
  end
  return nil
end
