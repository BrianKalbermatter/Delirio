-- Builds Bicho_Anim.aseprite from the frames written by `python3 bicho.py <dir>`.
--
-- Usage (batch):
--   Aseprite.exe -b --script-param dir=<dir> --script-param out=<file> --script bicho_aseprite.lua
-- The sprite has 263 frames of 64x96, layers Sombra / Bicho and the same tags
-- and frame durations as Personaje_2_Anim.

local dir = app.params["dir"]
local out = app.params["out"]
if not dir or not out then error("missing --script-param dir=<folder> out=<file>") end

local durations = {}
for line in io.lines(app.fs.joinPath(dir, "durations.txt")) do
  durations[#durations + 1] = tonumber(line)
end

local sprite = Sprite(64, 96, ColorMode.RGB)
for _ = 2, #durations do sprite:newEmptyFrame() end

local shadow = sprite.layers[1]
shadow.name = "Sombra"
local body = sprite:newLayer()
body.name = "Bicho"

for f = 1, #durations do
  sprite.frames[f].duration = durations[f] / 1000
  for _, layer in ipairs({ shadow, body }) do
    local img = Image{ fromFile = app.fs.joinPath(dir, layer.name .. "_" .. (f - 1) .. ".png") }
    if not img:isEmpty() then sprite:newCel(layer, f, img, Point(0, 0)) end
  end
end

for line in io.lines(app.fs.joinPath(dir, "tags.txt")) do
  local name, from, to = line:match("(%S+) (%d+) (%d+)")
  local tag = sprite:newTag(tonumber(from) + 1, tonumber(to) + 1)
  tag.name = name
end

sprite:saveAs(out)
sprite:close()
