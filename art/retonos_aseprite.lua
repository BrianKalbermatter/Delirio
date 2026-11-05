-- Builds an .aseprite from numbered frames: the saplings of retonos.py and the
-- bushes of arbustos.py. layer=<name> names its layer.
--
-- Usage: Aseprite -b --script-param dir=<dir> --script-param out=<file.aseprite>
--          --script retonos_aseprite.lua

local dir = app.params["dir"]

local images = {}
while app.fs.isFile(app.fs.joinPath(dir, #images .. ".png")) do
  images[#images + 1] = Image { fromFile = app.fs.joinPath(dir, #images .. ".png") }
end
local sprite = Sprite(images[1].width, images[1].height, ColorMode.RGB)
sprite.layers[1].name = app.params["layer"] or "Retonos"
for _ = 2, #images do sprite:newEmptyFrame() end
for f, image in ipairs(images) do sprite:newCel(sprite.layers[1], f, image, Point(0, 0)) end
sprite:saveAs(app.params["out"])
sprite:close()
