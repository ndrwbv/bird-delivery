// Steam's local cut map follows the car. R clips above a collapsed floor, G below a crater lip.
uniform bool quick_cut_enabled = false;
uniform sampler2D quick_cut_map : filter_nearest, repeat_disable;
uniform vec2 quick_cut_origin;
bool quick_cut(vec3 world_at) {
	if (!quick_cut_enabled) return false;
	vec2 uv = (world_at.xz - quick_cut_origin) / 420.0;
	if (any(lessThan(uv,vec2(0.0))) || any(greaterThanEqual(uv,vec2(1.0)))) return false;
	vec2 levels = texture(quick_cut_map,uv).rg;
	return (levels.r > 0.001 && world_at.y > levels.r * 190.0 - 65.0) ||
		(levels.g > 0.001 && world_at.y < levels.g * 190.0 - 65.0);
}
