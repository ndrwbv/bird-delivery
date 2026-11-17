shader_type spatial;
render_mode cull_disabled, diffuse_lambert, specular_disabled, depth_draw_never;

varying float loose;

void vertex() {
	loose = INSTANCE_CUSTOM.r;
}

void fragment() {
	float edge = 1.0-smoothstep(0.34,0.50,abs(UV.x-0.5));
	float tread = smoothstep(0.12,0.28,fract(UV.y*4.5+abs(UV.x-0.5)*1.4));
	ALBEDO = mix(vec3(0.087,0.075,0.069),vec3(0.34,0.25,0.13),loose);
	ALPHA = edge*mix(0.46,0.79,loose)*mix(0.67,1.0,tread);
}
