shader_type spatial;
render_mode unshaded, cull_disabled, depth_draw_never;
uniform vec4 body : source_color = vec4(0.878,0.573,0.361,1.0);
uniform vec4 arrow : source_color = vec4(0.949,0.769,0.612,1.0);
uniform float car_station = 0.0;
uniform float far_station = 200.0;
uniform float front = 200.0;
uniform float opacity = 0.62;
uniform float night_factor = 1.0;
uniform vec2 car_offset = vec2(0.0);
void vertex() {
	float blend = 1.0 - smoothstep(0.0,14.0,UV.y-car_station);
	VERTEX.xz += car_offset*blend;
}
void fragment() {
	float along = UV.y;
	if (along < car_station+2.0 || along > far_station || along > front) discard;
	float x = abs(UV.x-0.5);
	if (UV2.x>.5 && mod(along,3.5)>2.1) discard;
	float phase = fract(UV2.y/3.6-TIME*.6);
	float center = 0.72-x*1.15;
	float stroke = (1.0-smoothstep(.07,.133,abs(phase-center)))*(1.0-smoothstep(.25,.305,x));
	float edge = smoothstep(0.,.55,1.-abs(UV.x*2.-1.));
	ALBEDO = mix(body.rgb,arrow.rgb,stroke*(1.-step(.5,UV2.x)))*night_factor;
	ALPHA = opacity*mix(edge,1.,step(.5,UV2.x))*smoothstep(0.,50.,far_station-along)*smoothstep(0.,3.5,along-car_station-2.)*smoothstep(0.,5.,front-along);
}
