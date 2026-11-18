extends VBoxContainer

const TRASH_GOAL := 480000
const GANG_GOAL := 640000
const STEP := 4000
const PROJECTS := {
	"trash_donated":{"label":"Уборка дворов","goal":TRASH_GOAL,"detail":"Меньше мусора во дворах и до 10 п. п. к шансу чаевых."},
	"gang_donated":{"label":"Безопасные улицы","goal":GANG_GOAL,"detail":"Опасный квартал сужается. При полной сумме встречи случаются вдвое реже."}
}

var profile: RefCounted
var alert: Label
var sections := VBoxContainer.new()


func setup(owner: RefCounted) -> void:
	profile = owner
	add_theme_constant_override("separation",12)
	alert = Label.new()
	add_child(alert)
	add_child(sections)
	sections.add_theme_constant_override("separation",16)
	_refresh()


func _refresh() -> void:
	for old in sections.get_children():
		sections.remove_child(old)
		old.queue_free()
	alert.text = tr("В копилке %d ₽") % int(profile.data.wallet)
	for id: String in PROJECTS:
		var item: Dictionary = PROJECTS[id]
		var goal := int(item.goal)
		var current := clampi(int(profile.data.get(id,0)),0,goal)
		var remaining := goal-current
		var limit := maxi(0,floori(mini(remaining,int(profile.data.wallet))/float(STEP))*STEP)
		var content := VBoxContainer.new()
		sections.add_child(content)
		var title := Label.new()
		title.text = tr(item.label)
		title.add_theme_font_size_override("font_size",22)
		content.add_child(title)
		var description := Label.new()
		description.text = tr(item.detail)
		description.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		content.add_child(description)
		var progress := ProgressBar.new()
		progress.max_value = goal
		progress.value = current
		progress.show_percentage = false
		progress.custom_minimum_size.y = 7
		content.add_child(progress)
		var tally := Label.new()
		tally.text = tr("Собрано %d из %d ₽") % [current,goal] if remaining > 0 else tr("Цель собрана")
		content.add_child(tally)
		var selection := HBoxContainer.new()
		content.add_child(selection)
		var amount := HSlider.new()
		amount.min_value = STEP if limit > 0 else 0
		amount.max_value = limit
		amount.step = STEP
		amount.value = mini(limit,4*STEP)
		amount.editable = limit > 0
		amount.custom_minimum_size.x = 160
		amount.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		selection.add_child(amount)
		var confirm := Button.new()
		confirm.disabled = limit <= 0
		selection.add_child(confirm)
		_amount(amount.value,confirm)
		amount.value_changed.connect(_amount.bind(confirm))
		confirm.pressed.connect(func():
			if contribute(id,int(amount.value)):
				get_tree().call_group(&"game_audio",&"cue","coin")
				_refresh()
			else:
				alert.text = tr("Не удалось сохранить перевод.")
		)


func _amount(value: float, button: Button) -> void:
	button.text = tr("Внести %d ₽") % int(value)


func contribute(id: String, raw_amount: int) -> bool:
	if not profile or not PROJECTS.has(id):
		return false
	var goal := int(PROJECTS[id].goal)
	var wallet := int(profile.data.wallet)
	var old := clampi(int(profile.data.get(id,0)),0,goal)
	var amount := STEP*floori(mini(raw_amount,mini(wallet,goal-old))/float(STEP))
	if amount <= 0:
		return false
	var existed: bool = profile.data.has(id)
	profile.data.wallet = wallet-amount
	profile.data[id] = old+amount
	if profile.save():
		return true
	profile.data.wallet = wallet
	if existed:
		profile.data[id] = old
	else:
		profile.data.erase(id)
	return false
