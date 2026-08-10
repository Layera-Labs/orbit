/**
 * Chroma key on the preview canvas.
 *
 * ffmpeg's `colorkey` walks every pixel: alpha becomes
 * `clamp((diff − similarity) / blend, 0, 1)` where `diff` is the RGB distance
 * from the key colour, normalized by √3. RGB is left alone — there is no
 * despill. Measured against ffmpeg over eight probe colours at three
 * similarity/blend settings; every byte agrees.
 *
 * WHY WEBGL AND NOT `getImageData`. The maths is trivial in JS, but it has to
 * run on a whole clip patch every frame. A full-frame 1080×1920 clip is two
 * million pixels — a read-modify-write loop lands in the tens of milliseconds
 * and drops the preview well under 30fps, which would make keying feel broken
 * even though the numbers were right. A fragment shader does the same work in
 * well under a millisecond, on a single context reused for every clip.
 *
 * Falls back to reporting `false` when WebGL is unavailable, so the UI can hide
 * the control rather than offer an effect the preview would silently skip.
 */
import { chromaParams, type ChromaParams } from '@layera-labs/orbit-video/browser';
import type { ChromaKey } from '@layera-labs/orbit-video/browser';

const VERT = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  // A full-viewport triangle pair in clip space. The texture is uploaded with
  // UNPACK_FLIP_Y so v_uv can map straight from position.
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG = `
precision mediump float;
uniform sampler2D u_tex;
uniform vec3 u_key;
uniform float u_similarity;
uniform float u_blend;
varying vec2 v_uv;
void main() {
  vec4 c = texture2D(u_tex, v_uv);
  vec3 d = c.rgb - u_key;
  // ffmpeg: sqrt((dr^2 + dg^2 + db^2) / (255^2 * 3)), i.e. /3 in 0..1 units.
  float diff = sqrt(dot(d, d) / 3.0);
  float a = u_blend > 0.0001
    ? clamp((diff - u_similarity) / u_blend, 0.0, 1.0)
    : step(u_similarity, diff);
  // MULTIPLY, where ffmpeg overwrites. In the filtergraph colorkey runs before
  // the mask, so a masked-away pixel ends at alpha 0 either way; multiplying
  // additionally stops a keyed PNG's own transparency being made opaque.
  gl_FragColor = vec4(c.rgb, c.a * a);
}`;

interface GL {
  canvas: HTMLCanvasElement;
  gl: WebGLRenderingContext;
  program: WebGLProgram;
  texture: WebGLTexture;
  loc: {
    key: WebGLUniformLocation | null;
    similarity: WebGLUniformLocation | null;
    blend: WebGLUniformLocation | null;
  };
}

let cached: GL | null | undefined;

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const s = gl.createShader(type);
  if (!s) return null;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    gl.deleteShader(s);
    return null;
  }
  return s;
}

function setup(): GL | null {
  if (cached !== undefined) return cached;
  cached = null;
  if (typeof document === 'undefined') return null;

  const canvas = document.createElement('canvas');
  // `premultipliedAlpha: false` because colorkey produces STRAIGHT alpha —
  // untouched RGB with a reduced alpha. Letting the context premultiply would
  // darken every semi-transparent edge pixel when the result is drawn back.
  const gl = canvas.getContext('webgl', {
    premultipliedAlpha: false,
    alpha: true,
    antialias: false,
    depth: false,
    stencil: false,
  }) as WebGLRenderingContext | null;
  if (!gl) return null;

  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  const program = vs && fs ? gl.createProgram() : null;
  if (!vs || !fs || !program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW,
  );
  const pos = gl.getAttribLocation(program, 'a_pos');
  gl.enableVertexAttribArray(pos);
  gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

  const texture = gl.createTexture();
  if (!texture) return null;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  // NEAREST: the shader reads texel centres one-for-one with the destination,
  // so filtering would only blend neighbouring colours into the key distance.
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  // The patch is straight-alpha too; do not let the upload premultiply it.
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);

  cached = {
    canvas,
    gl,
    program,
    texture,
    loc: {
      key: gl.getUniformLocation(program, 'u_key'),
      similarity: gl.getUniformLocation(program, 'u_similarity'),
      blend: gl.getUniformLocation(program, 'u_blend'),
    },
  };
  return cached;
}

/** Whether this browser can key at all, so the UI can hide the control if not. */
export function cutoutIsSupported(): boolean {
  return setup() !== null;
}

/**
 * Key `patch` in place. Returns false when nothing was done, so the caller can
 * leave the clip untouched rather than show a half-applied effect.
 */
export function applyCutout(
  patch: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  cutout: ChromaKey,
  w: number,
  h: number,
): boolean {
  const p: ChromaParams | null = chromaParams(cutout);
  const g = setup();
  if (!p || !g) return false;

  const { gl } = g;
  if (g.canvas.width !== w || g.canvas.height !== h) {
    g.canvas.width = w;
    g.canvas.height = h;
  }
  gl.viewport(0, 0, w, h);
  gl.useProgram(g.program);
  gl.bindTexture(gl.TEXTURE_2D, g.texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, patch);
  gl.uniform3f(g.loc.key, p.key[0], p.key[1], p.key[2]);
  gl.uniform1f(g.loc.similarity, p.similarity);
  gl.uniform1f(g.loc.blend, p.blend);
  gl.drawArrays(gl.TRIANGLES, 0, 6);

  // `copy` replaces the patch outright — `source-over` would composite the keyed
  // result back on top of the very pixels it just made transparent.
  const prev = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'copy';
  ctx.drawImage(g.canvas, 0, 0, w, h);
  ctx.globalCompositeOperation = prev;
  return true;
}
