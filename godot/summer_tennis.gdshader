shader_type spatial;
render_mode cull_disabled, diffuse_lambert, specular_disabled;

void fragment() {
	vec2 cell = 2. * vec2(UV.x + UV.y, UV.x - UV.y);
	vec2 line = abs(fract(cell + .5) - .5) / max(fwidth(cell), vec2(.001));
	if (min(line.x, line.y) > .65) discard;
	ALBEDO = COLOR.rgb;
	ROUGHNESS = .94;
}
