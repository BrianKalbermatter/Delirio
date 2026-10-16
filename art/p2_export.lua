-- Exports the sheet with the given hand layers visible, plus each frame's anchor.
local spr = app.open(app.params["src"])
local want = {}
for name in string.gmatch(app.params["layers"], "[^,]+") do want[name] = true end
for _, l in ipairs(spr.layers) do l.isVisible = want[l.name] == true end
app.command.ExportSpriteSheet{ui=false, type=SpriteSheetType.ROWS, columns=16, textureFilename=app.params["png"], dataFilename=app.params["json"], dataFormat=SpriteSheetDataFormat.JSON_ARRAY, listTags=true}
local anchors = nil
for _, l in ipairs(spr.layers) do if l.name == "anchors" then anchors = l end end
local f = io.open(app.params["anchors"], "w")
f:write("[\n")
for i, fr in ipairs(spr.frames) do
  local sx, sy, gx, gy = -1, -1, -1, -1
  local cel = anchors:cel(fr)
  if cel then
    for it in cel.image:pixels() do
      local px = it()
      if app.pixelColor.rgbaA(px) > 0 then
        local r, g = app.pixelColor.rgbaR(px), app.pixelColor.rgbaG(px)
        if r > 200 and g > 200 then sx, sy = it.x + cel.position.x, it.y + cel.position.y
        elseif g > 200 then gx, gy = it.x + cel.position.x, it.y + cel.position.y end
      end
    end
  end
  f:write(string.format('[%d,%d,%d,%d]%s\n', sx, sy, gx, gy, i < #spr.frames and "," or ""))
end
f:write("]\n")
f:close()
print("frames " .. #spr.frames)
