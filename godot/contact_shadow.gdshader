shader_type spatial;
render_mode unshaded, cull_disabled, shadows_disabled, depth_draw_never;

void fragment() {
	vec2 p = (UV - vec2(0.5)) * 2.0;
	ALBEDO = vec3(0.055, 0.065, 0.04);
	ALPHA = (1.0 - smoothstep(0.18, 1.0, dot(p,p))) * 0.59;
}
