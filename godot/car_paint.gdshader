shader_type spatial;
render_mode cull_disabled, diffuse_lambert, specular_schlick_ggx;

#include "res://car_surface.gdshaderinc"

uniform sampler2D body_texture : source_color, filter_linear_mipmap;
uniform vec4 enamel : source_color = vec4(0.86,0.79,0.67,1.0);
uniform bool body_panel = true;

void vertex() {
	panel = VERTEX;
	section = clamp(int(UV2.x*16.0),0,12);
	pose_surface(VERTEX,NORMAL,section);
}

void fragment() {
	float stage = section_pose[section].w;
	if (section > 0 && section <= 8 && stage >= 3.0) discard;
	vec3 color = texture(body_texture,UV).rgb*enamel.rgb;
	float bumper = 0.0;
	if (body_panel) {
		color *= vec3(1.04,0.995,0.914);
		bumper = (section == 7 || section == 8) ? 1.0 : 0.0;
		float trim = smoothstep(0.435,0.463,panel.y)*(1.0-smoothstep(0.475,0.495,panel.y));
		vec3 rubber = mix(vec3(0.14,0.145,0.16),vec3(0.38,0.37,0.35),trim*0.72);
		color = mix(color,rubber,bumper);
	}
	if (section >= 9 && stage > 0.5) {
		float fissure = step(0.81,surface_noise(floor(panel*82.0)));
		color = mix(color,vec3(0.12,0.128,0.139)+fissure*0.33,stage>1.5?0.86:0.39);
	}
	ALBEDO = stains(color,panel);
	ROUGHNESS = mix(0.39,0.88,bumper);
	SPECULAR = mix(0.64,0.15,bumper);
}
