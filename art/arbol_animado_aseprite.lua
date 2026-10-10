-- Builds an animated tree .aseprite from the frames written by
-- `python3 animar_arbol.py <line_art.png> <dir>`: layers Sombra / Tronco /
-- Copa / Hojas, tags "idle" (frame 1) and "chop" (2..8), like the old trees.
--
-- Usage: Aseprite -b --script-param dir=<dir> --script-param out=<file.aseprite>
--          --script arbol_animado_aseprite.lua

local dir = app.params["dir"]
local out = app.params["out"]
local FRAMES = 8
local LAYERS = { "Sombra", "Tronco", "Copa", "Hojas" } -- bottom to top

local first = Image { fromFile = app.fs.joinPath(dir, "Tronco_0.png") }
local sprite = Sprite(first.width, first.height, ColorMode.RGB)
for _ = 2, FRAMES do sprite:newEmptyFrame() end

local layers = {}
for i, name in ipairs(LAYERS) do
  local layer = (i == 1) and sprite.layers[1] or sprite:newLayer()
  layer.name = name
  layers[name] = layer
end

for f = 1, FRAMES do
  sprite.frames[f].duration = (f == 1) and 0.1 or 0.07
  for _, name in ipairs(LAYERS) do
    local img = Image { fromFile = app.fs.joinPath(dir, name .. "_" .. (f - 1) .. ".png") }
    if not img:isEmpty() then sprite:newCel(layers[name], f, img, Point(0, 0)) end
  end
end

sprite:newTag(1, 1).name = "idle"
sprite:newTag(2, FRAMES).name = "chop"
sprite:saveAs(out)
sprite:close()
