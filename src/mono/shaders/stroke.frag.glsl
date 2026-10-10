uniform sampler2D scene_depth;
uniform mat4 inverse_projection;
uniform vec2 viewport_size;
varying vec2 center_uv;
varying float center_depth;
varying float pixel_size;
varying float projected_width;
varying vec2 stroke_normal;
varying vec2 stroke_uv;
varying float is_cap;

void main() {
  vec2 texel = 0.5 / viewport_size;
  float depth = max(max(view_depth(center_uv + texel), view_depth(center_uv - texel)),
    max(view_depth(center_uv + vec2(texel.x, -texel.y)), view_depth(center_uv + vec2(-texel.x, texel.y))));
  if (center_depth > depth + pixel_size * 2.0) discard;
  float distance = (is_cap > 0.5 ? length(stroke_uv) : abs(stroke_uv.x)) * (projected_width * 0.5 + 1.0);
  float coverage = clamp(projected_width * 0.5 + 0.5 - distance, 0.0, 1.0);
  if (is_cap < 0.5) {
    coverage = pixel_area(projected_width * 0.5 - distance, stroke_normal)
      - pixel_area(-projected_width * 0.5 - distance, stroke_normal);
  }
  write_coverage(coverage);
}
