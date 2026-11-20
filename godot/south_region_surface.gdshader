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
		float bare = smoothstep(0.53,0.74,patches + (0.64-vigor)*0.18) * color.r*1.36;
		float pebbles = smoothstep(0.92,0.99,grain(floor(p*12.0)));
		color = mix(seasonal_grass(greens),soil,bare) * (1.0 + detail*(fine*0.21+pebbles*bare*0.25));
	} else if (style.x < 1.5) {
		vec2 tile = vec2(UV.x/1.12,UV.y/0.63);
		tile.x += 0.5*mod(floor(tile.y),2.0);
		vec2 joint = abs(fract(tile)-0.5);
		float grout = smoothstep(0.464,0.494,max(joint.x,joint.y));
		float slab_tone = grain(floor(tile));
		float chip = smoothstep(0.58,0.79,noise_at(p*1.37));
		color *= 0.80+0.25*slab_tone-0.34*grout+0.12*chip+detail*fine*0.18;
	} else if (style.x < 2.5) {
		float repairs = smoothstep(0.53,0.71,noise_at(p*0.37));
		float shoulder = 1.0-smoothstep(0.03,0.63,max(0.0,abs(style.y)-abs(UV.y)));
		color *= 0.88 + noise_at(p * 0.43) * 0.19 + detail * fine * 0.21 - repairs*0.10;
		if (pigment.a > 0.9) color *= 1.0-0.21*shoulder*noise_at(p*1.61);
		float paint_width = max(fwidth(UV.y), 0.012);
		float center = 1.0 - smoothstep(0.052-paint_width, 0.052+paint_width, abs(UV.y));
		float dash = 1.0 - smoothstep(0.15, 0.19, abs(fract(UV.x/9.0)-0.5));
		if (style.y > 0.0) {
			color = mix(color,vec3(0.61,0.59,0.50),dash*center*0.79);
		}
		if (pigment.a > 0.4 && pigment.a < 0.65) {
			float stall = line(fract(UV.x/2.62),0.5,0.017,0.012);
			float row = smoothstep(0.19,0.21,abs(fract(UV.y/16.0)-0.5));
			color = mix(color,vec3(0.54,0.51,0.42),stall*row*0.79);
		}
	} else if (style.x < 3.5 || (style.x > 10.5 && style.x < 14.5)) {
		float stories = max(1.0, floor(abs(style.y) / 3.15));
		bool brick = abs(style.x-11.0)<0.5;
		bool plaster = abs(style.x-12.0)<0.5;
		bool wood = abs(style.x-13.0)<0.5;
		bool civic = abs(style.x-14.0)<0.5;
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
		if (brick) {
			vec2 course = vec2(UV.x/0.35,UV.y/0.118);
			course.x += 0.5*mod(floor(course.y),2.0);
			vec2 cell = fract(course);
			vec2 aa_brick = clamp(fwidth(course),vec2(0.01),vec2(0.16));
			vec2 edge = min(cell,1.0-cell);
			float seam = 1.0 - smoothstep(0.020,0.052+aa_brick.x,edge.x)
				*smoothstep(0.036,0.075+aa_brick.y,edge.y);
			vec3 surface = mix(vec3(0.26,0.099,0.053),vec3(0.39,0.197,0.091),pigment.a);
			surface = mix(surface,color,0.28) * (0.75+0.48*grain(floor(course)));
			color = mix(surface,vec3(0.28,0.231,0.173),seam*0.72) * (0.97-streak*0.27-damp*0.28);
		}
		if (plaster) {
			vec3 painted_base = color*vec3(0.77,0.84,0.74);
			float band = 1.0-smoothstep(0.78,0.85,UV.y);
			color = mix(color*(1.07+joints*0.13),painted_base,band*0.79);
			color *= 1.0-0.17*smoothstep(0.46,0.77,noise_at(UV*vec2(0.5,0.17)+vec2(3.0,7.0)));
		}
		if (wood) {
			vec2 board = vec2(UV.x*0.53,UV.y/0.145);
			float lap = smoothstep(0.83,0.99,fract(board.y));
			vec3 painted = mix(color,vec3(color.r*0.66,color.g*0.90,color.b),0.58);
			color = painted*(0.62+0.45*grain(vec2(floor(board.y),41.0)) - 0.38*lap);
			color *= 0.87+0.19*noise_at(UV*vec2(11.0,0.23))+0.21*repair;
		}
		if (civic) {
			float frame_band = line(bay.y,0.99,0.080,0.026);
			float pilaster = line(bay.x,0.02,0.065,0.022);
			color = mix(color,vec3(0.28,0.266,0.235),max(frame_band,pilaster)*0.64);
			if (row == 0.0) color = mix(color,color*vec3(0.67,0.76,0.86),0.62);
		}
		if (style.y > 0.0 && row >= 0.0 && row < stories) {
			float shift = (seed-0.5)*0.026;
			vec2 glass_size = vec2(0.55+seed*0.08,0.43);
			float center_y = 0.59;
			if (brick) glass_size = vec2(0.50,0.56);
			if (plaster) glass_size = vec2(0.59,0.48);
			if (wood) glass_size = vec2(0.46,0.49);
			if (civic) {
				glass_size = row == 0.0 ? vec2(0.83,0.73) : vec2(0.75,0.47);
				if (row == 0.0) center_y = 0.43;
			}
			vec2 pane = (bay-vec2(0.5+shift,center_y))/glass_size+0.5;
			vec2 aa = clamp(fwidth(facade),vec2(0.004),vec2(0.12));
			vec2 borders = abs(pane-0.5);
			float recess = (1.0-smoothstep(0.49,0.59+aa.x,borders.x))
				* (1.0-smoothstep(0.50,0.58+aa.y,borders.y));
			float sill = (1.0-smoothstep(0.57,0.65+aa.x,borders.x)) * line(pane.y,-0.041,0.037,aa.y);
			if (brick) {
				float lintel = line(pane.y,1.064,0.06,0.03)*(1.0-smoothstep(.52,.61,borders.x));
				color = mix(color,color*1.33+vec3(0.035),lintel);
			}
			if (wood) {
				float casing = (1.0-smoothstep(.57,.63,max(borders.x,borders.y)))-recess;
				color = mix(color,vec3(.49,.442,.364),clamp(casing,0.0,1.0)*.72);
			}
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
				if (wood || civic) frame = max(frame,line(pane.x,0.24,0.012,aa.x)+line(pane.x,0.76,0.012,aa.x));
				if (wood) trim = vec3(0.48,0.41,0.30);
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
	} else if (style.x > 9.5 && style.x < 10.5) {
		float joints = line(fract(UV.x/0.94),0.5,0.018,0.017);
		float stone = noise_at(p*15.0);
		float streak = noise_at(p*2.1);
		color *= 0.78 + 0.15*stone + 0.19*streak - 0.30*joints;
	} else if (style.x > 14.5 && style.x < 15.5) {
		vec3 up = normalize(VIEW_MATRIX[1].xyz);
		float sky = smoothstep(-0.23,0.64,dot(reflect(-VIEW,normal),up));
		float pleats = 0.5+0.5*cos(UV.x*16.0+UV.y*.18);
		float curtain = noise_at(vec2(floor(UV.x*2.0),floor(ground.y/3.15)));
		vec3 reflection = vec3(.12,.21,.28)*(.40+.60*sky)*(1.0-.61*dusk);
		color = reflection + color*(.23+.16*pleats)*smoothstep(.2,.73,curtain);
		glow = dusk*step(.69,curtain)*vec3(.16,.078,.029)*(.7+.3*pleats);
		rough = .48;
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
