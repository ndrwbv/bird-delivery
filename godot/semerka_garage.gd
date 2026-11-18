extends CanvasLayer

signal closed
signal next_shift_requested

const PREVIEW := preload("res://garage_preview.gd")
const BOARD := preload("res://garage_bet_board.gd")
const FACTORY := "#ebe6d8"
const PALETTE := {"#ebe6d8":"заводской","#d8262e":"красный","#f0522a":"оранжевый","#f2c21b":"жёлтый",
	"#3f9a4e":"зелёный","#46b4e0":"голубой","#2d4fa6":"синий","#7a3fb0":"фиолетовый",
	"#f27aa8":"розовый","#ecebe6":"белый","#1b1c21":"чёрный"}
const DONATIONS := preload("res://district_donations.gd")
const DEPOT_TREE_PRICE := 120000
const TITLES := {"armor":"добавить брони","engine":"улучшить мотор","wings":"крылья","gun":"гранатомёт"}
const GAMES := ["slot","roulette","tennis"]
const GAME_NAMES := {"slot":"однорукий бандит","roulette":"красное или чёрное","tennis":"теннис: кто выиграет матч"}
const BUTTON := Color("#f4e7c9")
const INK := Color("#423321")
const MUTE := Color("#796c56")
var car: CharacterBody3D
var adult := false
var profile: RefCounted
var section := ""
var pause_before := false
var center := CenterContainer.new()
var notice: Label
var wallet_label: Label
var actions: VBoxContainer
var preview: PREVIEW
var paint_open := false
var showroom: VBoxContainer
var donation_page: Control
var preset_focus: Control
var active_pad := 0
var shift_id := 0
var shift_money := 0
var spins_session := 0
var game := ""
var pick := 0
var previous_pick := {}
var stake := 0
var spinning := false
var result := {}
var board: BOARD
var spin: Tween

func setup(vehicle: CharacterBody3D, adult_version: bool) -> void:
	car = vehicle
	adult = adult_version
	layer = 10
	process_mode = Node.PROCESS_MODE_ALWAYS
	var backdrop := ColorRect.new()
	backdrop.color = Color("#251925ee")
	add_child(backdrop)
	backdrop.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	backdrop.add_child(center)
	center.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	hide()
	set_process(false)

func active() -> bool:
	return visible and not section.is_empty()

func loadout(owner: RefCounted) -> Dictionary:
	var stored: Variant = owner.data.get("semerka",{})
	if not stored is Dictionary:
		stored = {}
	var color := str(stored.get("paint",FACTORY)).to_lower()
	return {"armor":clampi(int(stored.get("armor",0)),0,3),"engine":clampi(int(stored.get("engine",0)),0,3),
		"wings":bool(stored.get("wings",false)),"gun":bool(stored.get("gun",false)),
		"paint":color if PALETTE.has(color) else FACTORY}

func open(owner: RefCounted) -> void:
	if active(): return
	_enter(owner,"garage")
	paint_open=false
	showroom = _page("техпаспорт",885)
	var layout := HBoxContainer.new()
	layout.add_theme_constant_override("separation",16)
	showroom.add_child(layout)
	var left := VBoxContainer.new()
	left.size_flags_horizontal=Control.SIZE_EXPAND_FILL
	layout.add_child(left)
	preview=PREVIEW.new()
	left.add_child(preview)
	preview.setup()
	left.add_child(_label("Семёрка",27,INK))
	left.add_child(_label("ВАЗ-2107 «белая ночь»: хром, квадратные фары",15,MUTE))
	actions=VBoxContainer.new()
	actions.custom_minimum_size.x=390
	actions.size_flags_horizontal=Control.SIZE_EXPAND_FILL
	layout.add_child(actions)
	notice=_label("",16,Color("#a24532"))
	showroom.add_child(notice)
	_button(showroom,"Помочь городу",_open_donations)
	_button(showroom,"назад",_close)
	_garage_controls()
	set_process(true)

func _garage_controls(focus_key := "") -> void:
	_clear(actions)
	preset_focus=null
	var equipped := loadout(profile)
	preview.tint(Color(equipped.paint))
	wallet_label.text = tr("в копилке")+"    "+_money(profile.data.wallet)
	var engine_state: Dictionary = profile.data.get("engine",{})
	var speed := roundi(44.0*(1+.04*int(equipped.engine))*3.6)
	_stat(actions,"скорость","%d км/ч" % speed)
	_stat(actions,"управляемость","3/10")
	_stat(actions,"мотор","%d %%" % roundi(float(engine_state.get("c",100))))
	_stat(actions,"ресурс","%d %%" % roundi(float(engine_state.get("r",100))))
	_stat(actions,"сердца","%d ♥" % (7+int(equipped.armor)))
	if paint_open:
		actions.add_child(_label(tr("покраска")+"    "+_money(1500),17,MUTE))
		var colors := GridContainer.new()
		colors.columns=3
		actions.add_child(colors)
		for hex: String in PALETTE:
			var on: bool=hex==equipped.paint
			var b:=_button(colors,("✓ " if on else "")+tr(PALETTE[hex]),_buy.bind("paint",hex))
			var swatch:= Image.create_empty(12,12,false,Image.FORMAT_RGB8)
			swatch.fill(Color(hex))
			b.icon=ImageTexture.create_from_image(swatch)
			b.disabled = not on and int(profile.data.wallet)<1500
			if on: preset_focus=b
		_button(actions,"готово",_toggle_paint)
	else:
		for key: String in TITLES:
			var installed: bool = (int(equipped[key])>=3 if key in ["armor","engine"] else bool(equipped[key]))
			var price := _price(key,equipped)
			var display := tr(TITLES[key])
			if key in ["armor","engine"]:
				display += "   %d/3" % int(equipped[key])
			if key=="gun" and not adult: display=tr("водомёт")
			var b:=_button(actions,display+"    "+("✓" if installed else _money(price)),_buy.bind(key,""))
			b.disabled=installed or int(profile.data.wallet)<price
			if not b.disabled and (not preset_focus or focus_key==key): preset_focus=b
		var paint_button:=_button(actions,tr("покрасить")+"    "+_money(1500),_toggle_paint)
		if not preset_focus or focus_key=="paint": preset_focus=paint_button
		var owned := bool(profile.data.get("depot_turret",false))
		var respect := int(profile.data.get("respect",0))
		var detail := tr("стоит у точки") if owned else (_money(DEPOT_TREE_PRICE) if respect>=130 else tr("нужно 130 респекта"))
		var tree := _button(actions,tr("ёлка-турель")+"   ·   "+detail,_buy_depot_tree)
		tree.disabled = owned or respect<130 or int(profile.data.wallet)<DEPOT_TREE_PRICE
	if preset_focus: preset_focus.grab_focus()

func _open_donations() -> void:
	if section != "garage":
		return
	section = "donate"
	(showroom.get_parent() as Control).hide()
	var page := _page("Городские проекты",590)
	donation_page = page.get_parent()
	var projects := DONATIONS.new()
	page.add_child(projects)
	projects.setup(profile)
	var back := _button(page,"назад",_close)
	back.grab_focus()


func _close_donations() -> void:
	section = "garage"
	donation_page.queue_free()
	donation_page = null
	(showroom.get_parent() as Control).show()
	_garage_controls()


func _buy_depot_tree() -> void:
	if section!="garage" or not profile or profile.data.get("depot_turret",false) or int(profile.data.get("respect",0))<130 or int(profile.data.wallet)<DEPOT_TREE_PRICE:
		return
	var previous: int = profile.data.wallet
	var had_key: bool = profile.data.has("depot_turret")
	profile.data.wallet = previous-DEPOT_TREE_PRICE
	profile.data.depot_turret = true
	if not profile.save():
		profile.data.wallet = previous
		if had_key:
			profile.data.depot_turret = false
		else:
			profile.data.erase("depot_turret")
		notice.text = tr("Не удалось сохранить покупку")
		return
	notice.text = tr("стоит у точки")
	_garage_controls()

func _price(key: String, equipped: Dictionary) -> int:
	match key:
		"armor","engine": return (1+int(equipped[key]))*6400
		"wings": return 900000
		"gun": return 800000
		"paint": return 1500
	return 0

func _toggle_paint() -> void:
	paint_open=not paint_open
	_garage_controls("paint")

func _buy(key: String, color: String) -> void:
	if section!="garage": return
	var before:=loadout(profile)
	var newer:=before.duplicate()
	match key:
		"armor","engine":
			if int(before[key])>=3: return
			newer[key]=int(before[key])+1
		"wings","gun":
			if bool(before[key]): return
			newer[key]=true
		"paint":
			if not PALETTE.has(color) or before.paint==color: return
			newer.paint=color
		_: return
	var price:=_price(key,before)
	if int(profile.data.wallet)<price:
		notice.text=tr("не хватает {money}").format({"money":_money(price-int(profile.data.wallet))})
		return
	var cash:=int(profile.data.wallet)
	var had_data: bool=profile.data.has("semerka")
	var previous: Variant=profile.data.get("semerka",{})
	profile.data.wallet=cash-price
	profile.data.semerka=newer
	if not profile.save():
		profile.data.wallet=cash
		if had_data: profile.data.semerka=previous
		else: profile.data.erase("semerka")
		notice.text=tr("Не удалось сохранить покупку")
		return
	car.apply_equipment(newer)
	notice.text=tr("покраска") if key=="paint" else tr("установлено")
	_garage_controls(key)

func open_bet(owner: RefCounted, number: int, earned: int) -> void:
	if active() or not adult or int(owner.data.wallet)<50: return
	_enter(owner,"bet")
	shift_id=number
	shift_money=earned
	game=GAMES[posmod(shift_id,GAMES.size())]
	pick=int(previous_pick.get(game,0))
	result.clear()
	_initial_stake()
	_bet_page()

func _initial_stake() -> void:
	var maximum:=_step_down(profile.data.wallet)
	stake=mini(maximum,_step_down(shift_money))
	if stake<=0: stake=mini(maximum,maxi(50,_step_down(float(maximum)/4)))

func _bet_page() -> void:
	_clear(center)
	var sheet:=_page(GAME_NAMES[game],760)
	var duo:=HBoxContainer.new()
	duo.add_theme_constant_override("separation",16)
	sheet.add_child(duo)
	board=BOARD.new()
	duo.add_child(board)
	board.configure(game,result)
	var right:=VBoxContainer.new()
	right.custom_minimum_size.x=340
	duo.add_child(right)
	notice=_label("",17,Color("#a24532"))
	wallet_label.text=tr("в копилке")+"    "+_money(profile.data.wallet)
	if not result.is_empty():
		var title:=tr("выигрыш")+"  "+_money(2*int(result.stake)) if bool(result.win) else tr("проигрыш")+"  "+_money(result.stake)
		right.add_child(_label(title,22,Color("#466b3b") if bool(result.win) else Color("#a24532")))
		var choice: String = result.get("name","")
		if not choice.is_empty(): right.add_child(_label(choice,18,INK))
		_button(right,"пора на работу",_start_next).grab_focus()
		if int(profile.data.wallet)>=50: _button(right,"крутить ещё",_again)
	else:
		right.add_child(_label(tr("выигрыш ×{k}").format({"k":2}),18,MUTE))
		if game!="slot":
			var choose:=HBoxContainer.new()
			right.add_child(choose)
			for i in 2:
				var key: String = ["красное","чёрное"][i] if game=="roulette" else ["левый","правый"][i]
				_button(choose,("✓ " if i==pick else "")+tr(key),_choose_pick.bind(i))
		var amount:=_label(tr("ставка")+"    "+_money(stake),20,INK)
		right.add_child(amount)
		var slider:=HSlider.new()
		slider.min_value=50
		slider.max_value=maxi(50,_step_down(profile.data.wallet))
		slider.step=50
		slider.value=stake
		slider.custom_minimum_size.y=27
		right.add_child(slider)
		slider.value_changed.connect(func(v:float):
			stake=_step_down(v)
			amount.text=tr("ставка")+"    "+_money(stake)
		)
		_button(right,"ва-банк",func(): slider.value=slider.max_value)
		_button(right,tr("депнуть")+"  ×2",_spin).grab_focus()
	right.add_child(notice)
	_button(sheet,"назад",_close)

func _choose_pick(index: int) -> void:
	if spinning or not result.is_empty(): return
	pick=index
	previous_pick[game]=index
	_bet_page()

func _spin() -> void:
	if spinning or not result.is_empty() or stake<50 or stake%50!=0 or int(profile.data.wallet)<stake: return
	var prob := .5 if game=="tennis" else (18.0/37 if game=="roulette" else .1)
	var win := spins_session==0 or randf()<prob
	var old:=int(profile.data.wallet)
	var next_result:={"win":win,"stake":stake}
	match game:
		"roulette":
			var wanted:=pick if win else (2 if randf()<1.0/19 else 1-pick)
			var index:=0 if wanted==2 else randi_range(0,17)*2+(1 if wanted==0 else 2)
			next_result.index=index
			next_result.name="%d · %s" % [BOARD.WHEEL[index],tr(["красное","чёрное","зеро"][wanted])]
		"slot":
			var reels:=[0,0,0] if win else [randi_range(0,5),randi_range(0,5),randi_range(0,5)]
			if not win and reels==[0,0,0]: reels[2]=1
			next_result.reels=reels
			next_result.name=tr("три семёрки!" if win else "не сошлось")
		"tennis":
			next_result.pick=pick if win else 1-pick
			next_result.name=tr("матч выиграл {who}").format({"who":tr(["левый","правый"][next_result.pick])})
	profile.data.wallet=old+(stake if win else -stake)
	if not profile.save():
		profile.data.wallet=old
		notice.text=tr("Не удалось сохранить ставку")
		return
	get_tree().call_group(&"game_audio",&"cue","bet")
	get_tree().call_group(&"local_achievements",&"deposit",win,old-stake<50)
	spins_session+=1
	result=next_result
	spinning=true
	board.configure(game,result)
	board.progress_to(0)
	spin=create_tween()
	spin.set_pause_mode(Tween.TWEEN_PAUSE_PROCESS)
	spin.tween_method(board.progress_to,0.0,1.0,2.4 if game=="tennis" else 1.8).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	spin.tween_callback(_spin_done)

func _spin_done() -> void:
	get_tree().call_group(&"game_audio",&"cue","reel-stop")
	spinning=false
	_bet_page()

func _again() -> void:
	if spinning or int(profile.data.wallet)<50: return
	result.clear()
	stake=mini(stake,_step_down(profile.data.wallet))
	_bet_page()

func _enter(owner: RefCounted, screen: String) -> void:
	profile=owner
	section=screen
	pause_before=get_tree().paused
	get_tree().paused=true
	show()

func _close() -> void:
	if not active() or spinning: return
	if section == "donate":
		_close_donations()
		return
	if section=="garage" and paint_open:
		_toggle_paint()
		return
	_dismiss()
	closed.emit()

func _start_next() -> void:
	if spinning: return
	_dismiss()
	next_shift_requested.emit()

func _dismiss() -> void:
	hide()
	section=""
	set_process(false)
	get_tree().paused=pause_before
	_clear(center)
	preview=null
	board=null

func _input(event: InputEvent) -> void:
	if not active(): return
	if event is InputEventJoypadButton or event is InputEventJoypadMotion: active_pad=event.device
	if event.is_action_pressed(&"ui_cancel") or (event is InputEventJoypadButton and event.pressed and event.button_index==JOY_BUTTON_B):
		get_viewport().set_input_as_handled()
		_close()
		return
	if spinning:
		if event is InputEventKey or event is InputEventJoypadButton or event is InputEventMouseButton:
			get_viewport().set_input_as_handled()
		return
	var x: bool=(event is InputEventKey and event.pressed and not event.echo and event.physical_keycode==KEY_X) or (event is InputEventJoypadButton and event.pressed and event.button_index==JOY_BUTTON_X)
	var y: bool=(event is InputEventKey and event.pressed and not event.echo and event.physical_keycode==KEY_Y) or (event is InputEventJoypadButton and event.pressed and event.button_index==JOY_BUTTON_Y)
	if x or y:
		get_viewport().set_input_as_handled()
		if section=="garage" and not paint_open: _buy("armor" if x else "engine","")
		elif section=="bet" and result.is_empty() and game!="slot": _choose_pick(0 if x else 1)
		elif section=="bet" and x and not result.is_empty(): _again()
	if section=="bet" and result.is_empty() and event is InputEventJoypadButton and event.pressed and event.button_index in [JOY_BUTTON_LEFT_SHOULDER,JOY_BUTTON_RIGHT_SHOULDER]:
		get_viewport().set_input_as_handled()
		stake=clampi(stake+(-50 if event.button_index==JOY_BUTTON_LEFT_SHOULDER else 50),50,_step_down(profile.data.wallet))
		_bet_page()

func _process(delta: float) -> void:
	if section=="garage" and is_instance_valid(preview):
		var axis:=Input.get_joy_axis(active_pad,JOY_AXIS_RIGHT_X)
		if absf(axis)>.18: preview.rotate_by(axis*delta*2)

func _page(title: String, width_: float) -> VBoxContainer:
	var surround:=PanelContainer.new()
	surround.custom_minimum_size.x=width_
	var style:=StyleBoxFlat.new()
	style.bg_color=Color("#fff8e5")
	style.set_corner_radius_all(5)
	style.content_margin_left=20
	style.content_margin_right=20
	style.content_margin_top=17
	style.content_margin_bottom=16
	style.shadow_color=Color("#17151c90")
	style.shadow_size=7
	surround.add_theme_stylebox_override("panel",style)
	center.add_child(surround)
	var sheet:=VBoxContainer.new()
	sheet.add_theme_constant_override("separation",9)
	surround.add_child(sheet)
	var top:=HBoxContainer.new()
	sheet.add_child(top)
	var heading:=_label(title,24,INK)
	heading.size_flags_horizontal=Control.SIZE_EXPAND_FILL
	top.add_child(heading)
	wallet_label=_label("",19,MUTE)
	top.add_child(wallet_label)
	sheet.add_child(HSeparator.new())
	return sheet

func _stat(parent: Container, key: String, value: String) -> void:
	var row:=HBoxContainer.new()
	parent.add_child(row)
	var title:=_label(key,16,MUTE)
	title.size_flags_horizontal=Control.SIZE_EXPAND_FILL
	row.add_child(title)
	row.add_child(_label(value,17,INK))

func _button(parent: Container, caption: String, action: Callable) -> Button:
	var b:=Button.new()
	b.text=tr(caption)
	b.custom_minimum_size.y=35
	b.size_flags_horizontal=Control.SIZE_EXPAND_FILL
	b.pressed.connect(action)
	parent.add_child(b)
	return b

func _label(caption: String,pixels: int,color: Color) -> Label:
	var label:=Label.new()
	label.text=tr(caption)
	label.add_theme_font_size_override("font_size",pixels)
	label.add_theme_color_override("font_color",color)
	return label

func _clear(node: Control) -> void:
	for child in node.get_children():
		node.remove_child(child)
		child.queue_free()

func _step_down(value: float) -> int:
	return floori(value/50.0)*50

func _money(value: int) -> String:
	return "%d ₽" % value
