uniform vec4 dent_points[8];
uniform vec4 dent_forces[8];
uniform vec4 section_pose[13];
uniform vec4 section_hinge[13];
uniform vec2 access_open = vec2(0.0);
uniform vec4 blood_marks[12];
uniform int blood_count = 0;
uniform vec4 soot_marks[2];
uniform int soot_count = 0;

varying vec3 panel;
varying flat int section;

vec3 rot(vec3 v, vec3 angles) {
	vec3 s = sin(angles), c = cos(angles);
	v = vec3(v.x,v.y*c.x-v.z*s.x,v.y*s.x+v.z*c.x);
	v = vec3(v.x*c.y+v.z*s.y,v.y,-v.x*s.y+v.z*c.y);
	return vec3(v.x*c.z-v.y*s.z,v.x*s.z+v.y*c.z,v.z);
}

vec3 dented(vec3 point) {
	vec3 offset = vec3(0.0);
	for (int i=0;i<8;i++) {
		vec4 dent = dent_points[i], force = dent_forces[i];
		float q = 1.0-smoothstep(0.0,max(0.01,dent.w),distance(point,dent.xyz));
		float ripple = 0.92+0.08*sin(dot(point,vec3(31.0,43.0,-16.0)));
		offset += (force.xyz+vec3(0.0,-0.16,0.0))*force.w*q*ripple;
	}
	return point+clamp(offset,vec3(-0.28,-0.15,-0.50),vec3(0.28,0.15,0.50));
}

void pose_surface(inout vec3 vertex, inout vec3 normal, int part) {
	vertex = dented(vertex);
	vec4 pose = section_pose[part];
	vec3 angle = pose.w > 0.5 ? pose.xyz : vec3(0.0);
	if (part == 2) angle.x += access_open.x;
	if (part == 3) angle.y += access_open.y;
	if (pose.w < 3.0 && part <= 8 && dot(angle,angle) > 0.000001) {
		vec3 pivot = section_hinge[part].xyz;
		vertex = pivot+rot(vertex-pivot,angle);
		normal = rot(normal,angle);
	}
}

float surface_noise(vec3 p) {
	p = fract(p*0.1031);
	p += dot(p,p.yzx+33.33);
	return fract((p.x+p.y)*p.z);
}

vec3 stains(vec3 color, vec3 p) {
	float soot = 0.0;
	for(int i=0;i<soot_count;i++) {
		vec4 mark = soot_marks[i];
		soot = max(soot,1.0-smoothstep(mark.w*0.42,mark.w*(0.72+0.33*surface_noise(floor(p*16.0))),distance(mark.xyz,p)));
	}
	color = mix(color,vec3(0.12,0.105,0.099),soot*0.86);
	float red = 0.0;
	for(int i=0;i<blood_count;i++) {
		vec4 drop = blood_marks[i];
		vec3 displacement = p-drop.xyz;
		float grain = 0.68+0.44*surface_noise(floor(p*31.0));
		float smear = length(displacement*vec3(1.0,(displacement.y<0.0?0.67:1.16),0.87));
		red = max(red,1.0-smoothstep(drop.w*0.23,drop.w*grain,smear));
	}
	return mix(color,vec3(0.40,0.037,0.054),red*0.94);
}
