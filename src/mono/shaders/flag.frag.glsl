uniform sampler2D scene_depth;
uniform mat4 inverse_projection;
uniform vec2 viewport_size;
uniform bool filled;
varying vec2 graphic_position;
varying vec2 pole_start;
varying vec2 flag_top;
varying vec2 flag_tip;
varying vec2 flag_lower;
varying float graphic_depth;
varying float pixel_size;
varying float half_width;

void main() {
  if (graphic_depth > view_depth(gl_FragCoord.xy / viewport_size) + pixel_size * 0.1) discard;
  float flag_distance = triangle_distance(graphic_position, flag_top, flag_tip, flag_lower);
  float outline_distance = filled ? flag_distance : abs(flag_distance);
  float distance = min(outline_distance, segment_distance(graphic_position, pole_start, flag_top)) - half_width;
  write_coverage(clamp(0.5 - distance / pixel_size, 0.0, 1.0));
}
