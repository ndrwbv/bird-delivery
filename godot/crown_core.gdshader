shader_type spatial;
render_mode cull_disabled, diffuse_lambert, specular_disabled;

#include "res://material_grade.gdshaderinc"

varying vec3 pigment;
varying vec3 world;

void vertex() {
	pigment = COLOR.rgb;
	world = (MODEL_MATRIX*vec4(VERTEX,1.0)).xyz;
	VERTEX.xz += vec2(0.038,0.022)*sin(TIME*1.75+dot(world.xz,vec2(0.82,0.57)));
}

void fragment() {
	vec3 color = pigment;
	float ripple = sin(world.x*6.3+world.z*4.7)*sin(world.y*5.9-world.z*6.1);
	float islands = sin(world.x*17.1+world.y*8.5)*sin(world.z*13.6-world.y*11.2);
	float near_detail = 1.0-smoothstep(18.0,47.0,length(VERTEX));
	color *= 1.0+0.11*ripple+near_detail*0.19*smoothstep(-0.35,0.8,islands);
	ALBEDO = display_color(color);
	ROUGHNESS = 1.0;
}
