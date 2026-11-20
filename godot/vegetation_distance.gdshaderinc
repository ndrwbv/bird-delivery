uniform vec2 vegetation_distance = vec2(0.0);

bool vegetation_hidden(vec3 position, vec2 pixel) {
	if (vegetation_distance.y <= 0.0) return false;
	float d = length(position);
	if (d < vegetation_distance.x) return false;
	if (d >= vegetation_distance.y) return true;
	float threshold = fract(52.9829189 * fract(dot(floor(pixel), vec2(0.06711056, 0.00583715))));
	return threshold < smoothstep(vegetation_distance.x, vegetation_distance.y, d);
}
