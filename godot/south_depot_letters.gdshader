shader_type spatial;
render_mode cull_back;
uniform float level = 1.0;
uniform float glow = 0.12;
void fragment() {
	ALBEDO = COLOR.rgb * level;
	EMISSION = COLOR.rgb * level * glow;
	ROUGHNESS = 0.83;
}
