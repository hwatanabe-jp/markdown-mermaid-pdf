-- Export plain text with Pandoc's own stringify, preserving its parsed headings.
-- Used only by the document-set preflight, after validate.lua.
function Pandoc(doc)
  local info = {}
  for _, key in ipairs({ "doc-number", "title", "version", "status" }) do
    info[key] = pandoc.MetaString(pandoc.utils.stringify(doc.meta[key] or ""))
  end
  doc.meta["document-set-info"] = pandoc.MetaMap(info)
  doc.blocks = pandoc.Pandoc(doc.blocks):walk({ Header = function(header)
    header.attributes["document-set-title"] = pandoc.utils.stringify(header.content)
    return header
  end }).blocks
  return doc
end
