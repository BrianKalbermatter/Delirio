-- Builds Personaje_3_Anim.aseprite from the frames written by personaje_3_build.py.
--
-- Usage (batch):
--   Aseprite.exe -b --script-param dir=<frames dir> --script-param out=<file> --script p3_aseprite.lua
-- Layers: "libre" (bare hands, visible) and "armado" (gripping with the right
-- hand, hidden), one tag per animation and direction.

local dir = app.params["dir"]
local out = app.params["out"]
if not dir or not out then error("missing --script-param dir=<folder> out=<file>") end

local durations = {}
for line in io.lines(app.fs.joinPath(dir, "durations.txt")) do
  durations[#durations + 1] = tonumber(line)
end

local sprite = Sprite(64, 96, ColorMode.RGB)
for _ = 2, #durations do sprite:newEmptyFrame() end

local armed = sprite.layers[1]
armed.name = "armado"
local free = sprite:newLayer()
free.name = "libre"

for f = 1, #durations do
  sprite.frames[f].duration = durations[f] / 1000
  for _, layer in ipairs({ free, armed }) do
    local img = Image{ fromFile = app.fs.joinPath(dir, layer.name .. "_" .. (f - 1) .. ".png") }
    if not img:isEmpty() then sprite:newCel(layer, f, img, Point(0, 0)) end
  end
end
armed.isVisible = false

for line in io.lines(app.fs.joinPath(dir, "tags.txt")) do
  local name, from, to = line:match("(%S+) (%d+) (%d+)")
  local tag = sprite:newTag(tonumber(from) + 1, tonumber(to) + 1)
  tag.name = name
end

sprite:saveAs(out)
sprite:close()
