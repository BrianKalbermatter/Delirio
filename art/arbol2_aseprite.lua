-- Builds Arboles/Arbol2.aseprite from the pixels of arbol2.py: the layers
-- Sombra (under everything that stands) and Arbol.
--
-- Usage: Aseprite -b --script-param dir=<dir> --script-param out=<file.aseprite>
--          --script arbol2_aseprite.lua

local dir = app.params["dir"]
local out = app.params["out"]

local arbol = Image { fromFile = app.fs.joinPath(dir, "arbol.png") }
local sombra = Image { fromFile = app.fs.joinPath(dir, "sombra.png") }

local sprite = Sprite(arbol.width, arbol.height, ColorMode.RGB)
local capa_sombra = sprite.layers[1]
capa_sombra.name = "Sombra"
sprite:newCel(capa_sombra, 1, sombra, Point(0, 0))
local capa_arbol = sprite:newLayer()
capa_arbol.name = "Arbol"
sprite:newCel(capa_arbol, 1, arbol, Point(0, 0))

sprite:saveAs(out)
sprite:close()
