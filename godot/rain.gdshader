shader_type spatial;
render_mode unshaded, cull_disabled, shadows_disabled, depth_draw_never, fog_disabled;

uniform float rain_amount = 0.0;
varying float opacity;

void vertex() {
	vec4 seed = INSTANCE_CUSTOM;
	float t = TIME * (0.83 + seed.w * 0.39);
	float height = fract(seed.y - t) * 28.0;
	vec3 drop = vec3(fract(seed.x + 0.085 * t) * 52.0 - 26.0, height, seed.z * 52.0 - 26.0);
	VERTEX += drop + vec3(VERTEX.y * 0.26, 0.0, 0.0);
	opacity = (1.0 - smoothstep(12.0, 26.0, length(drop.xz))) * smoothstep(0.0, 0.8, height);
}

void fragment() {
	ALBEDO = vec3(0.72, 0.81, 0.89);
	ALPHA = rain_amount * opacity * (1.0 - abs(2.0 * UV.y - 1.0)) * 0.58;
}
