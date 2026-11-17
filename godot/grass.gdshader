shader_type spatial;
render_mode cull_disabled, diffuse_lambert, specular_disabled, world_vertex_coords;

#include "res://material_grade.gdshaderinc"
#include "res://street_light.gdshaderinc"

varying vec3 paint;
varying vec3 ground;

void vertex() {
	paint = COLOR.rgb;
	ground = VERTEX;
	float sweep = sin(VERTEX.x*0.26+VERTEX.z*0.31+TIME*2.1);
	float tremor = sin(VERTEX.x*4.7-VERTEX.z*3.9+TIME*3.5)*0.22;
	VERTEX.xz += vec2(0.096,0.041)*(sweep+tremor)*COLOR.a;
}

void fragment() {
	NORMAL = normalize(VIEW_MATRIX[1].xyz*0.7 + face_normal(VERTEX,VIEW)*0.30);
	ALBEDO = display_color(paint);
	EMISSION = display_color(street_bounce(ground,paint,0.74));
	ROUGHNESS = 1.0;
}
