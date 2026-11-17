uniform sampler2D street_field : filter_linear, repeat_disable;
uniform vec4 street_field_bounds = vec4(0.0,0.0,1.0,1.0);
uniform float street_night = 0.0;

vec3 street_bounce(vec3 position, vec3 pigment, float upward) {
	if (street_night <= 0.0) return vec3(0.0);
	vec2 uv = (position.xz-street_field_bounds.xy)/street_field_bounds.zw;
	if (any(lessThan(uv,vec2(0.0))) || any(greaterThan(uv,vec2(1.0)))) return vec3(0.0);
	vec2 sample_value = texture(street_field,uv).rg;
	float height = position.y-(sample_value.g*70.0-28.0);
	float surface = (1.0-smoothstep(0.6,7.4,height))*smoothstep(-1.5,-0.27,height);
	float strength = street_night*sample_value.r*surface*mix(0.62,1.0,upward);
	return (pigment*1.92+vec3(0.013,0.011,0.010))*vec3(1.0,0.71,0.46)*strength;
}
