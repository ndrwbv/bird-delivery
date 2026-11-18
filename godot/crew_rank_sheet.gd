extends CanvasLayer

# The temporary Steam list is queued after a delivery, behind the payment/other messages.
const INK := Color("#342a24")
var card := PanelContainer.new()
var content := VBoxContainer.new()
var phase := ""
var elapsed := 0.0
var hold := 4.2
var prev := {}
var tween: Tween

func _ready() -> void:
	layer = 3
	add_child(card)
	card.mouse_filter = Control.MOUSE_FILTER_IGNORE
	card.set_anchors_and_offsets_preset(Control.PRESET_CENTER_LEFT)
	card.position = Vector2(20,0)
	card.custom_minimum_size.x = 291
	var style := StyleBoxFlat.new()
	style.bg_color = Color("#f3e5cc")
	style.set_corner_radius_all(5)
	for side in [SIDE_TOP,SIDE_RIGHT,SIDE_BOTTOM,SIDE_LEFT]:
		style.set_content_margin(side,12)
	card.add_theme_stylebox_override("panel",style)
	card.add_child(content)
	content.add_theme_constant_override("separation",5)
	card.hide()

func delivered() -> void:
	phase = "wait"
	elapsed = 0

func step(delta: float, free: bool, clash: bool, rows: Callable) -> void:
	if phase.is_empty() or clash:
		return
	elapsed += delta
	if phase=="wait" and elapsed>20:
		clear(false)
		return
	if phase=="wait" and free and elapsed>=1.1:
		var scores: Array = rows.call()
		if scores.size()<2:
			clear(false)
			return
		hold = 2.5 if elapsed>10 else 4.2
		elapsed = 0
		var ride := get_tree().get_first_node_in_group("ride_notifications")
		if ride and ride.visible and ride.phone:
			ride.queue_rank(scores,hold)
			phase = ""
		else:
			phase = "show"
			_build(scores)
	elif phase=="show":
		if not free:
			clear(false)
		elif elapsed>=hold:
			phase = "close"
			if tween:
				tween.kill()
			tween = create_tween()
			tween.tween_property(card,"modulate:a",0,.2)
			tween.tween_callback(clear.bind(false))

func _build(scores: Array) -> void:
	for c in content.get_children():
		content.remove_child(c)
		c.queue_free()
	var title := Label.new()
	title.text = tr("Рейтинг смены").to_upper()
	title.add_theme_font_size_override("font_size",16)
	title.add_theme_color_override("font_color",INK)
	content.add_child(title)
	for i in scores.size():
		var r: Dictionary = scores[i]
		var row := HBoxContainer.new()
		content.add_child(row)
		var id := str(r.name)
		var delta_rank := int(prev.get(id,i))-i
		prev[id] = i
		var leading := "%d  %s" % [i+1,r.name]
		if delta_rank!=0:
			leading += " ↑" if delta_rank>0 else " ↓"
		var name_ := _text(leading,row,r.me)
		name_.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		_text("%d  ·  %d ₽"%[r.deliveries,r.money],row,r.me)
	card.show()
	card.offset_left = 20
	card.position.y = get_viewport().get_visible_rect().size.y*.39
	card.modulate.a = 0
	if tween:
		tween.kill()
	tween = create_tween()
	tween.tween_property(card,"modulate:a",1.0,.3)

func _text(value: String, row: HBoxContainer, own: bool) -> Label:
	var label := Label.new()
	label.text = value
	label.add_theme_color_override("font_color",Color("#935122") if own else INK)
	label.add_theme_font_size_override("font_size",15)
	row.add_child(label)
	return label

func clear(reset_positions := true) -> void:
	phase = ""
	if tween:
		tween.kill()
		tween = null
	card.hide()
	if reset_positions:
		prev.clear()
