shader_type spatial;
render_mode cull_disabled, diffuse_lambert, specular_disabled;

#include "res://material_grade.gdshaderinc"
#include "res://quick_damage.gdshaderinc"
#include "res://street_light.gdshaderinc"
varying vec3 tint;
varying vec3 world;

void vertex(){
	world=(MODEL_MATRIX*vec4(VERTEX,1.0)).xyz;
	tint=COLOR.r>.8 ? INSTANCE_CUSTOM.rgb : COLOR.rgb;
}
void fragment(){
	if(quick_cut(world))discard;
	ALBEDO=display_color(tint);
	ROUGHNESS=.92;
	EMISSION=display_color(street_bounce(world,tint,.4));
}
