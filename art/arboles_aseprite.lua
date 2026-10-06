-- Builds one .aseprite file per tree from the frames written by
-- `python3 arboles.py --layers <dir>`.
--
-- Usage (batch):
--   Aseprite.exe -b --script-param dir=<dir> --script arboles_aseprite.lua
-- Each tree is saved as <dir>/<tree>.aseprite with layers
-- Sombra / Tronco / Copa / Hojas and the tags "idle" (frame 1) and "chop" (2..8).

local dir = app.params["dir"]
if not dir then error("missing --script-param dir=<folder>") end

local FRAMES = 8
local LAYERS = { "Sombra", "Tronco", "Copa", "Hojas" }   -- bottom to top

local names = io.open(app.fs.joinPath(dir, "arboles.txt")):read("a")

for name in names:gmatch("%S+") do
  -- Each tree has its own frame size (forest trees are bigger).
  local first = Image{ fromFile = app.fs.joinPath(dir, name, "Tronco_0.png") }
  local sprite = Sprite(first.width, first.height, ColorMode.RGB)
  for _ = 2, FRAMES do sprite:newEmptyFrame() end

  local layers = {}
  for i, layerName in ipairs(LAYERS) do
    local layer = (i == 1) and sprite.layers[1] or sprite:newLayer()
    layer.name = layerName
    layers[layerName] = layer
  end

  for f = 1, FRAMES do
    sprite.frames[f].duration = (f == 1) and 0.1 or 0.07
    for _, layerName in ipairs(LAYERS) do
      local path = app.fs.joinPath(dir, name, layerName .. "_" .. (f - 1) .. ".png")
      local img = Image{ fromFile = path }
      if not img:isEmpty() then
        sprite:newCel(layers[layerName], f, img, Point(0, 0))
      end
    end
  end

  local idle = sprite:newTag(1, 1)
  idle.name = "idle"
  local chop = sprite:newTag(2, FRAMES)
  chop.name = "chop"

  sprite:saveAs(app.fs.joinPath(dir, name .. ".aseprite"))
  sprite:close()
end
