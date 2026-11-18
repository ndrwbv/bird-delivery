extends Node

signal chat(message: String)

const CATALOG := "res://assets/south-pizzeria-events.json"
var host: Node3D
var calendar_busy := Callable()
var catalog: Dictionary
var translation := Translation.new()
var current := {}
var twist := {}
var slot := -1
var issued := 0
var handed := {}
var elapsed := 0.0
var announce_at := -1.0
var window_announced := false
var tick := 0.0
var hour := 9.0
var thanks_at := -1.0
var thanked := false
var pending: Array[Dictionary] = []
var destinations := {}
var saved_book: WeakRef

func setup(owner_: Node3D) -> void:
	host = owner_
	catalog = JSON.parse_string(FileAccess.get_file_as_string(CATALOG))
	translation.locale = "en"
	for key in catalog.en:
		translation.add_message(key,catalog.en[key])
	TranslationServer.add_translation(translation)

func _exit_tree() -> void:
	TranslationServer.remove_translation(translation)

func clear() -> void:
	current = {}
	twist = {}
	pending.clear()
	handed.clear()
	issued = 0
	slot = -1
	announce_at = -1.0
	thanks_at = -1.0
	thanked = false
	window_announced = false
	elapsed = 0.0
	tick = 0.0

func begin() -> void:
	clear()
	if host.ride or host.quick or (calendar_busy.is_valid() and calendar_busy.call()):
		return
	if int(host.profile.data.get("shifts",0))<int(catalog.rules.FROM):
		return
	var counted := int(host.profile.data.get("counted",0))
	var history: Dictionary = host.profile.data.get("pizzeria_events",{})
	var available: Array[int] = []
	for i in catalog.events.size():
		if counted>=int(catalog.unlock[i]):
			available.append(i)
	var id := available[0]
	for i in available:
		if not history.has(str(i)):
			id = i
			break
		id = -1
	if id<0:
		if randf()>=float(catalog.rules.CHANCE):
			return
		id = available.pick_random()
	var last: Dictionary = history.get(str(id),{})
	var variant := 0 if last.is_empty() else 1-clampi(int(last.get("variant",0)),0,1)
	history[str(id)] = {"variant":variant,"count":int(last.get("count",0))+1}
	host.profile.data.pizzeria_events = history
	host.profile.save()
	start(id,variant)

func start(id: int, variant: int) -> void:
	clear()
	slot = id
	current = catalog.events[id].duplicate(false)
	twist = current.twists[variant].duplicate(false)
	announce_at = float(catalog.rules.SAY_AT)
	hour = 9.0

func step(dt: float, clock: float) -> void:
	if current.is_empty():
		return
	elapsed += dt
	hour = clock
	if announce_at>=0 and elapsed>=announce_at:
		announce_at = -1
		chat.emit(tr(twist.say))
	tick -= dt
	if not window_announced and tick<=0:
		tick = float(catalog.rules.TICK)
		if hour>=float(twist.from):
			window_announced = true
			chat.emit(tr(twist.go))
	if thanks_at>=0 and elapsed>=thanks_at:
		thanks_at = -1
		chat.emit(tr(twist.done))
	for i in range(pending.size()-1,-1,-1):
		var row := pending[i]
		if elapsed<row.due:
			continue
		pending.remove_at(i)
		var actor := row.ref.get_ref() as Node3D
		if is_instance_valid(actor) and actor.is_inside_tree() and not actor.is_queued_for_deletion() and not actor.defeated:
			host.cast.say(actor,row.line,Color("#a8600c"),2.75)

func _sites(book: RefCounted) -> Array:
	if saved_book==null or saved_book.get_ref()!=book:
		saved_book = weakref(book)
		destinations.clear()
	if destinations.has(slot):
		return destinations[slot]
	var matches := []
	var wedding := Vector2(catalog.wedding[0],catalog.wedding[1])
	for place: Dictionary in book.candidates:
		var match_location := false
		if slot==0:
			match_location = str(place.name).to_lower().contains("победы")
		elif slot==1:
			var door: Array = place.customer
			match_location = wedding.distance_squared_to(Vector2(door[0],door[1]))<=95.0*95.0
		else:
			match_location = str(place.name).to_lower().contains("калинина")
		if match_location:
			matches.append(place)
	destinations[slot] = matches
	return matches

func _delivery_site(book: RefCounted, order: Dictionary) -> Dictionary:
	var sites: Array = _sites(book)
	var options := sites.duplicate()
	options.shuffle()
	if slot==1 and (issued==0 or sites.size()==1):
		var venue := Vector2(catalog.wedding[0],catalog.wedding[1])
		options.sort_custom(func(a,b):
			return Vector2(a.customer[0],a.customer[1]).distance_squared_to(venue)<Vector2(b.customer[0],b.customer[1]).distance_squared_to(venue))
	var recent: Array = host.profile.data.get("recent",[])
	for i in mini(options.size(),4):
		var place: Dictionary = options[i]
		if i<mini(options.size(),4)-1 and recent.has(place.name):
			continue
		var prepared: Dictionary = book._routed(place)
		if not prepared.is_empty():
			return prepared
	# Preserve an ordinary order if roadworks temporarily disconnect the event venue.
	return order if sites.any(func(s): return s.name==order.name) else {}

func apply(order: Dictionary, manifest: RefCounted, shift: RefCounted, book: RefCounted) -> bool:
	if current.is_empty() or order.has("pz") or manifest.kind not in ["solo","group"]:
		return false
	for exclusion in ["story","tutorial","edge","beach","fest","hol","quick"]:
		if order.get(exclusion,false):
			return false
	var now: float = shift.hour()
	if issued>=int(catalog.rules.MAX) or now<float(twist.from) or now>=float(twist.to) or randf()>=float(twist.share):
		return false
	var selected := _delivery_site(book,order)
	if selected.is_empty():
		return false
	var old_quote: int = shift.quote(order)
	var old_meters := float(order.meters)
	if not is_same(order,selected):
		for key in ["entrance","customer","approach","stop","name","building_id","zone","route","from_home","back_home","meters","back_meters","route_revision"]:
			if selected.has(key):
				order[key] = selected[key]
			else:
				order.erase(key)
	issued += 1
	var rate := float(twist.k)
	var base: int = shift.quote(order)
	var extra := roundi(base*(rate-1.0)/10.0)*10
	order.pz = {"k":rate,"add":extra,"tag":issued,"event":current.id,"why":tr(twist.why).replace("{k}",str(rate).replace(".",",")),"label":tr(current.label),"name":tr(current.name)}
	manifest.total_fee += base+extra-old_quote
	manifest.total_meters += float(order.meters)-old_meters
	return true

func arrived(order: Dictionary, actor: Node3D) -> void:
	if current.is_empty() or not order.has("pz"):
		return
	var meta_: Dictionary = order.pz
	if meta_.event!=current.id or handed.has(meta_.tag):
		return
	handed[meta_.tag] = true
	if is_instance_valid(actor) and not actor.defeated and randf()<float(catalog.rules.LINE_P):
		pending.append({"ref":weakref(actor),"due":elapsed+0.35,"line":twist.lines.pick_random()})
	if not thanked and handed.size()>=int(catalog.rules.DONE_AT):
		thanked = true
		thanks_at = elapsed+2.5
