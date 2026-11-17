shader_type spatial;
render_mode cull_disabled, diffuse_lambert, specular_disabled;

#include "res://retro/geometry.gdshaderinc"

#include "res://material_grade.gdshaderinc"

uniform sampler2D prop_mask : filter_nearest, repeat_disable;
uniform bool dynamic_props = false;

uniform sampler2D surface_map : source_color, filter_nearest_mipmap;
uniform float cutoff = 0.35;
uniform bool punched = false;

varying vec3 affine_uv;

void vertex() {
	if (dynamic_props && textureLod(prop_mask,UV2,0.0).r > 0.5) {
		VERTEX.y -= 1600.0;
	}
	vec4 retro_clip = PROJECTION_MATRIX*MODELVIEW_MATRIX*vec4(VERTEX,1.0);
	POSITION = retro_project(retro_clip,VIEWPORT_SIZE);
	affine_uv = retro_uv_vertex(UV,retro_clip.w);
}

void fragment() {
	vec4 surface = texture(surface_map,retro_uv_fragment(UV,affine_uv));
	if (punched && surface.a < cutoff) {
		discard;
	}
	NORMAL = face_normal(VERTEX,VIEW);
	ALBEDO = surface.rgb;
	ROUGHNESS = 1.0;
	EMISSION = surface.rgb*0.12;
}
