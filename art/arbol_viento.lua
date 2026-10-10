-- Adds a subtle wind loop to an animated tree .aseprite (Sombra / Tronco /
-- Copa / Hojas, tags "idle" and "chop", like Arbol1_pintado). The tree as it
-- is in the first frame is kept: the wind frames copy its trunk and crown and
-- shift the upper rows one pixel sideways. The line where the shift starts
-- slides down from the top of the crown and back up, so the sway runs through
-- the tree like a soft wave instead of jumping, and the foot stays planted. The "idle" tag then
-- covers the whole loop; "chop" is left as it is. Running it again replaces
-- the previous wind frames, so retouch the first frame and run it again.
--
-- Usage: Aseprite -b --script-param file=<tree.aseprite> --script arbol_viento.lua

local file = app.params["file"]
-- Per frame, the share of the tree's height (from the top) that leans one
-- pixel: positive downwind, negative the small swing back.
local GUST = { 0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.7, 0.6, 0.45, 0.3, 0.15, 0, -0.2, -0.2 }
local FRAME_S = 0.15
local STILL_ROWS = 6 -- rows above the foot that never move
local SWAYING = { "Tronco", "Copa" }

local sprite = app.open(file)
local function layer(name)
  for _, l in ipairs(sprite.layers) do
    if l.name == name then return l end
  end
  error("no layer " .. name)
end
local function tag(name)
  for _, t in ipairs(sprite.tags) do
    if t.name == name then return t end
  end
  error("no tag " .. name)
end

local idle, chop = tag("idle"), tag("chop")
local chopLength = chop.frames

-- Drop the wind of an earlier run: idle goes back to its first frame.
for f = idle.toFrame.frameNumber, idle.fromFrame.frameNumber + 1, -1 do
  sprite:deleteFrame(sprite.frames[f])
end

-- The foot is the trunk's lowest row, the top the crown's highest one.
local function rows(cel)
  local first, last
  for y = 0, cel.image.height - 1 do
    for x = 0, cel.image.width - 1 do
      if app.pixelColor.rgbaA(cel.image:getPixel(x, y)) > 0 then
        first = first or y
        last = y
        break
      end
    end
  end
  return cel.position.y + first, cel.position.y + last
end
local _, footY = rows(layer("Tronco"):cel(1))
local topY = rows(layer("Copa"):cel(1))
local height = math.max(1, footY - topY)

local maxSway = 1

local function swayed(cel, lean)
  local src = cel.image
  local out = Image(src.width + 2 * maxSway, src.height, src.colorMode)
  for y = 0, src.height - 1 do
    local rise = math.max(0, footY - STILL_ROWS - (cel.position.y + y)) / height
    local shift = 0
    if lean > 0 and rise > 1 - lean then shift = 1 end
    if lean < 0 and rise > 1 + lean then shift = -1 end
    for x = 0, src.width - 1 do
      local c = src:getPixel(x, y)
      if app.pixelColor.rgbaA(c) > 0 then out:drawPixel(x + maxSway + shift, y, c) end
    end
  end
  return out, Point(cel.position.x - maxSway, cel.position.y)
end

local first = idle.fromFrame.frameNumber
sprite.frames[first].duration = FRAME_S
for k = 2, #GUST do
  local frame = sprite:newEmptyFrame(first + k - 1)
  frame.duration = FRAME_S
  for _, name in ipairs(SWAYING) do
    local cel = layer(name):cel(first)
    if cel then
      local image, position = swayed(cel, GUST[k])
      sprite:newCel(layer(name), frame, image, position)
    end
  end
end

idle.fromFrame = sprite.frames[first]
idle.toFrame = sprite.frames[first + #GUST - 1]
chop.fromFrame = sprite.frames[first + #GUST]
chop.toFrame = sprite.frames[first + #GUST + chopLength - 1]
sprite:saveAs(file)
sprite:close()
