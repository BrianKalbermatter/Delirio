-- Builds an .aseprite from numbered frames: <dir>/0.png, 1.png, ... and
-- <dir>/durations.txt (ms per frame, space separated). With tag=<name>, all
-- frames go under that animation tag.
--
-- Usage: Aseprite -b --script-param dir=<dir> --script-param out=<file.aseprite>
--          [--script-param tag=<name>] --script frames_aseprite.lua

local dir = app.params["dir"]
local out = app.params["out"]
local tag = app.params["tag"]

local durations = {}
for ms in io.open(app.fs.joinPath(dir, "durations.txt")):read("a"):gmatch("%d+") do
  durations[#durations + 1] = tonumber(ms)
end

local first = Image { fromFile = app.fs.joinPath(dir, "0.png") }
local sprite = Sprite(first.width, first.height, ColorMode.RGB)
for _ = 2, #durations do sprite:newEmptyFrame() end
for f, ms in ipairs(durations) do
  sprite.frames[f].duration = ms / 1000
  local img = Image { fromFile = app.fs.joinPath(dir, (f - 1) .. ".png") }
  if not img:isEmpty() then sprite:newCel(sprite.layers[1], f, img, Point(0, 0)) end
end
if tag and tag ~= "" then sprite:newTag(1, #durations).name = tag end
sprite:saveAs(out)
sprite:close()
