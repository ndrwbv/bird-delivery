extends CanvasLayer

signal changed

class RoadPreview extends Control:
	func _draw() -> void:
		var rect := Rect2(0,5,size.x,size.y-10)
		draw_rect(rect,Color("#51545a"))
		draw_rect(Rect2(0,size.y*.5-9,size.x,18),Color("#e68a48"))
		for x in range(12,int(size.x)-8,26):
			var y := size.y*.5
			draw_polyline(PackedVector2Array([Vector2(x,y-6),Vector2(x+8,y),Vector2(x,y+6)]),Color("#fff1d0"),3,true)

var profile: RefCounted
var papers: CanvasLayer
var available: Callable
var buttons: Array[Button] = []
var shade: ColorRect
var seal := Label.new()
var hint := Label.new()
var selected := 0
var arm_at := 0
var close_at := 0
var next_check := 0.0
var held_joy := Vector2i.ZERO

func setup(career: RefCounted, receipts: CanvasLayer, can_show: Callable) -> void:
	profile=career
	papers=receipts
	available=can_show
	papers.receipt_blocker=active
	layer=30
	process_mode=Node.PROCESS_MODE_ALWAYS
	shade=ColorRect.new()
	shade.color=Color("#1b1914ba")
	add_child(shade)
	shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var center:=CenterContainer.new()
	shade.add_child(center)
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var card:=PanelContainer.new()
	var paper:=StyleBoxFlat.new()
	paper.bg_color=Color("#fff6df")
	paper.border_color=Color("#614e35")
	paper.set_border_width_all(2)
	paper.set_content_margin_all(20)
	card.add_theme_stylebox_override("panel",paper)
	card.custom_minimum_size.x=455
	center.add_child(card)
	var col:=VBoxContainer.new()
	col.add_theme_constant_override("separation",9)
	card.add_child(col)
	col.add_child(_label("навигатор",15))
	col.add_child(_label("первая смена позади",16))
	col.add_child(_label("Оставить путь на дороге?",27))
	var preview:=RoadPreview.new()
	preview.custom_minimum_size=Vector2(240,53)
	preview.mouse_filter=Control.MOUSE_FILTER_IGNORE
	col.add_child(preview)
	col.add_child(_label("всю первую смену к клиенту вела оранжевая полоса, назад в пиццерию — зелёная",16))
	var row:=HBoxContainer.new()
	col.add_child(row)
	for i in 2:
		var button:=Button.new()
		button.text="оставить" if i==0 else "убрать"
		button.custom_minimum_size.y=39
		button.size_flags_horizontal=Control.SIZE_EXPAND_FILL
		button.pressed.connect(_pick.bind(i))
		button.mouse_entered.connect(_focus.bind(i))
		button.focus_entered.connect(func(): selected=i)
		row.add_child(button)
		buttons.append(button)
	col.add_child(_label("если что — поменять можно в настройках: игра → путь на дороге",15))
	hint.add_theme_color_override("font_color",Color("#6d5a43"))
	col.add_child(hint)
	seal.add_theme_font_size_override("font_size",20)
	seal.horizontal_alignment=HORIZONTAL_ALIGNMENT_CENTER
	col.add_child(seal)
	hide()

func _label(copy: String, size_: int) -> Label:
	var l:=Label.new()
	l.text=copy
	l.autowrap_mode=TextServer.AUTOWRAP_WORD_SMART
	l.add_theme_color_override("font_color",Color("#493f32"))
	l.add_theme_font_size_override("font_size",size_)
	return l

func active() -> bool:
	return visible

func wanted() -> bool:
	return int(profile.data.get("shifts",0))==0 or preference()

func preference() -> bool:
	return bool(profile.data.get("road_path",true))

func set_preference(on: bool) -> void:
	profile.data.road_path=on
	profile.save()
	changed.emit()

func shift_ending(number: int) -> void:
	if number==1 and not profile.data.has("road_path_ask"):
		profile.data.road_path_ask=1

func _process(delta: float) -> void:
	if visible:
		if not papers.blocking() or not papers.visible:
			_close()
		elif close_at>0:
			var remaining:=close_at-Time.get_ticks_msec()
			if remaining<=0:_close()
			else:shade.modulate.a=clampf(remaining/250.0,0,1)
		return
	next_check-=delta
	if next_check>0: return
	next_check=.12
	if int(profile.data.get("road_path_ask",0))!=1 or not papers.blocking() or not papers.visible or papers.printing or papers.returning_from_spending:
		return
	if available.is_valid() and not available.call(): return
	arm_at=Time.get_ticks_msec()+400
	close_at=0
	held_joy=Vector2i.ZERO
	shade.modulate.a=1.0
	seal.hide()
	for b in buttons:b.disabled=false
	_update_hint(not Input.get_connected_joypads().is_empty())
	show()
	_focus(0)
	get_tree().call_group(&"game_audio",&"cue","ui-click")

func _focus(i: int) -> void:
	if visible and close_at==0:
		selected=i
		buttons[i].grab_focus()

func _pick(i: int) -> void:
	if not visible or close_at>0 or Time.get_ticks_msec()<arm_at:return
	profile.data.road_path=i==0
	profile.data.road_path_ask=2
	profile.save()
	changed.emit()
	for b in buttons:b.disabled=true
	seal.text=tr("оставили") if i==0 else tr("убрали")
	seal.add_theme_color_override("font_color",Color("#3e774c") if i==0 else Color("#a04c33"))
	seal.show()
	close_at=Time.get_ticks_msec()+900
	get_tree().call_group(&"game_audio",&"cue","ui-click")

func _close() -> void:
	hide()
	close_at=0
	if papers.blocking() and papers.visible:
		papers.input_after=Time.get_ticks_msec()+180
		papers.receipt_buttons[0].grab_focus.call_deferred()

func _update_hint(pad: bool) -> void:
	hint.text="◀ ▶ %s   ·   %s %s   ·   %s %s" % [tr("выбрать"),"A" if pad else "Enter",tr("нажать"),"B" if pad else "Esc",tr("убрать")]

func _input(event: InputEvent) -> void:
	if not visible:return
	if event is InputEventKey:
		if event.pressed and not event.echo and not event.is_command_or_control_pressed():
			_update_hint(false)
			match event.physical_keycode if event.physical_keycode!=KEY_NONE else event.keycode:
				KEY_A,KEY_W,KEY_LEFT,KEY_UP:_focus(0)
				KEY_D,KEY_S,KEY_RIGHT,KEY_DOWN,KEY_TAB:_focus(1-selected)
				KEY_SPACE,KEY_ENTER,KEY_KP_ENTER:_pick(selected)
				KEY_ESCAPE,KEY_BACKSPACE:_pick(1)
		get_viewport().set_input_as_handled()
	elif event is InputEventJoypadButton:
		_update_hint(true)
		if event.pressed:
			match event.button_index:
				JOY_BUTTON_DPAD_LEFT,JOY_BUTTON_DPAD_UP:_focus(0)
				JOY_BUTTON_DPAD_RIGHT,JOY_BUTTON_DPAD_DOWN:_focus(1)
				JOY_BUTTON_A:_pick(selected)
				JOY_BUTTON_B:_pick(1)
		get_viewport().set_input_as_handled()
	elif event is InputEventJoypadMotion and event.axis in [JOY_AXIS_LEFT_X,JOY_AXIS_LEFT_Y]:
		var axis:int=event.axis
		var sign_:=signi(roundi(event.axis_value)) if absf(event.axis_value)>.62 else 0
		if sign_!=held_joy[axis] and sign_!=0:_focus(1 if sign_>0 else 0)
		held_joy[axis]=sign_
		get_viewport().set_input_as_handled()
