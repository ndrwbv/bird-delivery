shader_type spatial;
render_mode cull_disabled, diffuse_lambert, specular_disabled;

#include "res://material_grade.gdshaderinc"

varying vec3 ground;
varying vec3 pigment;
varying vec2 style;

float grain(vec2 p) {
	vec3 q = fract(vec3(p.xyx) * 0.1031);
	q += dot(q, q.yzx + 33.33);
	return fract((q.x + q.y) * q.z);
}

float noise_at(vec2 p) {
	vec2 cell = floor(p);
	vec2 f = smoothstep(vec2(0.0), vec2(1.0), fract(p));
	return mix(mix(grain(cell), grain(cell + vec2(1,0)), f.x),
		mix(grain(cell + vec2(0,1)), grain(cell + vec2(1,1)), f.x), f.y);
}

void vertex() {
	ground = (MODEL_MATRIX * vec4(VERTEX,1.0)).xyz;
	pigment = COLOR.rgb;
	style = UV2;
}

void fragment() {
	vec2 p = ground.xz;
	vec3 color = pigment;
	float detail = 1.0 - smoothstep(26.0, 85.0, length(VERTEX));
	float fine = grain(floor(p * 32.0)) - 0.5;
	float rough = 0.96;
	if (style.x < 0.5) {
		float moss = noise_at(p * 0.085) * 0.54 + noise_at(p * 0.8) * 0.46;
		color *= 0.68 + moss * 0.64 + detail * fine * 0.08;
	} else if (style.x < 1.5) {
		vec2 slab = abs(fract(p * 0.62) - 0.5);
		float edge = smoothstep(0.475, 0.497, max(slab.x,slab.y));
		color *= 0.9 + noise_at(p * 0.5) * 0.16 - detail * edge * 0.15;
	} else if (style.x < 2.5) {
		color *= 0.88 + noise_at(p * 0.43) * 0.22 + detail * fine * 0.18;
		float paint_width = max(fwidth(UV.y), 0.012);
		float center = 1.0 - smoothstep(0.055-paint_width, 0.055+paint_width, abs(UV.y));
		float dash = 1.0 - smoothstep(0.13, 0.17, abs(fract(UV.x/9.0)-0.5));
		color = mix(color, vec3(0.56,0.54,0.44), dash * center * style.y * 0.85);
	} else if (style.x < 3.5) {
		float stories = max(1.0, round(style.y / 3.15));
		vec2 facade = vec2(UV.x/3.10, UV.y*stories/style.y);
		vec2 bay = fract(facade);
		vec2 aa = clamp(fwidth(facade), vec2(0.005), vec2(0.16));
		vec2 window = smoothstep(vec2(0.24,0.34)-aa, vec2(0.24,0.34)+aa, bay)
			* (vec2(1.0)-smoothstep(vec2(0.76,0.81)-aa, vec2(0.76,0.81)+aa,bay));
		float frame = 1.0 - smoothstep(0.010,0.022+aa.x,abs(bay.x-0.50));
		float reflection = grain(floor(facade) + floor(ground.xz * 0.006));
		vec3 glass = mix(vec3(0.062,0.085,0.093),vec3(0.154,0.194,0.219),reflection+bay.y*0.15);
		color *= 0.89 + 0.17 * noise_at(UV * 0.62);
		color = mix(color,mix(glass,color*0.52,frame),window.x*window.y);
	} else if (style.x < 4.5) {
		color *= 0.84 + 0.24 * noise_at(p * 0.30);
	} else if (style.x < 5.5) {
		float ripple = sin(p.x*0.62+p.y*0.34+TIME*0.9);
		color *= 0.93 + ripple * detail * 0.06;
		rough = 0.55;
	} else if (style.x < 6.5) {
		float tie = smoothstep(0.16,0.22,abs(fract(UV.x/0.67)-0.5));
		float rail_width = max(fwidth(UV.y),0.009);
		float rail = 1.0-smoothstep(0.035-rail_width,0.035+rail_width,abs(abs(UV.y)-0.76));
		float ballast = noise_at(p*8.0);
		color *= 0.8 + ballast*0.4;
		color = mix(color,vec3(0.079,0.066,0.049),tie*(1.0-smoothstep(1.1,1.18,abs(UV.y))));
		color = mix(color,vec3(0.337,0.318,0.280),rail);
	} else if (style.x < 7.5) {
		vec2 bay = vec2(fract(UV.x/3.45), UV.y/style.y);
		float gate = smoothstep(0.07,0.10,bay.x)*(1.0-smoothstep(0.90,0.93,bay.x))
			* (1.0-smoothstep(0.77,0.81,bay.y));
		vec3 metal = mix(vec3(0.122,0.129,0.118),vec3(0.193,0.162,0.124),grain(vec2(floor(UV.x/3.45),0.0)));
		color = mix(color,metal*(0.86 + detail*0.14*sin(UV.y*29.0)),gate);
	} else if (style.x < 8.5) {
		vec2 panel = fract(vec2(UV.x*0.29,UV.y*0.91));
		float band = smoothstep(0.56,0.58,UV.y/style.y)*(1.0-smoothstep(0.78,0.80,UV.y/style.y));
		float mullion = smoothstep(0.07,0.11,panel.x)*smoothstep(0.05,0.08,panel.y);
		color = mix(color*(0.90+0.10*noise_at(UV)),vec3(0.118,0.156,0.162),band*mullion);
	}
	NORMAL = face_normal(VERTEX,VIEW);
	ALBEDO = display_color(color);
	ROUGHNESS = rough;
}
