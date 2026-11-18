shader_type spatial;
render_mode cull_disabled, diffuse_lambert, specular_disabled;

uniform sampler2D sheet : source_color, filter_nearest, repeat_disable;
instance uniform int tile=0;
instance uniform float coverage=1.0;

void fragment() {
	vec2 uv=clamp(UV,vec2(.001),vec2(.999));
	vec2 atlas=(uv+vec2(float(tile%4),float(tile/4)))*.25;
	vec4 ink=texture(sheet,atlas);
	float col=floor(uv.x*16.);
	float vertical=floor(uv.y*16.)/16.;
	float stroke=(col+(mod(col,2.)<1. ? vertical : 1.-vertical))/16.;
	if (ink.a<.5 || stroke>coverage) discard;
	ALBEDO=ink.rgb;
	ROUGHNESS=.96;
}
