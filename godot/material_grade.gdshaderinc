vec3 display_color(vec3 color) {
	return OUTPUT_IS_SRGB ? mix(color * 12.92, 1.055 * pow(max(vec3(0.0),color),vec3(1.0/2.4))-0.055,
		step(vec3(0.0031308),color)) : color;
}

vec3 face_normal(vec3 p, vec3 viewer) {
	vec3 n = normalize(cross(dFdx(p), dFdy(p)));
	return dot(n,viewer) < 0.0 ? -n : n;
}
