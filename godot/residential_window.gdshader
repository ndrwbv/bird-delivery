shader_type spatial;
render_mode unshaded, cull_disabled;

#include "res://material_grade.gdshaderinc"
#include "res://quick_damage.gdshaderinc"
#include "res://core_bounds.gdshaderinc"
#include "res://residential_interior.gdshaderinc"

uniform float dusk = 0.0;
varying vec4 paint;

varying vec2 baked_xz;
varying float quick_y;

void vertex() {
	quick_y = (MODEL_MATRIX * vec4(VERTEX,1.0)).y;
	baked_xz = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xz;
	paint = COLOR;
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
