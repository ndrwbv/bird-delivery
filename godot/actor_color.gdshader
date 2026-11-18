shader_type spatial;
render_mode cull_disabled, diffuse_lambert, specular_disabled;

#include "res://material_grade.gdshaderinc"
#include "res://quick_damage.gdshaderinc"
#include "res://core_bounds.gdshaderinc"
#include "res://street_light.gdshaderinc"

uniform bool flat_city = false;
uniform bool change_shirt = false;
uniform vec3 original_shirt;
uniform vec3 new_shirt;
uniform bool change_trousers = false;
uniform vec3 original_trousers;
uniform vec3 new_trousers;
varying vec3 paint;
varying vec3 actor_world;

void vertex() {
	paint = COLOR.rgb;
	if (change_shirt && distance(paint,original_shirt) < 0.012) paint = new_shirt;
	if (change_trousers && distance(paint,original_trousers) < 0.009) paint = new_trousers;
	actor_world = (MODEL_MATRIX*vec4(VERTEX,1.0)).xyz;
}

void fragment() {
	if (flat_city && quick_cut(actor_world)) discard;
	if (outside_core(actor_world.xz)) discard;
	NORMAL = face_normal(VERTEX,VIEW);
	ALBEDO = display_color(paint);
	ROUGHNESS = 0.94;
	EMISSION = display_color(street_bounce(actor_world,paint,0.56));
	if (flat_city) EMISSION += ALBEDO*0.14;
}
