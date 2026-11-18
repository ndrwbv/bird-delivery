shader_type sky;
float hash(vec2 p) { return fract(sin(dot(p,vec2(37.3,61.7)))*1453.71); }
float noise(vec2 p) {
	vec2 a=floor(p), f=smoothstep(vec2(0.),vec2(1.),fract(p));
	return mix(mix(hash(a),hash(a+vec2(1,0)),f.x),mix(hash(a+vec2(0,1)),hash(a+1.),f.x),f.y);
}
void sky() {
	float h=max(EYEDIR.y,0.);
	vec2 p=EYEDIR.xz/(h+.28)*3.+TIME*vec2(.027,.012);
	float n=noise(p)*.58+noise(p*2.1)*.29+noise(p*4.3)*.13;
	vec3 ember=mix(vec3(.57,.060,.023),vec3(.16,.012,.028),smoothstep(0.,.75,h));
	COLOR=mix(ember,vec3(.043,.013,.027),smoothstep(.25,.60,n)*.92);
}
