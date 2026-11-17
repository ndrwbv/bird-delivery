shader_type spatial;
render_mode cull_disabled, diffuse_lambert, specular_schlick_ggx, depth_prepass_alpha;

#include "res://retro/geometry.gdshaderinc"

#include "res://car_surface.gdshaderinc"

uniform sampler2D surface_texture : source_color, filter_nearest_mipmap;
uniform vec4 tint : source_color = vec4(0.4,0.5,0.65,0.55);
uniform int pane = -1;
uniform int crack = 0;

varying vec3 affine_uv;

void vertex() {
	panel = VERTEX;
	section = clamp(int(UV2.x*16.0),0,12);
	pose_surface(VERTEX,NORMAL,section);
	vec4 retro_clip = PROJECTION_MATRIX*MODELVIEW_MATRIX*vec4(VERTEX,1.0);
	POSITION = retro_project(retro_clip,VIEWPORT_SIZE);
	affine_uv = retro_uv_vertex(UV,retro_clip.w);
}

void fragment() {
	float stage = section_pose[section].w;
	if (crack >= 3 || (section > 0 && section <= 8 && stage >= 3.0)) discard;
	vec4 base = texture(surface_texture,retro_uv_fragment(UV,affine_uv))*tint;
	vec3 color = base.rgb;
	float opacity = base.a;
	if (crack > 0) {
		vec2 p = vec2(pane>1?panel.z*0.61:panel.x,panel.y)-vec2(0.09,1.22);
		float r = length(p);
		float angle = atan(p.y,p.x);
		float spokes = abs(sin(angle*5.0+sin(r*23.0)*0.32));
		float ring = abs(fract(r*6.0+sin(angle*5.0)*0.21)-0.5);
		float cracks = max(1.0-smoothstep(0.008,0.035,spokes),1.0-smoothstep(0.018,0.04,ring));
		color = mix(color,vec3(0.77,0.87,0.96),cracks*(crack==2?0.89:0.52));
		opacity = max(opacity,(crack==2?0.83:0.71)*cracks);
	}
	if (pane < 0 && section >= 9 && stage > 0.5) {
		color = mix(color,vec3(0.18,0.18,0.19),min(1.0,stage*0.36));
	}
	vec3 stained = stains(color,panel);
	ALBEDO = stained;
	ALPHA = max(opacity,clamp(length(stained-color)*2.8,0.0,0.78));
	ROUGHNESS = 0.31;
}
