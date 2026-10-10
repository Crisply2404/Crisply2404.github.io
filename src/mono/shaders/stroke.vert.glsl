uniform vec2 viewport_size;
uniform float stroke_width;
attribute vec3 direction;
attribute float cap;
varying vec2 center_uv;
varying float center_depth;
varying float pixel_size;
varying float projected_width;
varying vec2 stroke_normal;
varying vec2 stroke_uv;
varying float is_cap;

void main() {
  vec4 center = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  vec2 offset = uv;
  stroke_normal = vec2(1.0, 0.0);
  if (cap < 0.5) {
    vec4 endpoint = projectionMatrix * modelViewMatrix * vec4(position + direction, 1.0);
    vec2 delta = (endpoint.xy / endpoint.w - center.xy / center.w) * viewport_size;
    vec2 tangent = delta / max(length(delta), 0.000001);
    stroke_normal = vec2(-tangent.y, tangent.x);
    offset = stroke_normal * uv.x;
  }
  center_uv = center.xy / center.w * 0.5 + 0.5;
  center_depth = -(modelViewMatrix * vec4(position, 1.0)).z;
  pixel_size = 2.0 / (abs(projectionMatrix[1][1]) * viewport_size.y);
  projected_width = stroke_width * length(modelMatrix[0].xyz) / pixel_size;
  gl_Position = center;
  gl_Position.xy += offset * (projected_width + 2.0) / viewport_size * center.w;
  stroke_uv = uv;
  is_cap = cap;
}
