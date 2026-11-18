shader_type spatial;
render_mode diffuse_lambert, specular_disabled;
#include "res://material_grade.gdshaderinc"

uniform vec4 motion[24];
uniform float clock = 0.0;
uniform bool shutters = false;
varying vec3 paint;
varying flat int prop;

void vertex() {
	prop = int(round(UV.x));
	paint = COLOR.rgb;
	if (prop > 0 && prop < 24) {
		vec4 hit = motion[prop];
		if (hit.w > 0.0) {
			float t = max(0.0,clock - hit.z);
			float fall = smoothstep(0.0,0.62,t);
			vec3 pivot = vec3(UV2.x,UV.y,UV2.y);
			vec3 p = VERTEX - pivot;
			vec2 dir = normalize(hit.xy);
			vec2 axis = vec2(-dir.y,dir.x);
			float a = fall * 1.41;
			float r = dot(p.xz,dir), y = p.y;
			p.xz = dir*(r*cos(a)+y*sin(a))+axis*dot(p.xz,axis);
			p.y = max(0.04,y*cos(a)-r*sin(a));
			VERTEX = pivot+p+vec3(hit.x,0,hit.y)*fall;
		}
	}
}
void fragment() {
	if (prop == 63 && !shutters) discard;
	ALBEDO = display_color(paint);
	NORMAL = face_normal(VERTEX,VIEW);
	ROUGHNESS = 0.97;
}
