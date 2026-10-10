uniform float radius;
uniform float stroke_width;
uniform sampler2D scene_depth;
uniform mat4 inverse_projection;
uniform mat4 projection;
varying vec2 circle_position;
varying vec3 circle_center_view;
varying float circle_scale;
varying float circle_pixel_size;
uniform vec2 viewport_size;

void main() {
  float surface_depth = -circle_center_view.z - sqrt(max(radius * radius - dot(circle_position, circle_position), 0.0)) * circle_scale;
#ifndef PLAYER_OUTLINE
    if (dot(circle_position, circle_position) > radius * radius) discard;
    vec4 projected = projection * vec4(circle_center_view.xy + circle_position * circle_scale, -surface_depth, 1.0);
    gl_FragDepth = projected.z / projected.w * 0.5 + 0.5;
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
#else
  float radial_distance = length(circle_position);
  float distance = (radial_distance - radius) / circle_pixel_size;
  float half_width = stroke_width * 0.5 / circle_pixel_size;
  if (abs(distance) > half_width + 1.0) discard;
  vec2 normal = circle_position / radial_distance;
  float coverage = pixel_area(half_width - distance, normal) - pixel_area(-half_width - distance, normal);
  if (surface_depth > view_depth(gl_FragCoord.xy / viewport_size) + circle_pixel_size * circle_scale * 0.05) discard;
  write_coverage(coverage);
#endif
}
