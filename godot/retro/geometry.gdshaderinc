global uniform float retro_snap_amount;
global uniform float retro_affine_amount;

vec4 retro_project(vec4 clip, vec2 size) {
	if (clip.w <= 0.05 || retro_snap_amount <= 0.0) return clip;
	vec2 grid = (clip.xy/clip.w*0.5+0.5)*size;
	vec2 snapped = (floor(grid+0.5)/size*2.0-1.0)*clip.w;
	return vec4(mix(clip.xy,snapped,retro_snap_amount),clip.zw);
}

vec3 retro_uv_vertex(vec2 uv, float depth) {
	return vec3(uv*max(depth,0.03),max(depth,0.03));
}

vec2 retro_uv_fragment(vec2 uv, vec3 projected_uv) {
	return mix(uv,projected_uv.xy/max(projected_uv.z,0.03),retro_affine_amount);
}
