uniform mat4 projection;
varying vec2 graphic_position;
varying vec3 bottom_left;
varying vec3 top_left;
varying vec3 top_right;
varying vec3 bottom_right;
varying float half_width;
varying float pixel_size;

void nearest_edge(vec2 point, vec3 start, vec3 end, inout float distance, inout float depth) {
  vec2 edge = end.xy - start.xy;
  float amount = clamp(dot(point - start.xy, edge) / max(dot(edge, edge), 0.000001), 0.0, 1.0);
  float candidate = length(point - start.xy - edge * amount);
  if (candidate < distance) {
    distance = candidate;
    depth = mix(start.z, end.z, amount);
  }
}
void main() {
  float distance = 1e20;
  float depth = 0.0;
  nearest_edge(graphic_position, bottom_left, top_left, distance, depth);
  nearest_edge(graphic_position, top_left, top_right, distance, depth);
  nearest_edge(graphic_position, top_right, bottom_right, distance, depth);
  nearest_edge(graphic_position, bottom_right, bottom_left, distance, depth);
  float direction = sign(edge_side(top_right.xy, bottom_left.xy, top_left.xy));
  bool inside = direction != 0.0 && edge_side(graphic_position, bottom_left.xy, top_left.xy) * direction >= 0.0
    && edge_side(graphic_position, top_left.xy, top_right.xy) * direction >= 0.0
    && edge_side(graphic_position, top_right.xy, bottom_right.xy) * direction >= 0.0
    && edge_side(graphic_position, bottom_right.xy, bottom_left.xy) * direction >= 0.0;
  if (inside) {
    vec3 normal = cross(top_left - bottom_left, bottom_right - bottom_left);
    depth = (dot(normal, bottom_left) - dot(normal.xy, graphic_position)) / normal.z;
  }
  distance = (inside ? -distance : distance) - half_width;
  float coverage = clamp(0.5 - distance / pixel_size, 0.0, 1.0);
  if (coverage == 0.0) discard;
  vec4 projected = projection * vec4(graphic_position, depth, 1.0);
  gl_FragDepth = projected.z / projected.w * 0.5 + 0.5;
  gl_FragColor = vec4(vec3(coverage), 1.0);
}
