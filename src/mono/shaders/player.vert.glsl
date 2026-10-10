uniform vec2 viewport_size;
uniform float radius;
uniform float stroke_width;
varying vec2 circle_position;
varying vec3 circle_center_view;
varying float circle_scale;
varying float circle_pixel_size;

void main() {
  circle_scale = length(modelMatrix[0].xyz);
  circle_center_view = (modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  circle_pixel_size = 2.0 / (abs(projectionMatrix[1][1]) * viewport_size.y * circle_scale);
  float extent = radius + stroke_width * 0.5 + circle_pixel_size * 1.5;
  circle_position = position.xy * extent / radius;
  gl_Position = projectionMatrix * vec4(circle_center_view.xy + circle_position * circle_scale, circle_center_view.z, 1.0);
}
