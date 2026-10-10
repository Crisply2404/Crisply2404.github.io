uniform vec2 viewport_size;
uniform float stroke_width;
uniform vec2 panel_size;
varying vec2 graphic_position;
varying vec3 bottom_left;
varying vec3 top_left;
varying vec3 top_right;
varying vec3 bottom_right;
varying float half_width;
varying float pixel_size;

void main() {
  vec2 half_size = panel_size * 0.5;
  pixel_size = 2.0 / (abs(projectionMatrix[1][1]) * viewport_size.y);
  half_width = stroke_width * length(modelMatrix[0].xyz) * 0.5;
  bottom_left = (modelViewMatrix * vec4(-half_size.x, -half_size.y, 0.0, 1.0)).xyz;
  top_left = (modelViewMatrix * vec4(-half_size.x, half_size.y, 0.0, 1.0)).xyz;
  top_right = (modelViewMatrix * vec4(half_size.x, half_size.y, 0.0, 1.0)).xyz;
  bottom_right = (modelViewMatrix * vec4(half_size.x, -half_size.y, 0.0, 1.0)).xyz;
  vec2 minimum = min(min(bottom_left.xy, top_left.xy), min(top_right.xy, bottom_right.xy));
  vec2 maximum = max(max(bottom_left.xy, top_left.xy), max(top_right.xy, bottom_right.xy));
  vec2 view_point = mix(minimum, maximum, uv);
  view_point += sign(position.xy) * (half_width + pixel_size * 2.0);
  graphic_position = view_point;
  gl_Position = projectionMatrix * vec4(view_point, (bottom_left.z + top_right.z) * 0.5, 1.0);
}
