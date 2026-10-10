float pixel_area(float distance, vec2 normal) {
  vec2 size = abs(normal);
  if (min(size.x, size.y) < 0.00001) {
    return clamp(distance / max(size.x, size.y) + 0.5, 0.0, 1.0);
  }
  float position = distance + (size.x + size.y) * 0.5;
  vec4 terms = max(vec4(position, position - size.x, position - size.y, position - size.x - size.y), vec4(0.0));
  terms *= terms;
  return clamp((terms.x - terms.y - terms.z + terms.w) / (2.0 * size.x * size.y), 0.0, 1.0);
}

float view_depth(vec2 position) {
  float depth = texture2D(scene_depth, position).r;
  vec4 view = inverse_projection * vec4(vec3(position, depth) * 2.0 - 1.0, 1.0);
  return -view.z / view.w;
}

void write_coverage(float coverage) {
  if (coverage <= 0.0) discard;
  coverage = floor(coverage * 255.0 + 0.5) / 255.0;
  // Three.js 使用较小深度通过检测，交汇处保留最高覆盖率。
  gl_FragDepth = (1.0 - coverage) * 0.001;
  gl_FragColor = vec4(vec3(coverage), 1.0);
}
