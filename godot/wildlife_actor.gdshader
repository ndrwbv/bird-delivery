shader_type spatial;
render_mode cull_disabled, diffuse_lambert, specular_disabled;
#include "res://material_grade.gdshaderinc"
uniform float stride = 0;
uniform float cadence = 3;
uniform float offset = 0;
varying vec3 paint;
void vertex(){
	float a=UV2.x*stride*sin(TIME*cadence+offset);
	vec2 p=VERTEX.yz-UV;
	VERTEX.yz=mat2(vec2(cos(a),sin(a)),vec2(-sin(a),cos(a)))*p+UV;
	paint=COLOR.rgb;
}
void fragment(){
	NORMAL=face_normal(VERTEX,VIEW);
	ALBEDO=display_color(paint);
	ROUGHNESS=1.0;
}
