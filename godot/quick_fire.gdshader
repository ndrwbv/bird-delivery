shader_type spatial;
render_mode unshaded, cull_disabled, depth_draw_never, shadows_disabled;
varying float seed;
void vertex() {
	vec3 scale = vec3(length(MODEL_MATRIX[0].xyz),length(MODEL_MATRIX[1].xyz),1.);
	MODELVIEW_MATRIX = VIEW_MATRIX * mat4(INV_VIEW_MATRIX[0],INV_VIEW_MATRIX[1],INV_VIEW_MATRIX[2],MODEL_MATRIX[3]);
	VERTEX *= scale;
	seed = dot(MODEL_MATRIX[3].xz,vec2(.36,.17));
}
float hash(vec2 p) { return fract(sin(dot(floor(p),vec2(31.7,74.1)))*13537.23); }
float cloud(vec2 p) {
	vec2 f = smoothstep(vec2(0.),vec2(1.),fract(p));
	return mix(mix(hash(p),hash(p+vec2(1,0)),f.x),mix(hash(p+vec2(0,1)),hash(p+1.),f.x),f.y);
}
void fragment() {
	float h = 1.-UV.y;
	float x = UV.x*2.-1.;
	float t = TIME*1.9 + seed;
	float noise = cloud(vec2(x*4.+seed,h*5.-t))*0.61+cloud(vec2(x*8.,h*8.-t*1.2))*.39;
	float width = mix(.70,.17,h)+noise*.15;
	float shape = 1.-smoothstep(width*.25,width,abs(x+sin(h*9.-t)*.15*h));
	float flame = shape*(1.-smoothstep(.12,.67,h+noise*.29-.20));
	float smoke = shape*(1.-smoothstep(.69,1.,h))*smoothstep(.08,.48,h)*noise;
	ALBEDO = mix(vec3(.105,.085,.088),mix(vec3(.96,.09,.012),vec3(1.,.73,.19),1.-h*2.+noise*.15),clamp(flame*1.5,0.,1.));
	ALPHA = clamp(flame+smoke*.72,0.,1.)*smoothstep(0.,.035,h);
}
