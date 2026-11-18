shader_type spatial;
render_mode cull_disabled, diffuse_lambert, specular_disabled;

#include "res://material_grade.gdshaderinc"
#include "res://season_tint.gdshaderinc"
#include "res://quick_damage.gdshaderinc"

varying vec3 world;

void vertex() {
	world = (MODEL_MATRIX*vec4(VERTEX,1.0)).xyz;
}

void fragment() {
	if (quick_cut(world)) discard;
	ALBEDO = display_color(seasonal_soil(COLOR.rgb,world.xz,0.0));
	ROUGHNESS = 1.0;
}
