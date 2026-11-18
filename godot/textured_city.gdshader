shader_type spatial;
render_mode cull_disabled, diffuse_lambert, specular_disabled;

#include "res://material_grade.gdshaderinc"
#include "res://quick_damage.gdshaderinc"
#include "res://core_bounds.gdshaderinc"

uniform sampler2D prop_mask : filter_nearest, repeat_disable;
uniform bool dynamic_props = false;

uniform sampler2D surface_map : source_color, filter_nearest_mipmap;
uniform float cutoff = 0.35;
uniform bool punched = false;

varying vec2 baked_xz;
varying float quick_y;

void vertex() {
	quick_y = (MODEL_MATRIX * vec4(VERTEX,1.0)).y;
	baked_xz = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xz;
	if (dynamic_props && textureLod(prop_mask,UV2,0.0).r > 0.5) {
		VERTEX.y -= 1600.0;
	}
}

void fragment() {
	if (quick_cut(vec3(baked_xz.x, quick_y, baked_xz.y))) discard;
	if (outside_core(baked_xz)) discard;
	vec4 surface = texture(surface_map,UV);
	if (punched && surface.a < cutoff) {
		discard;
	}
	NORMAL = face_normal(VERTEX,VIEW);
	ALBEDO = surface.rgb;
	ROUGHNESS = 1.0;
	EMISSION = surface.rgb*0.12;
}
