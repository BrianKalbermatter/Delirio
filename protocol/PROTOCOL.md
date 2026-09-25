# Delirio wire protocol — v0

Single source of truth for the client (TypeScript) and the server (C).
Both sides implement this document by hand; there is no code generation.

## Transport

- WebSocket (RFC 6455), binary frames only.
- One message per frame.
- All integers are little-endian.
- Server tick rate: 20 Hz.

## Message layout

Every message starts with one byte: the message id.

| id  | direction        | name          | payload                                   |
|-----|------------------|---------------|-------------------------------------------|
| 1   | client -> server | JOIN          | name_len u8, name bytes (UTF-8, <= 16)    |
| 2   | client -> server | INPUT         | seq u16, tick u32, move_x i8, move_z i8, yaw u16, buttons u8 |
| 10  | server -> client | WELCOME       | player_id u8, tick_rate u8, map_seed u32  |
| 11  | server -> client | SNAPSHOT      | see below                                 |
| 12  | server -> client | WAVE_EVENT    | wave u16, phase u8                        |
| 13  | server -> client | PLAYER_JOINED | player_id u8, name_len u8, name bytes     |
| 14  | server -> client | PLAYER_LEFT   | player_id u8                              |

### SNAPSHOT (id 11)

```
tick u32
player_count u8
  repeated player_count times:
    id u8, x f32, y f32, z f32, yaw u16, hp u16, anim u8
enemy_count u16
  repeated enemy_count times:
    id u16, type u8, x f32, y f32, z f32, yaw u16, hp u16, anim u8
```

## Units and encodings

- Positions are world meters as IEEE-754 f32.
- `yaw` is an angle in [0, 65535] mapped to [0, 2*pi).
- `move_x` / `move_z` are in [-127, 127] and represent a normalized direction * 127.
- `buttons` is a bit field: bit0 attack, bit1 jump, bit2 dodge.

## Rules

- The server never trusts the client: inputs are intents, positions are computed server-side.
- Unknown message ids close the connection.
