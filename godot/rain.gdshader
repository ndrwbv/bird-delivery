shader_type spatial;
render_mode unshaded, cull_disabled, shadows_disabled, depth_draw_never, fog_disabled;

uniform float rain_amount = 0.0;
uniform bool snowfall = false;
uniform vec2 crosswind = vec2(0.0);
varying float opacity;

void vertex() {
	vec4 seed = INSTANCE_CUSTOM;
	float t = TIME * (snowfall ? 0.064+0.058*seed.w : 0.83+0.39*seed.w);
	float height = fract(seed.y-t)*28.0;
	vec2 drift = t*(vec2(0.085,0.0)+crosswind*(snowfall?0.62:0.33));
	vec2 offset = fract(seed.xz+drift)*52.0-26.0;
	vec2 relative = offset-(INV_VIEW_MATRIX[3].xz-MODEL_MATRIX[3].xz);
	vec3 location = vec3(offset.x,height,offset.y);
	vec3 axis = normalize(vec3(INV_VIEW_MATRIX[0].x,0.0,INV_VIEW_MATRIX[0].z));
	if (snowfall) {
		location.xz += vec2(sin(TIME+seed.z*67.0),cos(TIME*0.7+seed.x*79.0))*(0.15+0.25*seed.w);
		VERTEX = location + axis*VERTEX.x*(2.8+seed.w*4.0) + INV_VIEW_MATRIX[1].xyz*VERTEX.y*(0.06+0.11*seed.w);
	} else {
		VERTEX = location + axis*VERTEX.x + vec3(VERTEX.y*(0.26+crosswind.x),VERTEX.y,VERTEX.y*crosswind.y);
	}
	opacity = (1.0-smoothstep(12.0,26.0,length(relative)))*smoothstep(0.0,0.8,height);
}

void fragment() {
	vec2 q = 2.0*UV-1.0;
	float silhouette = snowfall ? (1.0-smoothstep(0.15,1.0,length(q))) : (1.0-abs(q.y));
	ALBEDO = snowfall ? vec3(0.95,0.96,0.98) : vec3(0.72,0.81,0.89);
	ALPHA = rain_amount*opacity*silhouette*(snowfall?0.92:0.58);
}
