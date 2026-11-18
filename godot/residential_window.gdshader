shader_type spatial;
render_mode unshaded, cull_disabled;

#include "res://material_grade.gdshaderinc"
#include "res://quick_damage.gdshaderinc"
#include "res://core_bounds.gdshaderinc"

uniform float dusk = 0.0;
varying vec4 paint;

varying vec2 baked_xz;
varying float quick_y;

void vertex() {
	quick_y = (MODEL_MATRIX * vec4(VERTEX,1.0)).y;
	baked_xz = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xz;
	paint = COLOR;
}

float line(float position, float center, float width, float feather) {
	return 1.0-smoothstep(width,width+feather,abs(position-center));
}

float rectangle(vec2 p, vec2 center, vec2 extent) {
	vec2 d = abs(p-center)-extent;
	return 1.0-smoothstep(0.0,0.018,max(d.x,d.y));
}

vec3 room(vec2 window, vec2 size, vec3 ray, float seed, float lit) {
	float depth = 2.6+fract(seed*23.71)*1.68;
	float floor_y = -0.63;
	float ceiling_y = max(2.23,size.y+0.40);
	float margin = 0.38+min(size.x*0.10,0.4);
	vec3 origin = vec3(window*size,0.0);
	vec3 inv = sign(ray+vec3(0.00001))/max(abs(ray),vec3(0.00018));
	vec3 box_min = vec3(-margin,floor_y,-depth);
	vec3 box_max = vec3(size.x+margin,ceiling_y,0.0);
	vec3 times = max((box_min-origin)*inv,(box_max-origin)*inv);
	float hit = min(min(times.x,times.y),times.z);
	vec3 where = origin+ray*hit;
	float wallpaper = fract(seed*57.03+0.16);
	vec3 walls = mix(vec3(0.17,0.094,0.054),vec3(0.084,0.141,0.139),wallpaper);
	vec3 surface = walls;
	if (hit == times.y) {
		if (ray.y < 0.0) {
			float board = floor(where.x*8.6);
			float seam = line(fract(where.x*8.6),0.0,0.04,0.09);
			surface = vec3(0.075,0.042,0.024)*(0.86+fract(board*0.731)*0.31-seam*0.17);
		} else {
			surface = vec3(0.142,0.128,0.102);
		}
	} else {
		float stripe_x = where.x+where.z*0.55;
		surface *= 0.87+0.12*cos(stripe_x*34.0);
		float baseboard = 1.0-smoothstep(floor_y+0.10,floor_y+0.14,where.y);
		surface = mix(surface,vec3(0.08,0.061,0.043),baseboard);
		if (hit == times.z && wallpaper < 0.63) {
			vec2 picture_at = vec2(size.x*(0.25+wallpaper*0.50),ceiling_y*0.57);
			float picture = rectangle(where.xy,picture_at,vec2(0.26,0.29));
			float paper = rectangle(where.xy,picture_at,vec2(0.21,0.24));
			vec3 ink = mix(vec3(0.144,0.121,0.089),vec3(0.051,0.075,0.078),
				smoothstep(0.1,0.9,cos(where.x*22.0+where.y*15.0)));
			surface = mix(surface,mix(vec3(0.035,0.025,0.018),ink,paper),picture);
		}
	}
	float desk_time = -(depth*0.72)/ray.z;
	if (desk_time < hit) {
		vec2 p = (origin+ray*desk_time).xy;
		float desk = rectangle(p,vec2(size.x*0.58,0.05),vec2(size.x*0.28,0.20));
		float top = rectangle(p,vec2(size.x*0.58,0.24),vec2(size.x*0.29,0.033));
		surface = mix(surface,vec3(0.048,0.025,0.014),desk);
		surface = mix(surface,vec3(0.098,0.055,0.025),top);
		float lamp_x = size.x*(0.42+wallpaper*0.24);
		float stand = rectangle(p,vec2(lamp_x,0.42),vec2(0.019,0.17));
		float shade = rectangle(p,vec2(lamp_x,0.64),vec2(0.088-0.05*(p.y-0.64),0.087));
		if (wallpaper > 0.66) {
			float pot = rectangle(p,vec2(lamp_x,0.30),vec2(0.083,0.063));
			float plant = 1.0-smoothstep(0.10,0.16,length((p-vec2(lamp_x,0.52))*vec2(0.9,0.65))
				+0.022*sin(p.x*155.0+p.y*81.0));
			surface = mix(surface,vec3(0.18,0.074,0.034),pot);
			surface = mix(surface,vec3(0.037,0.13,0.067),plant);
			shade = 0.0;
			stand = 0.0;
		}
		float halo = exp(-distance(p,vec2(lamp_x,0.61))*3.6);
		surface = mix(surface,vec3(0.031,0.028,0.022),stand);
		surface += lit*halo*vec3(0.19,0.089,0.031);
		surface = mix(surface,mix(vec3(0.14,0.091,0.048),vec3(0.81,0.41,0.11),lit),shade);
	}
	float fabric_time = -0.39/ray.z;
	if (fabric_time < hit && wallpaper < 0.70) {
		vec2 p = (origin+ray*fabric_time).xy;
		float wave = sin(p.x*41.0+p.y*1.8)*0.09;
		float curtain = 1.0-smoothstep(0.09,0.19,abs(min(p.x,size.x-p.x))/size.x+(1.0-p.y/size.y)*0.07);
		vec3 fabric = mix(vec3(0.14,0.098,0.061),vec3(0.09,0.133,0.111),wallpaper+wave);
		surface = mix(surface,fabric*(0.77+wave),curtain*0.89);
	}
	return surface*(0.64+0.90*lit);
}

void fragment() {
	if (quick_cut(vec3(baked_xz.x, quick_y, baked_xz.y))) discard;
	if (outside_core(baked_xz)) discard;
	vec3 color = paint.rgb;
	if (UV2.y > 0.05) {
		vec3 front = face_normal(VERTEX,VIEW);
		vec3 up = normalize(VIEW_MATRIX[1].xyz);
		vec3 right = normalize(cross(up,front));
		vec3 ray = vec3(dot(-VIEW,right),dot(-VIEW,up),min(-0.022,dot(-VIEW,front)));
		vec3 reflect_view = reflect(-VIEW,front);
		float horizon = smoothstep(-0.20,0.67,dot(reflect_view,up));
		vec3 reflection = mix(vec3(0.035,0.052,0.069),vec3(0.22,0.36,0.48),horizon);
		float seed = paint.a;
		float lit = dusk*step(0.49,fract(seed*83.17));
		float range = length(VERTEX);
		float interior = 1.0-smoothstep(68.0,155.0,range);
		float glancing = pow(1.0-abs(ray.z),4.0);
		reflection *= 1.0-0.73*dusk;
		vec3 inside = mix(color*0.23,color*0.44,lit);
		if (interior > 0.01) inside = mix(inside,room(UV,UV2,ray,seed,lit),interior);
		float edges = min(min(UV.x,1.0-UV.x),min(UV.y,1.0-UV.y));
		float jamb = 1.0-smoothstep(0.018,0.10,edges);
		color = mix(inside*(1.0-0.57*jamb),reflection,(0.16+glancing*0.51)*(1.0-lit*0.64));
		color += vec3(0.17,0.077,0.022)*lit*(1.0-interior*0.42);
		if (UV2.x < 1.78 && fract(seed*29.7) > 0.52) {
			float frame = line(UV.x,0.5,0.014,0.008+fwidth(UV.x));
			color = mix(color,vec3(0.13,0.108,0.083)*(1.0-0.52*dusk),frame*0.88);
		}
	} else {
		color *= 0.77-0.48*dusk;
	}
	ALBEDO = display_color(color);
}
