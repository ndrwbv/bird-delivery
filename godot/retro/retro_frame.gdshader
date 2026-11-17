shader_type canvas_item;
render_mode unshaded;

uniform bool ps2 = false;

float threshold(vec2 at) {
	vec2 p = mod(at,4.0);
	if (p.y < 1.0) return p.x < 1.0 ? 0.0 : p.x < 2.0 ? 8.0 : p.x < 3.0 ? 2.0 : 10.0;
	if (p.y < 2.0) return p.x < 1.0 ? 12.0 : p.x < 2.0 ? 4.0 : p.x < 3.0 ? 14.0 : 6.0;
	if (p.y < 3.0) return p.x < 1.0 ? 3.0 : p.x < 2.0 ? 11.0 : p.x < 3.0 ? 1.0 : 9.0;
	return p.x < 1.0 ? 15.0 : p.x < 2.0 ? 7.0 : p.x < 3.0 ? 13.0 : 5.0;
}

void fragment() {
	vec2 pixel = floor(UV/TEXTURE_PIXEL_SIZE);
	vec3 src = texture(TEXTURE,(pixel+0.5)*TEXTURE_PIXEL_SIZE).rgb;
	float luma = dot(src,vec3(0.2126,0.7152,0.0722));
	vec3 muted = mix(vec3(luma),src,ps2 ? 0.92 : 0.84);
	vec3 tint = mix(vec3(0.98,0.994,1.085),vec3(1.073,1.015,0.898),smoothstep(0.28,0.79,luma));
	vec3 grade = clamp(muted*tint*(ps2 ? 1.018 : 1.04)+vec3(0.013,0.004,-0.004),0.0,1.0);
	float levels = ps2 ? 63.0 : 31.0;
	float dither = (threshold(pixel)-7.5)/16.0;
	COLOR = vec4(clamp(floor(grade*levels+0.5+dither*(ps2 ? 0.35 : 0.79))/levels,0.0,1.0),1.0);
}
