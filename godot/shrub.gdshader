shader_type spatial;
render_mode cull_disabled, diffuse_lambert, specular_disabled, world_vertex_coords;

#include "res://material_grade.gdshaderinc"

uniform sampler2D leaves : source_color, filter_linear_mipmap, repeat_disable;
varying vec3 pigment;

void vertex() {
	pigment = COLOR.rgb;
	float wind = sin(TIME*1.9+VERTEX.x*0.71+VERTEX.z*0.48);
	VERTEX.xz += vec2(0.074,0.031)*wind*COLOR.a*COLOR.a;
}

void fragment() {
	vec4 leaf = texture(leaves,UV);
	if (leaf.a < 0.43) discard;
	vec3 up = mat3(VIEW_MATRIX)*vec3(0.0,1.0,0.0);
	NORMAL = normalize(face_normal(VERTEX,VIEW)*0.39+up*0.61);
	vec3 tint = display_color(pigment);
	float value = dot(leaf.rgb,vec3(0.24,0.64,0.12));
	vec3 olive = value*vec3(0.82,0.99,0.70);
	vec3 foliage = mix(olive,leaf.rgb,0.65)*tint;
	ALBEDO = foliage*(0.64+0.22*value);
	EMISSION = ALBEDO*0.042;
	ROUGHNESS = 1.0;
}
