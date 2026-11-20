shader_type spatial;
render_mode cull_disabled, diffuse_lambert, specular_disabled;

#include "res://material_grade.gdshaderinc"
#include "res://season_tint.gdshaderinc"
#include "res://quick_damage.gdshaderinc"
#include "res://residential_interior.gdshaderinc"
#include "res://street_light.gdshaderinc"

uniform vec2 rain_film = vec2(0.0);
uniform float dusk = 0.0;
varying vec3 ground;
varying vec4 pigment;
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
	pigment = COLOR;
	style = UV2;
}

void fragment() {
	if (quick_cut(ground)) discard;
	vec2 p = ground.xz;
	vec3 color = pigment.rgb;
	vec3 glow = vec3(0.0);
	vec3 normal = face_normal(VERTEX,VIEW);
	float detail = 1.0 - smoothstep(26.0, 85.0, length(VERTEX));
	float fine = detail > 0.0 ? grain(floor(p * 32.0)) - 0.5 : 0.0;
	float rough = 0.96;
	if (style.x < 0.5) {
		float broad = noise_at(p * 0.088 + vec2(53.0,17.0));
		float patches = noise_at(p * 0.28) * 0.27 + noise_at(p * 0.92) * 0.12 + broad * 0.61;
		float vigor = clamp(color.b + (noise_at(p * 0.032) - 0.5) * 0.64,0.0,1.0);
		vec3 greens = mix(vec3(0.046,0.088,0.023),vec3(0.151,0.212,0.067),vigor);
		greens *= 0.72 + patches*0.57;
		float sand = noise_at(p * 0.057 + vec2(13.0,19.0));
		vec3 soil = mix(vec3(0.126,0.071,0.036),vec3(0.297,0.224,0.122),sand);
		float bare = smoothstep(0.51,0.71,patches + (0.64-vigor)*0.22) * color.r*1.48;
		float pebbles = smoothstep(0.92,0.99,grain(floor(p*12.0)));
		color = mix(seasonal_grass(greens),soil,bare) * (1.0 + detail*(fine*0.21+pebbles*bare*0.25));
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
		float stories = max(1.0, floor(abs(style.y) / 3.15));
		vec2 facade = UV / 3.15;
		vec2 bay = fract(facade);
		float row = floor(facade.y);
		float seed = grain(floor(facade) + pigment.a*87.17);
		float chip = noise_at(UV * 6.3) * 0.64 + noise_at(UV * 19.0) * 0.36;
		float mortar = 1.0 - smoothstep(0.012,0.035,min(bay.y,1.0-bay.y));
		float joints = 1.0 - smoothstep(0.008,0.021,min(bay.x,1.0-bay.x));
		float streak = smoothstep(0.53,0.77,noise_at(UV*vec2(4.5,0.22)+pigment.a))
			* (1.0-smoothstep(0.08,0.85,bay.y));
		float damp = smoothstep(0.46,0.78,noise_at(UV*vec2(0.72,0.27)+vec2(5.0,17.0)))
			* (1.0-smoothstep(0.6,2.15,UV.y));
		float plinth = 1.0-smoothstep(0.39,0.45,UV.y+chip*0.07);
		float repair = smoothstep(0.67,0.84,noise_at(UV*0.42+vec2(13.0,37.0)));
		color = mix(color*vec3(1.02,0.96,0.82),vec3(0.181,0.168,0.137),plinth*0.83);
		color *= 0.86 + 0.18*seed - 0.15*mortar - 0.12*joints - 0.29*streak - 0.22*damp;
		color = mix(color,color*vec3(0.74,0.85,0.72),damp*0.72);
		color *= 1.0+(chip-0.5)*(0.08+detail*0.38)+repair*0.23;
		if (style.y > 0.0 && row >= 0.0 && row < stories) {
			float shift = (seed-0.5)*0.07;
			vec2 glass_size = vec2(0.58+seed*0.09,0.48);
			vec2 pane = (bay-vec2(0.5+shift,0.58))/glass_size+0.5;
			vec2 aa = clamp(fwidth(facade),vec2(0.004),vec2(0.12));
			vec2 borders = abs(pane-0.5);
			float recess = (1.0-smoothstep(0.49,0.59+aa.x,borders.x))
				* (1.0-smoothstep(0.50,0.58+aa.y,borders.y));
			float sill = (1.0-smoothstep(0.57,0.65+aa.x,borders.x)) * line(pane.y,-0.041,0.037,aa.y);
			color = mix(color,color*0.46,recess);
			color = mix(color,color*0.74+vec3(0.045),sill);
			if (recess > 0.04) {
				vec3 up = normalize(VIEW_MATRIX[1].xyz);
				vec3 right = normalize(cross(up,normal));
				vec3 ray = vec3(dot(-VIEW,right),dot(-VIEW,up),min(-0.022,dot(-VIEW,normal)));
				float sky = smoothstep(-0.2,0.65,dot(reflect(-VIEW,normal),up));
				vec3 reflection = mix(vec3(0.037,0.050,0.058),vec3(0.18,0.29,0.38),sky);
				float lit = dusk*step(0.52,seed);
				float near_window = 1.0-smoothstep(48.0,99.0,length(VERTEX));
				vec3 inside = mix(vec3(0.072,0.073,0.069),vec3(0.32,0.22,0.11),lit);
				if (near_window > 0.0 && max(borders.x,borders.y) < 0.5) {
					inside = mix(inside,room(pane,glass_size*3.15,ray,seed,lit),near_window);
				}
				float glazing = 0.26 + 0.51*pow(1.0-abs(ray.z),4.0);
				vec3 glass = mix(inside,reflection*(1.0-0.63*dusk),glazing*(1.0-0.70*lit));
				float inset = (1.0-smoothstep(0.43-aa.x,0.50+aa.x,borders.x))
					* (1.0-smoothstep(0.44-aa.y,0.50+aa.y,borders.y));
				float frame = max(line(pane.x,0.52,0.019,aa.x),line(pane.y,0.63,0.018,aa.y)*step(0.41,seed));
				vec3 trim = mix(vec3(0.251,0.224,0.176),vec3(0.101,0.072,0.041),step(0.74,seed));
				color = mix(color,mix(glass,trim,frame)*0.89,inset);
				glow = (glass*0.22+vec3(0.14,0.069,0.024))*lit*inset*(1.0-frame);
			}
		}
	} else if (style.x < 4.5) {
		float membrane = noise_at(p * 0.29);
		float seams = line(fract(p.x/2.3),0.0,0.025,0.05) + line(fract(p.y/5.9),0.0,0.021,0.04);
		color *= 0.77 + 0.37*membrane - detail * 0.19*seams;
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
		color = mix(color*(0.79+0.28*noise_at(UV)-0.10*noise_at(UV*vec2(2.6,0.24))),
			vec3(0.118,0.156,0.162),band*mullion);
	} else {
		float weathered = noise_at(ground.xy*7.0+ground.z*vec2(0.6,2.1));
		color *= 0.83 + 0.26*weathered - rain_film.x*0.11;
	}
	if (style.x < 2.5 || (style.x > 3.5 && style.x < 6.5)) {
		float road = step(1.5,style.x)*(1.0-step(2.5,style.x));
		float walk = step(0.5,style.x)*(1.0-step(1.5,style.x));
		float cleared = road*(0.82+0.18*smoothstep(0.65,0.92,abs(sin(UV.y*1.6))))+walk*0.40;
		color *= 1.0-0.22*rain_film.x;
		color = mix(color,vec3(0.22,0.29,0.35),road*rain_film.y*smoothstep(0.64,0.78,noise_at(p*0.48))*0.58);
		color = seasonal_soil(color,p,cleared);
	}
	NORMAL = normal;
	ALBEDO = display_color(color);
	EMISSION = display_color(glow + street_bounce(ground,color,abs(dot(normal,VIEW_MATRIX[1].xyz))));
	ROUGHNESS = rough;
}
