shader_type spatial;
render_mode cull_disabled, diffuse_lambert, specular_disabled;

#include "res://retro/geometry.gdshaderinc"

#include "res://material_grade.gdshaderinc"
#include "res://street_light.gdshaderinc"

uniform sampler2D prop_mask : filter_nearest, repeat_disable;
uniform bool dynamic_props = false;
uniform float road_wetness = 0.0;
uniform float water_film = 0.0;
uniform bool grade_surfaces = false;
uniform bool wood_grain = false;

varying vec4 paint;
varying vec3 world;

float hash3(vec3 p) {
	p = fract(p * 0.3183099 + 0.1) * 17.0;
	return fract(p.x*p.y*p.z*(p.x+p.y+p.z));
}

float noise2(vec2 p) {
	vec2 i = floor(p);
	vec2 f = smoothstep(vec2(0.0),vec2(1.0),fract(p));
	return mix(mix(hash3(vec3(i,0)),hash3(vec3(i+vec2(1,0),0)),f.x),
		mix(hash3(vec3(i+vec2(0,1),0)),hash3(vec3(i+1.0,0)),f.x),f.y);
}

void vertex() {
	if (dynamic_props && textureLod(prop_mask,UV2,0.0).r > 0.5) {
		VERTEX.y -= 1600.0;
	}
	paint = COLOR;
	world = (MODEL_MATRIX * vec4(VERTEX,1.0)).xyz;
	vec4 retro_clip = PROJECTION_MATRIX*MODELVIEW_MATRIX*vec4(VERTEX,1.0);
	POSITION = retro_project(retro_clip,VIEWPORT_SIZE);
}

void fragment() {
	vec3 color = paint.rgb;
	vec3 n = face_normal(VERTEX,VIEW);
	vec3 up = VIEW_MATRIX[1].xyz;
	float level = abs(dot(n,up));
	float alpha = paint.a*255.0;
	float visual_range = length(VERTEX);
	float detail = 1.0-smoothstep(22.0,80.0,visual_range);
	float pigment = hash3(floor(world*7.0))-0.5;
	if (wood_grain) {
		float value = dot(color,vec3(0.25,0.60,0.15));
		float cool = 1.0-smoothstep(0.025,0.11,color.r-color.b);
		vec3 bark = mix(vec3(0.17,0.080,0.032),vec3(0.51,0.31,0.15),smoothstep(0.09,0.49,value));
		color = mix(color,bark,0.56*cool);
		vec2 grain_uv = vec2(world.x*2.4+world.z*3.7,world.y*0.57);
		float grain = noise2(floor(grain_uv*3.0)/3.0);
		color *= 0.93+detail*(grain-0.5)*0.30;
	}
	float grass = smoothstep(0.022,0.105,color.g-max(color.r,color.b))*smoothstep(0.53,0.91,level);
	if (grade_surfaces && grass > 0.14) {
		vec2 drift = vec2(sin(world.z*0.94),cos(world.x*0.71))*0.46;
		float patches = noise2(world.xz*0.41+drift)*0.52 + noise2(world.xz*1.86)*0.20 + noise2(world.xz*0.16)*0.28;
		float earth = smoothstep(0.68,0.84,patches)*0.15;
		float tint = noise2(world.xz*0.085+vec2(41.0,8.0));
		vec3 shaded = mix(vec3(0.041,0.093,0.028),vec3(0.077,0.114,0.036),tint);
		vec3 lit = mix(vec3(0.082,0.167,0.064),vec3(0.145,0.183,0.064),tint);
		vec3 clumps = mix(shaded,lit,patches);
		clumps = mix(clumps,vec3(0.164,0.141,0.077),earth);
		float blades = hash3(vec3(floor(world.xz*vec2(19.0,13.0)),13.0));
		clumps *= 1.0 + detail*(pigment*0.095+step(0.89,blades)*0.065);
		color = mix(color,clumps,grass);
	}
	if (grade_surfaces && level > 0.85 && grass < 0.12) {
		float mottling = noise2(world.xz*0.64)*0.56+noise2(world.xz*2.2)*0.44;
		float aggregate = hash3(vec3(floor(world.xz*65.0),31));
		float width = max(fwidth(world.x)*65.0, fwidth(world.z)*65.0);
		float grains = (aggregate-0.5)*max(0.0,1.0-width);
		float repaired = smoothstep(0.68,0.76,noise2(floor(world.xz*5.0)*0.12));
		float gray = dot(color,vec3(0.23,0.63,0.14));
		float neutral = 1.0-smoothstep(0.03,0.085,max(color.r,max(color.g,color.b))-min(color.r,min(color.g,color.b)));
		float pavement = neutral*smoothstep(0.03,0.085,gray)*(1.0-smoothstep(0.32,0.51,gray));
		vec3 slate = mix(vec3(0.095,0.081,0.094),vec3(0.17,0.139,0.144),smoothstep(0.055,0.28,gray));
		color = mix(color,slate,pavement*0.90);
		float walk = neutral*smoothstep(0.19,0.50,gray);
		color *= mix(vec3(1.0),vec3(1.0,0.86,0.73),walk*0.42);
		color *= 0.90 + 0.18*mottling + detail*(grains*0.24-0.10*repaired);
		color *= 1.0-0.24*road_wetness;
		float pool = smoothstep(0.6,0.683,0.22*water_film+noise2(world.xz*0.48)*0.64);
		vec3 reflected = mix(vec3(0.40,0.46,0.53),vec3(0.64,0.69,0.74),1.0-level);
		color = mix(color,reflected,pool*water_film*0.50);
	}
	if (grade_surfaces && alpha > 0.5 && alpha < 127.5 && level < 0.8) {
		// The original tile stores its floor and panel boundaries in its paint.
		float story = fract(alpha+0.0005)*3.15;
		float joint_width = max(fwidth(alpha)*3.15,0.018);
		float seam = (1.0-smoothstep(0.032,0.08+joint_width,min(story,3.15-story)))*min(1.0,0.1/joint_width);
		float plate = fract(paint.r*255.0+0.003);
		float side = min(plate,1.0-plate);
		float tone = hash3(vec3(floor(paint.r*255.0),floor(alpha*1.001),floor(paint.b*255.0)))-0.5;
		vec3 world_normal = normalize(mat3(INV_VIEW_MATRIX)*n);
		vec2 wall = vec2(dot(world.xz,normalize(vec2(world_normal.z,-world_normal.x))),world.y);
		float runoff = noise2(wall*vec2(3.1,0.19))*0.70+noise2(wall*vec2(8.8,0.41))*0.30;
		float streak = smoothstep(0.52,0.78,runoff)*(1.0-smoothstep(0.24,2.34,3.15-story));
		float damp = smoothstep(0.52,0.82,noise2(wall*vec2(0.48,0.67)))*(1.0-smoothstep(0.04,0.80,story));
		float plaster = noise2(floor(wall*23.0)/3.0)*0.72+noise2(wall*2.2)*0.28;
		float crisp = 1.0-smoothstep(0.015,0.073,length(fwidth(wall)));
		float stone = dot(color,vec3(0.24,0.64,0.12));
		vec3 sand = vec3(stone*1.19,stone*0.86,stone*0.49);
		color = mix(color,sand,0.42)*0.94;
		color *= 0.96 - 0.27*seam + 0.16*tone - 0.17*damp;
		color *= 1.0-detail*(0.34*streak+0.11*(1.0-smoothstep(0.0,0.05,side)));
		color *= 1.0 + (plaster-0.5)*(0.13+0.29*crisp) + pigment*crisp*0.21;
		color = mix(color,color*vec3(0.76,0.88,0.72),damp*0.57);
	}
	float broad = sin(world.x*0.48 + sin(world.z*0.22)*1.5)*sin(world.y*0.19+world.z*0.33);
	color *= 1.0 + pigment*detail*0.10 + broad*0.040;
	float luminance = dot(color,vec3(0.25,0.58,0.17));
	color = max(vec3(0.0),mix(vec3(luminance),color,grade_surfaces?mix(1.08,0.96,grass):1.02));
	NORMAL = n;
	ALBEDO = display_color(color);
	EMISSION = display_color(street_bounce(world,color,level));
	ROUGHNESS = 1.0;
}
