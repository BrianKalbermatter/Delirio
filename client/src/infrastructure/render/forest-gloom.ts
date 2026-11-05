// The gloom of the forest corner: little light and a lot of fog, over the
// world and under the night. The floor and the trees keep their own colours;
// this is what makes them dark, more and more the deeper you go, and what is
// under it still shows.
//
// One screen-sized quad, like the darkness in lighting.ts. The fog is worked
// out in world pixels, in blocks and a few levels so it reads as pixel art, and
// drifts slowly. Off the forest the quad is not drawn at all.
import { Container, Mesh, MeshGeometry, Shader, UniformGroup } from "pixi.js";

export interface Forest {
  x: number; // its corner of the square, world px
  y: number;
  radius: number; // px
}

const EDGE_PX = 128; // the gloom starts this far outside the forest...
const EAST_FADE = 96; // px past the square it fades out: the wall's thickness
const NORTH_FADE = 168; // the same to the north: the wall and its front face

const VERTEX = `
in vec2 aPosition;
in vec2 aUV;
out vec2 vUV;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;

void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vUV = aUV;
}`;

// Light taken away (DIM) and fog added (FOG_THIN in the clear spots, FOG_THICK
// in the banks), at the deepest. Fog in the shade: a dull grey, a little green.
const FRAGMENT = `
precision highp float;
in vec2 vUV;
out vec4 finalColor;
uniform vec2 uSize;
uniform vec2 uOrigin;
uniform vec2 uCorner;
uniform vec4 uReach;
uniform float uTime;

const float BLOCK = 3.0;
const float LEVELS = 5.0;
const float DEEP_PX = 520.0; // ...and is at its fullest this far inside
const float DIM = 0.42;
const float FOG_THIN = 0.12;
const float FOG_THICK = 0.42;
const vec3 FOG_COLOR = vec3(0.56, 0.60, 0.55);

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

void main() {
  // From the forest's corner: +x is past the square, +y into it
  vec2 at = floor((uOrigin + vUV * uSize) / BLOCK) * BLOCK - uCorner;
  float depth = uReach.x - length(at) + (noise(at / 140.0) - 0.5) * 110.0;
  float inside = (1.0 - smoothstep(0.0, uReach.z, at.x)) * (1.0 - smoothstep(0.0, uReach.w, -at.y));
  float deep = smoothstep(-uReach.y, DEEP_PX, depth) * inside;

  vec2 drift = uTime * vec2(0.014, 0.005);
  float mist = noise(at / 230.0 + drift) * 0.6 + noise(at / 105.0 - drift * 1.7) * 0.3 + noise(at / 48.0 + drift * 2.6) * 0.1;
  mist = floor(smoothstep(0.3, 0.7, mist) * LEVELS + 0.5) / LEVELS;

  float fog = deep * mix(FOG_THIN, FOG_THICK, mist);
  float dim = deep * DIM;
  finalColor = vec4(FOG_COLOR * fog, 1.0 - (1.0 - dim) * (1.0 - fog));
}`;

export class ForestGloom {
  // Screen space, over the world. The owner adds it under the night.
  readonly view = new Container();
  private readonly uniforms = new UniformGroup({
    uSize: { value: new Float32Array(2), type: "vec2<f32>" },
    uOrigin: { value: new Float32Array(2), type: "vec2<f32>" },
    uCorner: { value: new Float32Array(2), type: "vec2<f32>" },
    uReach: { value: new Float32Array(4), type: "vec4<f32>" },
    uTime: { value: 0, type: "f32" },
  });
  private readonly quad: Mesh<MeshGeometry, Shader>;
  private width = 0;
  private height = 0;

  constructor(
    private readonly forest: Forest,
    width: number,
    height: number,
  ) {
    const corners = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
    this.quad = new Mesh({
      geometry: new MeshGeometry({ positions: corners, uvs: corners, indices: new Uint32Array([0, 1, 2, 0, 2, 3]) }),
      shader: Shader.from({
        gl: { vertex: VERTEX, fragment: FRAGMENT },
        resources: { gloomUniforms: this.uniforms },
      }),
    });
    this.view.addChild(this.quad);
    const u = this.uniforms.uniforms;
    u.uCorner.set([forest.x, forest.y]);
    u.uReach.set([forest.radius, EDGE_PX, EAST_FADE, NORTH_FADE]);
    this.resize(width, height);
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.quad.scale.set(width, height);
    this.uniforms.uniforms.uSize.set([width, height]);
  }

  // (left, top): the world px at the screen's top left corner.
  update(left: number, top: number, timeMs: number): void {
    const { x, y, radius } = this.forest;
    const dx = Math.max(left - x, x - (left + this.width), 0);
    const dy = Math.max(top - y, y - (top + this.height), 0);
    this.view.visible = Math.hypot(dx, dy) < radius + EDGE_PX * 2;
    if (!this.view.visible) return;
    const u = this.uniforms.uniforms;
    u.uOrigin.set([left, top]);
    u.uTime = timeMs / 1000;
  }
}
