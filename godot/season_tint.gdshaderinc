// snow on horizontal surfaces, deciduous leaf coverage, yellow foliage, dry grass
uniform vec4 season_surface = vec4(0.0,1.0,0.0,0.0);

vec3 seasonal_soil(vec3 base, vec2 p, float cleared) {
	float patch = 0.50 + 0.22*sin(p.x*0.39+p.y*0.15) + 0.18*sin(p.y*0.59-p.x*0.21) + 0.10*sin(p.y*1.66+p.x*0.71);
	float cover = smoothstep(patch*0.72,patch*0.72+0.26,season_surface.x);
	vec3 powder = mix(vec3(0.56,0.65,0.72),vec3(0.78,0.83,0.84),patch);
	return mix(base,powder,cover*(1.0-0.83*cleared));
}

vec3 seasonal_leaf(vec3 base) {
	float tone = dot(base,vec3(0.23,0.65,0.12));
	return mix(base,vec3(1.85,0.94,0.22)*tone,season_surface.z);
}

vec3 seasonal_grass(vec3 base) {
	float tone = dot(base,vec3(0.23,0.65,0.12));
	return mix(base,vec3(1.36,1.08,0.61)*tone,season_surface.w);
}
