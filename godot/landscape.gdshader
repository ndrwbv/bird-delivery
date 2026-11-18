shader_type spatial;
render_mode cull_disabled, diffuse_lambert, specular_disabled;

#include "res://material_grade.gdshaderinc"
#include "res://season_tint.gdshaderinc"
#include "res://quick_damage.gdshaderinc"
#include "res://core_bounds.gdshaderinc"
#include "res://street_light.gdshaderinc"

uniform float ground_wetness = 0.0;

varying vec3 soil;
varying vec3 ground;

float hash(vec2 p) {
	vec3 q = fract(vec3(p.xyx)*0.1031);
	q += dot(q,q.yzx+33.33);
	return fract((q.x+q.y)*q.z);
}

float mottling(vec2 p) {
	vec2 cell = floor(p);
	vec2 f = smoothstep(vec2(0.0),vec2(1.0),fract(p));
	return mix(mix(hash(cell),hash(cell+vec2(1,0)),f.x),
		mix(hash(cell+vec2(0,1)),hash(cell+vec2(1,1)),f.x),f.y);
}

void vertex() {
	soil = COLOR.rgb;
	ground = (MODEL_MATRIX*vec4(VERTEX,1.0)).xyz;
}

void fragment() {
	if (quick_cut(ground)) discard;
	if (outside_core(ground.xz)) discard;
	vec2 world = ground.xz;
	float range = length(VERTEX);
	float close = 1.0-smoothstep(22.0,78.0,range);
	float mottled = mottling(world*0.76)*0.66+mottling(world*2.6)*0.34;
	float bare = smoothstep(0.22,0.82,soil.x+(mottled-0.5)*0.21);
	vec3 grass = mix(vec3(0.044,0.089,0.023),vec3(0.160,0.219,0.059),soil.z);
	grass *= 0.76+0.52*mottled;
	vec3 dirt = mix(vec3(0.151,0.076,0.031),vec3(0.385,0.280,0.146),soil.y);
	dirt *= 0.81+0.38*mottled;
	float grit = hash(floor(world*39.0))-0.5;
	float grain = close*(1.0-smoothstep(0.025,0.1,length(fwidth(world))));
	float pebbles = smoothstep(0.88,0.99,hash(floor(world*13.0)));
	vec3 color = mix(seasonal_grass(grass),dirt,bare)*(1.0+grain*grit*0.22+grain*bare*pebbles*0.18);
	NORMAL = face_normal(VERTEX,VIEW);
	color *= 1.0-ground_wetness*(0.15+bare*0.14);
	color = seasonal_soil(color,world,0.0);
	ALBEDO = display_color(color);
	EMISSION = display_color(street_bounce(ground,color,1.0));
	ROUGHNESS = 1.0;
}
