shader_type spatial;
render_mode cull_disabled, diffuse_lambert, specular_disabled;
#include "res://material_grade.gdshaderinc"
#include "res://quick_damage.gdshaderinc"

uniform vec4 clip_zone;
uniform float winter = 1.0;
varying vec3 point;
varying vec2 lane;
varying vec2 service;
varying float fade;
varying float clearance;

float grit(vec2 p) {
	vec3 h = fract(vec3(p.xyx)*0.1031);
	h += dot(h,h.yzx+33.33);
	return fract((h.x+h.y)*h.z);
}
void vertex() {
	VERTEX.y -= COLOR.b*(1.0-winter);
	point = (MODEL_MATRIX*vec4(VERTEX,1.0)).xyz;
	lane = UV;
	service = UV2;
	fade = COLOR.r;
	clearance = COLOR.g;
}
void fragment() {
	if (point.x<clip_zone.x || point.z<clip_zone.y || point.x>=clip_zone.z || point.z>=clip_zone.w || quick_cut(point)) discard;
	float speck = grit(floor(point.xz*12.0));
	float edge = smoothstep(0.0,0.45,lane.y-abs(lane.x));
	float clarity = service.x;
	vec3 base;
	float cover = winter;
	if (clarity < 2.5) {
		float num = max(1.0,service.y);
		float width = lane.y*2.0/num;
		float lateral = mod(lane.x+lane.y,width)-0.5*width;
		float wheel = min(0.78,width/2.8);
		float half_band = min(clarity>1.5 ? 0.20 : 0.29,width*0.12);
		float dist = abs(abs(lateral)-wheel);
		float aa = max(0.012,min(0.18,fwidth(lateral)*0.7));
		float rut = 1.0-smoothstep(0.0,half_band+aa,dist);
		rut *= fade*(0.9+speck*0.1);
		if (clarity>1.5) {
			cover *= rut*0.72;
			base = mix(vec3(0.337,0.373,0.404),vec3(0.439,0.482,0.510),rut);
		} else {
			cover *= edge*clearance;
			base = mix(vec3(0.710,0.753,0.776),vec3(0.529,0.576,0.604),rut);
			if (clarity>0.5) base = mix(base,vec3(0.48,0.41,0.31),smoothstep(0.72,1.0,speck)*0.30*edge);
		}
	} else {
		base = vec3(0.77,0.81,0.83)*(0.96+0.04*speck);
	}
	if (cover<0.005 || (cover<0.99 && grit(floor(point.xz*24.0))>cover)) discard;
	NORMAL = face_normal(VERTEX,VIEW);
	ALBEDO = OUTPUT_IS_SRGB ? base : mix(base/12.92,pow((base+0.055)/1.055,vec3(2.4)),step(vec3(0.04045),base));
	ROUGHNESS = 0.93;
}
