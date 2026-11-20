shader_type spatial;
render_mode cull_disabled, diffuse_lambert, specular_disabled;

#include "res://material_grade.gdshaderinc"
#include "res://season_tint.gdshaderinc"

uniform sampler2D leaf_atlas : filter_linear_mipmap, repeat_disable;
uniform sampler2D canopy_atlas : source_color, filter_linear_mipmap, repeat_disable;
uniform vec3 view_origin;
uniform int leaf_mode = 0;

varying vec2 atlas_uv;
varying flat float dense_leaf;

varying vec3 paint;
varying vec3 world;

float facet_pick(vec3 p) {
	p = fract(p * 0.1031);
	p += dot(p,p.yzx+33.33);
	return fract((p.x+p.y)*p.z);
}

void vertex() {
	paint = (leaf_mode == 0 || leaf_mode == 4) ? COLOR.rgb : INSTANCE_CUSTOM.rgb;
	atlas_uv = UV*vec2(0.80,1.0);
	dense_leaf = 0.0;
	if (leaf_mode == 4) {
		vec2 local = vec2(UV.x*4.0,UV.y);
		dense_leaf = step(0.9,COLOR.a);
		atlas_uv = dense_leaf > 0.5 ? vec2(0.44,0.02)+local*vec2(0.22,0.57)
			: vec2(0.80+local.x*0.20,local.y);
	} else if (leaf_mode != 0) {
		float frame = floor(INSTANCE_CUSTOM.a*16.0);
		dense_leaf = step(4.0,frame)*(1.0-step(8.0,frame));
		atlas_uv = dense_leaf > 0.5 ? vec2(0.44,0.02)+UV*vec2(0.22,0.57)
			: vec2((UV.x*0.988+0.006+min(frame,4.0))*0.20,UV.y);
	}
	world = (MODEL_MATRIX*vec4(VERTEX,1.0)).xyz;
	if (leaf_mode < 2 || leaf_mode == 4) {
		float phase = dot(world.xz,vec2(0.82,0.57));
		VERTEX.xz += vec2(0.045,0.022)*sin(TIME*1.75+phase);
	}
}

void fragment() {
	if (leaf_mode == 1 || leaf_mode == 2) {
		vec3 offset = view_origin-world;
		float distance_sq = dot(offset,offset);
		if ((leaf_mode == 1 && distance_sq >= 3136.0) || (leaf_mode == 2 && distance_sq <= 1764.0)) {
			discard;
		}
		if (distance_sq > 1764.0 && distance_sq < 3136.0) {
			float blend = smoothstep(42.0,56.0,sqrt(distance_sq));
			float pick = facet_pick(floor(world*4.0));
			if ((leaf_mode == 1 && pick < blend) || (leaf_mode == 2 && pick >= blend)) {
				discard;
			}
		}
	}
	vec4 surface = dense_leaf > 0.5 ? texture(canopy_atlas,atlas_uv) : texture(leaf_atlas,atlas_uv);
	if (surface.a < (leaf_mode >= 2 ? 0.36 : 0.47)) {
		discard;
	}
	vec3 up = mat3(VIEW_MATRIX)*vec3(0.0,1.0,0.0);
	NORMAL = normalize(face_normal(VERTEX,VIEW)*0.46+up*0.54);
	float shade = dense_leaf > 0.5 ? mix(0.47,1.14,surface.g) : mix(0.26,0.89,surface.g);
	vec3 tone = paint*shade;
	float twig = step(0.025,surface.r-surface.b)*(1.0-dense_leaf);
	if (season_surface.y < 1.0 && twig < 0.5 && facet_pick(floor(world*3.0)) > season_surface.y) discard;
	tone = mix(seasonal_leaf(tone),vec3(0.17,0.098,0.04),twig*0.81);
	ALBEDO = display_color(tone);
	ROUGHNESS = 1.0;
}
