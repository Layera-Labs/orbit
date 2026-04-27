export const adjustmentVertexShader = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  varying vec2 v_texCoord;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_texCoord;
  }
`;

export const adjustmentFragmentShader = `
  precision mediump float;
  varying vec2 v_texCoord;
  uniform sampler2D u_image;
  uniform float u_brightness;
  uniform float u_contrast;
  uniform float u_saturation;
  uniform float u_temperature;

  void main() {
    vec4 color = texture2D(u_image, v_texCoord);

    // Brightness
    color.rgb += u_brightness;

    // Contrast
    color.rgb = (color.rgb - 0.5) * u_contrast + 0.5;

    // Saturation
    float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
    color.rgb = mix(vec3(gray), color.rgb, u_saturation);

    // Color Temperature
    color.r += u_temperature;
    color.b -= u_temperature;

    gl_FragColor = clamp(color, 0.0, 1.0);
  }
`;

export const lightingVertexShader = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;
  varying vec2 v_texCoord;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_texCoord;
  }
`;

export const lightingFragmentShader = `
  precision mediump float;
  varying vec2 v_texCoord;
  uniform sampler2D u_image;
  uniform sampler2D u_normalMap;
  uniform vec3 u_lights[4];
  uniform vec3 u_lightColors[4];
  uniform float u_lightBrightness[4];

  void main() {
    vec4 color = texture2D(u_image, v_texCoord);
    vec3 normal = texture2D(u_normalMap, v_texCoord).rgb * 2.0 - 1.0;

    vec3 lighting = vec3(0.0);
    for (int i = 0; i < 4; i++) {
      vec3 lightDir = normalize(u_lights[i]);
      float diff = max(dot(normal, lightDir), 0.0);
      lighting += u_lightColors[i] * diff * u_lightBrightness[i];
    }

    color.rgb *= lighting;
    gl_FragColor = color;
  }
`;
