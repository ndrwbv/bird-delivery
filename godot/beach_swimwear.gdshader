shader_type spatial;
render_mode cull_disabled, diffuse_lambert, specular_disabled;

#include "res://material_grade.gdshaderinc"
#include "res://street_light.gdshaderinc"

uniform vec3 original_top;
uniform vec3 skin;
uniform vec3 swimsuit;
uniform bool female;
varying vec3 paint;
varying vec3 world;

void vertex() {
	paint = COLOR.rgb;
	bool face_or_hair = VERTEX.y > 1.46;
	bool uncovered = distance(paint,skin) < 0.012;
	if (!face_or_hair && !uncovered) {
		if (VERTEX.y < 0.67) paint = skin;
		else if (VERTEX.y < 0.93) paint = swimsuit;
		else if (VERTEX.y < 1.48) {
			if (!female) paint = skin;
			else if (abs(VERTEX.x) < 0.19 || distance(paint,original_top)<0.012) paint = swimsuit;
			else paint = skin;
		}
	}
	world = (MODEL_MATRIX*vec4(VERTEX,1.0)).xyz;
}

void fragment() {
	NORMAL = face_normal(VERTEX,VIEW);
	ALBEDO = display_color(paint);
	EMISSION = display_color(street_bounce(world,paint,0.56));
	ROUGHNESS = 0.94;
}
