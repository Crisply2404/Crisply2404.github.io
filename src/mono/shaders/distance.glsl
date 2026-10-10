float segment_distance(vec2 point, vec2 start, vec2 end) {
  vec2 edge = end - start;
  float amount = clamp(dot(point - start, edge) / max(dot(edge, edge), 0.000001), 0.0, 1.0);
  return length(point - start - edge * amount);
}
float edge_side(vec2 point, vec2 start, vec2 end) {
  vec2 edge = end - start;
  vec2 offset = point - start;
  return edge.x * offset.y - edge.y * offset.x;
}
float triangle_distance(vec2 point, vec2 a, vec2 b, vec2 c) {
  float distance = min(segment_distance(point, a, b), min(segment_distance(point, b, c), segment_distance(point, c, a)));
  float direction = sign(edge_side(c, a, b));
  bool inside = edge_side(point, a, b) * direction >= 0.0 && edge_side(point, b, c) * direction >= 0.0
    && edge_side(point, c, a) * direction >= 0.0;
  return inside ? -distance : distance;
}
