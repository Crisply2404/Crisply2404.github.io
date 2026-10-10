uniform vec2 viewport_size;
uniform float stroke_width;
varying vec2 graphic_position;
varying vec2 pole_start;
varying vec2 flag_top;
varying vec2 flag_tip;
varying vec2 flag_lower;
varying float graphic_depth;
varying float pixel_size;
varying float half_width;

void main() {
  vec2 corner = sign(position.xy);
  pixel_size = 2.0 / (abs(projectionMatrix[1][1]) * viewport_size.y);
  half_width = stroke_width * length(modelMatrix[0].xyz) * 0.5;
  float margin = half_width + pixel_size * 2.0;
  vec3 vertex = position;
  vertex.xy += vec2(8.5, 15.0) + corner * margin / vec2(length(modelViewMatrix[0].xyz), length(modelViewMatrix[1].xyz));
  vec4 view = modelViewMatrix * vec4(vertex, 1.0);
  graphic_position = view.xy;
  graphic_depth = -view.z;
  pole_start = (modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xy;
  flag_top = (modelViewMatrix * vec4(0.0, 30.0, 0.0, 1.0)).xy;
  flag_tip = (modelViewMatrix * vec4(17.0, 25.0, 0.0, 1.0)).xy;
  flag_lower = (modelViewMatrix * vec4(0.0, 19.0, 0.0, 1.0)).xy;
  gl_Position = projectionMatrix * view;
}
