-- Builds Efectos/NivelAura.aseprite from the frames of nivel_aura.py: the
-- layers Atras (behind the body) and Frente, with the tags of tags.txt.
--
-- Usage: Aseprite -b --script-param dir=<dir> --script-param out=<file.aseprite>
--          --script nivel_aura_aseprite.lua

local dir = app.params["dir"]
local out = app.params["out"]

local durations = {}
for ms in io.open(app.fs.joinPath(dir, "durations.txt")):read("a"):gmatch("%d+") do
  durations[#durations + 1] = tonumber(ms)
end

local first = Image { fromFile = app.fs.joinPath(dir, "frente", "0.png") }
local sprite = Sprite(first.width, first.height, ColorMode.RGB)
for _ = 2, #durations do sprite:newEmptyFrame() end

local atras = sprite.layers[1]
atras.name = "Atras"
local frente = sprite:newLayer()
frente.name = "Frente"

for f, ms in ipairs(durations) do
  sprite.frames[f].duration = ms / 1000
  for name, layer in pairs({ atras = atras, frente = frente }) do
    local img = Image { fromFile = app.fs.joinPath(dir, name, (f - 1) .. ".png") }
    if not img:isEmpty() then sprite:newCel(layer, f, img, Point(0, 0)) end
  end
end

for line in io.open(app.fs.joinPath(dir, "tags.txt")):lines() do
  local name, from, to = line:match("(%S+) (%d+) (%d+)")
  sprite:newTag(tonumber(from), tonumber(to)).name = name
end

sprite:saveAs(out)
sprite:close()
