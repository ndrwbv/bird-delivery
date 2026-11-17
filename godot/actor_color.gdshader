shader_type spatial;
render_mode cull_disabled, diffuse_lambert, specular_disabled;

#include "res://material_grade.gdshaderinc"
#include "res://street_light.gdshaderinc"

uniform bool flat_city = false;
varying vec3 paint;
varying vec3 actor_world;

void vertex() {
	paint = COLOR.rgb;
	actor_world = (MODEL_MATRIX*vec4(VERTEX,1.0)).xyz;
}

void fragment() {
	NORMAL = face_normal(VERTEX,VIEW);
	ALBEDO = display_color(paint);
	ROUGHNESS = 0.94;
	EMISSION = display_color(street_bounce(actor_world,paint,0.56));
	if (flat_city) EMISSION += ALBEDO*0.14;
}
