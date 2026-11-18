// Shared shaders also paint moving objects. Only baked city materials set this uniform.
uniform vec4 core_bounds = vec4(-1e8, -1e8, 1e8, 1e8);

bool outside_core(vec2 at) {
	return any(lessThan(at, core_bounds.xy)) || any(greaterThan(at, core_bounds.zw));
}
