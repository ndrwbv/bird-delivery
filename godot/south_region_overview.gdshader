shader_type spatial;
render_mode cull_disabled, diffuse_lambert, specular_disabled;

#include "res://material_grade.gdshaderinc"

uniform sampler2D elevation : filter_linear, repeat_disable;
uniform sampler2D roads : filter_linear, repeat_disable;
uniform sampler2D complete_tiles : filter_nearest, repeat_disable;
uniform vec4 area;
uniform vec4 core;
uniform float tile_size;
uniform float water_y;
varying vec2 world_xz;
varying float altitude;

void vertex() {
	world_xz = (MODEL_MATRIX*vec4(VERTEX,1.0)).xz;
	vec2 uv = (world_xz-area.xy)/area.zw;
	vec2 grid = vec2(textureSize(elevation,0));
	altitude = textureLod(elevation,(uv*(grid-1.0)+0.5)/grid,0.0).r;
	VERTEX.y = max(altitude,water_y);
}

void fragment() {
	if (all(greaterThanEqual(world_xz,core.xy)) && all(lessThanEqual(world_xz,core.zw))) discard;
	vec2 key = floor((world_xz-area.xy)/tile_size);
	vec2 ready_uv = (key+0.5)/vec2(textureSize(complete_tiles,0));
	if (texture(complete_tiles,ready_uv).r > 0.5) discard;
	vec2 uv = (world_xz-area.xy)/area.zw;
	float pavement = smoothstep(0.15,0.84,texture(roads,uv).r);
	vec3 color = mix(vec3(0.082,0.146,0.043),vec3(0.109,0.113,0.111),pavement);
	color = mix(vec3(0.046,0.102,0.121),color,smoothstep(water_y-0.03,water_y+0.09,altitude));
	NORMAL = face_normal(VERTEX,VIEW);
	ALBEDO = display_color(color);
	ROUGHNESS = 0.97;
}
