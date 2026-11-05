-- Builds Arboles/Arbol3.aseprite (layers Sombra and Arbol) and
-- Arboles/Arbol3_pie.aseprite (one frame per loose piece) from arbol3.py.
--
-- Usage: Aseprite -b --script-param dir=<dir> --script-param out=<file.aseprite>
--          --script-param pie=<file.aseprite> --script arbol3_aseprite.lua

local dir = app.params["dir"]

local arbol = Image { fromFile = app.fs.joinPath(dir, "arbol.png") }
local sombra = Image { fromFile = app.fs.joinPath(dir, "sombra.png") }
local sprite = Sprite(arbol.width, arbol.height, ColorMode.RGB)
local capa_sombra = sprite.layers[1]
capa_sombra.name = "Sombra"
sprite:newCel(capa_sombra, 1, sombra, Point(0, 0))
local capa_arbol = sprite:newLayer()
capa_arbol.name = "Arbol"
sprite:newCel(capa_arbol, 1, arbol, Point(0, 0))
sprite:saveAs(app.params["out"])
sprite:close()

local images = {}
while app.fs.isFile(app.fs.joinPath(dir, "pie", #images .. ".png")) do
  images[#images + 1] = Image { fromFile = app.fs.joinPath(dir, "pie", #images .. ".png") }
end
local pie = Sprite(images[1].width, images[1].height, ColorMode.RGB)
pie.layers[1].name = "Pie"
for _ = 2, #images do pie:newEmptyFrame() end
for f, image in ipairs(images) do pie:newCel(pie.layers[1], f, image, Point(0, 0)) end
pie:saveAs(app.params["pie"])
pie:close()
