/**
 * Shader universel « Pion de Luxe » (§14.4) : à partir de la seule silhouette des jetons (canal
 * alpha), il génère sur le GPU un biseau (gradient de l'alpha, filtre de Sobel), un vernis
 * spéculaire (Blinn-Phong) et une ombre de contact. Le halo de la couleur du camp est dessiné sous
 * le jeton par le rendu. Variante « simple » en une passe pour le profil Low : biseau diffus seul.
 *
 * GLSL uniquement : WebGPU ne sera proposé que lorsque tous les shaders actifs fourniront du WGSL
 * (§14.1).
 */
import { Filter, GlProgram, UniformGroup } from 'pixi.js';
import type { Light } from './lighting.ts';
import type { Theme } from './theme.ts';

/** Vertex shader standard des filtres de PixiJS v8. */
const VERTEX = `in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord(void) {
  return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void) {
  gl_Position = filterVertexPosition();
  vTextureCoord = filterTextureCoord();
}
`;

const FRAGMENT = `in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
// Même précision que dans le vertex shader (sinon le programme ne se lie pas).
uniform highp vec4 uInputSize;
uniform vec4 uInputClamp;
uniform vec2 uLightDir;
uniform float uBevel;
uniform float uSpecular;
uniform float uShininess;
uniform float uFull;

float alphaAt(vec2 offset) {
  return texture(uTexture, clamp(vTextureCoord + offset, uInputClamp.xy, uInputClamp.zw)).a;
}

void main(void) {
  vec4 color = texture(uTexture, vTextureCoord);
  vec2 px = uInputSize.zw * uBevel;
  // Sobel sur l'alpha : la pente de la silhouette donne la normale du biseau.
  float tl = alphaAt(vec2(-px.x, -px.y));
  float tc = alphaAt(vec2(0.0, -px.y));
  float tr = alphaAt(vec2(px.x, -px.y));
  float ml = alphaAt(vec2(-px.x, 0.0));
  float mr = alphaAt(vec2(px.x, 0.0));
  float bl = alphaAt(vec2(-px.x, px.y));
  float bc = alphaAt(vec2(0.0, px.y));
  float br = alphaAt(vec2(px.x, px.y));
  float gx = (tr + 2.0 * mr + br) - (tl + 2.0 * ml + bl);
  float gy = (bl + 2.0 * bc + br) - (tl + 2.0 * tc + tr);
  vec3 normal = normalize(vec3(-gx, -gy, 1.5));
  vec3 light = normalize(vec3(uLightDir, 0.9));
  float diffuse = clamp(dot(normal, light), 0.0, 1.0);
  vec3 rgb = color.rgb * (0.72 + 0.38 * diffuse);
  float shadow = 0.0;
  if (uFull > 0.5) {
    // Vernis spéculaire (Blinn-Phong) et ombre de contact du côté opposé à la lumière.
    vec3 halfway = normalize(light + vec3(0.0, 0.0, 1.0));
    float spec = pow(clamp(dot(normal, halfway), 0.0, 1.0), uShininess) * uSpecular;
    rgb += vec3(spec) * color.a;
    float caster = alphaAt(-uLightDir * px * 2.5);
    shadow = (1.0 - color.a) * caster * 0.35;
  }
  finalColor = vec4(rgb, color.a) + vec4(0.0, 0.0, 0.0, shadow);
}
`;

export class TokenFilter extends Filter {
  private readonly uniforms: UniformGroup;
  private readonly specular: number;

  constructor(theme: Theme, light: Light, full: boolean) {
    const uniforms = new UniformGroup({
      uLightDir: { value: new Float32Array(2), type: 'vec2<f32>' },
      uBevel: { value: theme.shader.bevel, type: 'f32' },
      uSpecular: { value: theme.shader.specular, type: 'f32' },
      uShininess: { value: theme.shader.shininess, type: 'f32' },
      uFull: { value: full ? 1 : 0, type: 'f32' },
    });
    super({
      glProgram: GlProgram.from({ vertex: VERTEX, fragment: FRAGMENT, name: 'pion-de-luxe' }),
      resources: { luxeUniforms: uniforms },
      padding: 4,
    });
    this.uniforms = uniforms;
    this.specular = theme.shader.specular;
    this.setLight(light);
  }

  /** Lumière du moment : direction à l'écran et intensité des reflets (§14.4). */
  setLight(light: Light): void {
    const dir = this.uniforms.uniforms.uLightDir as Float32Array;
    // Axe y de l'écran vers le bas : un soleil à l'est éclaire depuis la droite.
    dir[0] = Math.cos(light.angle);
    dir[1] = -Math.sin(light.angle) * Math.max(0.3, light.elevation);
    this.uniforms.uniforms.uSpecular = this.specular * light.specular;
  }
}
