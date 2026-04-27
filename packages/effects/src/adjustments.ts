/**
 * WebGL Image Adjustment Renderer
 * Applies brightness, contrast, saturation, and color temperature
 */

import {
  adjustmentVertexShader,
  adjustmentFragmentShader,
} from './shaders';

export interface AdjustmentValues {
  brightness: number;   // -1 to 1
  contrast: number;     // 0 to 2
  saturation: number;   // 0 to 2
  temperature: number;  // -1 to 1
}

export const DEFAULT_ADJUSTMENTS: AdjustmentValues = {
  brightness: 0,
  contrast: 1,
  saturation: 1,
  temperature: 0,
};

function createShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Shader compile error:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext, vs: WebGLShader, fs: WebGLShader): WebGLProgram | null {
  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

export class AdjustmentRenderer {
  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext;
  private program: WebGLProgram;
  private positionBuffer: WebGLBuffer;
  private texCoordBuffer: WebGLBuffer;
  private texture: WebGLTexture | null = null;

  private loc: {
    position: number;
    texCoord: number;
    image: WebGLUniformLocation | null;
    brightness: WebGLUniformLocation | null;
    contrast: WebGLUniformLocation | null;
    saturation: WebGLUniformLocation | null;
    temperature: WebGLUniformLocation | null;
  };

  constructor(width = 512, height = 512) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;

    const gl = this.canvas.getContext('webgl', { premultipliedAlpha: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL not supported');
    this.gl = gl;

    const vs = createShader(gl, gl.VERTEX_SHADER, adjustmentVertexShader);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, adjustmentFragmentShader);
    if (!vs || !fs) throw new Error('Failed to compile shaders');

    const program = createProgram(gl, vs, fs);
    if (!program) throw new Error('Failed to link program');
    this.program = program;

    // Look up attribute/uniform locations
    this.loc = {
      position: gl.getAttribLocation(program, 'a_position'),
      texCoord: gl.getAttribLocation(program, 'a_texCoord'),
      image: gl.getUniformLocation(program, 'u_image'),
      brightness: gl.getUniformLocation(program, 'u_brightness'),
      contrast: gl.getUniformLocation(program, 'u_contrast'),
      saturation: gl.getUniformLocation(program, 'u_saturation'),
      temperature: gl.getUniformLocation(program, 'u_temperature'),
    };

    // Create buffers
    this.positionBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
      -1,  1,
       1, -1,
       1,  1,
    ]), gl.STATIC_DRAW);

    this.texCoordBuffer = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      0, 0,
      1, 0,
      0, 1,
      0, 1,
      1, 0,
      1, 1,
    ]), gl.STATIC_DRAW);

    gl.useProgram(program);

    // Set up attribute pointers
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.enableVertexAttribArray(this.loc.position);
    gl.vertexAttribPointer(this.loc.position, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.texCoordBuffer);
    gl.enableVertexAttribArray(this.loc.texCoord);
    gl.vertexAttribPointer(this.loc.texCoord, 2, gl.FLOAT, false, 0, 0);
  }

  setSize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
    this.gl.viewport(0, 0, width, height);
  }

  loadImage(source: HTMLImageElement | HTMLCanvasElement | ImageBitmap): void {
    const gl = this.gl;

    if (this.texture) {
      gl.deleteTexture(this.texture);
    }

    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    this.setSize(source.width, source.height);
  }

  render(values: AdjustmentValues): ImageData {
    const gl = this.gl;

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.uniform1i(this.loc.image, 0);
    gl.uniform1f(this.loc.brightness, values.brightness);
    gl.uniform1f(this.loc.contrast, values.contrast);
    gl.uniform1f(this.loc.saturation, values.saturation);
    gl.uniform1f(this.loc.temperature, values.temperature);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    const pixels = new Uint8ClampedArray(this.canvas.width * this.canvas.height * 4);
    gl.readPixels(0, 0, this.canvas.width, this.canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    return new ImageData(pixels, this.canvas.width, this.canvas.height);
  }

  renderToDataURL(values: AdjustmentValues, type = 'image/png', quality?: number): string {
    this.render(values);
    // Flip vertically since WebGL's origin is bottom-left
    const flipped = this.flipY();
    const ctx = flipped.getContext('2d')!;
    const imageData = ctx.getImageData(0, 0, flipped.width, flipped.height);
    ctx.putImageData(imageData, 0, 0);
    return flipped.toDataURL(type, quality);
  }

  private flipY(): HTMLCanvasElement {
    const flipped = document.createElement('canvas');
    flipped.width = this.canvas.width;
    flipped.height = this.canvas.height;
    const ctx = flipped.getContext('2d')!;
    ctx.translate(0, flipped.height);
    ctx.scale(1, -1);
    ctx.drawImage(this.canvas, 0, 0);
    return flipped;
  }

  destroy(): void {
    const gl = this.gl;
    if (this.texture) gl.deleteTexture(this.texture);
    gl.deleteBuffer(this.positionBuffer);
    gl.deleteBuffer(this.texCoordBuffer);
    gl.deleteProgram(this.program);
  }
}
