-- Builds the sample tree as an .aseprite with one layer per part, from the
-- PNGs written by `python3 arbol.py <out_dir> <layers_dir>`.
--
-- Usage: Aseprite -b --script-param dir=<layers_dir> --script-param out=<file.aseprite>
--          --script-param sticks=<palitos.png> --script arbol_aseprite.lua
-- Also writes palitos.aseprite next to <file.aseprite>.

local dir = app.params["dir"]
local out = app.params["out"]
local layers = { "Sombra", "Tronco", "Copa", "Pasto" } -- bottom to top

local first = Image { fromFile = dir .. "/" .. layers[1] .. ".png" }
local sprite = Sprite(first.width, first.height, ColorMode.RGB)
for i, name in ipairs(layers) do
  local layer = (i == 1) and sprite.layers[1] or sprite:newLayer()
  layer.name = name
  sprite:newCel(layer, 1, Image { fromFile = dir .. "/" .. name .. ".png" }, Point(0, 0))
end
sprite:saveAs(out)
sprite:close()

local sticks = Image { fromFile = app.params["sticks"] }
local strip = Sprite(sticks.width, sticks.height, ColorMode.RGB)
strip.layers[1].name = "Palitos"
strip:newCel(strip.layers[1], 1, sticks, Point(0, 0))
strip:saveAs(app.fs.joinPath(app.fs.filePath(out), "palitos.aseprite"))
strip:close()
