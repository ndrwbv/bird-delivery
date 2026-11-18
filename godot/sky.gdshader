shader_type sky;
render_mode use_debanding;

uniform vec3 sun_vector = vec3(-0.63,0.49,0.60);
uniform float daylight = 0.0;
uniform float darkness = 0.0;
uniform float overcast = 0.0;
uniform float flash = 0.0;
uniform float heat = 0.0;
uniform float snow_cover = 0.0;

float hash(float n) {
	return fract(sin(n*39.721+43.58)*43758.5453);
}

float oval(vec2 p, vec2 center, vec2 size) {
	return (length((p-center)/size)-1.0)*min(size.x,size.y);
}

vec2 cumulus(vec2 p, float spread) {
	float base = oval(p,vec2(0.0,-0.06),vec2(0.88,0.23));
	float left = oval(p,vec2(-0.51,0.11),vec2(0.30,0.26));
	float mid = oval(p,vec2(-0.13,0.26),vec2(0.40,0.43));
	float right = oval(p,vec2(0.28,0.20),vec2(0.32,0.39)*spread);
	float tail = oval(p,vec2(0.60,0.01),vec2(0.30,0.19));
	float outline = min(min(min(base,left),min(mid,right)),tail);
	outline += sin(p.x*33.0+p.y*20.0)*sin(p.y*44.0-p.x*17.0)*0.015;
	float body = 1.0-smoothstep(-0.006,0.015,outline);
	float lobes = min(min(left,mid),right);
	float shade = 1.0-smoothstep(-0.15,0.02,p.y-p.x*0.07+sin(p.x*15.0)*0.078);
	shade = mix(shade,0.75,(1.0-smoothstep(-0.05,0.09,lobes))*smoothstep(0.0,0.25,-p.y)*0.6);
	return vec2(body,shade);
}

void sky() {
	vec3 d = normalize(EYEDIR);
	float elevation = max(0.0,d.y);
	vec3 rim = mix(vec3(0.41,0.65,0.90),vec3(0.67,0.65,0.76),daylight);
	vec3 upper = mix(vec3(0.16,0.39,0.76),vec3(0.12,0.24,0.53),daylight);
	vec3 color = mix(rim,upper,smoothstep(-0.04,0.54,elevation));
	float toward_sun = max(0.0,dot(d,normalize(sun_vector)));
	color += vec3(1.0,0.75,0.46)*(0.13*pow(toward_sun,8.0)+0.37*pow(toward_sun,160.0)+0.72*smoothstep(0.9995,0.99991,toward_sun));

	float azimuth = atan(d.z,d.x)/6.2831853;
	float strip = azimuth*9.0 + TIME*0.004 + 0.19;
	float cell = mod(floor(strip),9.0);
	float random = hash(cell);
	vec2 p = vec2((fract(strip)-0.5)*3.3, (elevation-(0.12+random*0.21))/(0.062+hash(cell+9.0)*0.072));
	vec2 bank = cumulus(p,0.75+random*0.36);
	float low_strip = azimuth*14.0 + TIME*0.0051 + 0.43;
	float low_cell = mod(floor(low_strip),14.0);
	vec2 lower = vec2((fract(low_strip)-0.5)*3.13,(elevation-0.025-hash(low_cell+32.0)*0.07)/0.058);
	vec2 small = cumulus(lower,0.83);
	float cloud = max(bank.x,small.x*0.92);
	float shade = mix(small.y,bank.y,bank.x);
	vec3 cream = mix(vec3(1.0,0.972,0.905),vec3(1.0,0.79,0.68),daylight*0.56);
	vec3 cloud_color = mix(cream,vec3(0.65,0.73,0.89),(0.16*step(0.27,shade)+0.34*step(0.55,shade)+0.26*shade));
	color = mix(color,cloud_color,cloud*smoothstep(0.005,0.040,elevation));
	vec3 gray = mix(vec3(0.43,0.51,0.62),vec3(0.25,0.32,0.42),elevation+cloud*0.11);
	color = mix(color,gray,overcast*0.90);
	vec3 night = mix(vec3(0.13,0.17,0.25),vec3(0.025,0.038,0.079),smoothstep(0.0,0.55,elevation));
	color = mix(color,vec3(0.75,0.83,0.90),snow_cover*0.32*(1.0-darkness));
	color = mix(color,vec3(0.98,0.71,0.44),heat*0.34*(1.0-elevation));
	COLOR = mix(mix(color,night+vec3(cloud*0.025),darkness),vec3(0.86,0.90,1.0),flash*0.75);
}
