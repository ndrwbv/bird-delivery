extends Node

signal paid(amount: int)
signal notice(text: String, kind: String, duration: float)
const DEFINITIONS := "res://assets/daily-tasks.json"
const FAIL := {"gentle":"bump","nokill":"kill","noscratch":"hit","nocoffee":"nos","ontime":"late"}
const CLASH := [["nokill","peds","bloodrun","rampage"],["noscratch","wrecks","dents","dump"]]
const TOTAL := ["ppl","car","stop","bench","post","fence","bin","other","burger"]
var definitions := {}
var tasks: Array[Dictionary] = []
var earned := 0
var current_order := false
var dirty := {}
var counts := {}
var dented := {}
var note_time := 0.0
var introduced := false
var profile: RefCounted
var shift: RefCounted

func begin(career: RefCounted, run: RefCounted, adult: bool, quick: bool, has_dump := false) -> void:
	clear()
	if quick or run.number < 5:
		return
	if definitions.is_empty():
		definitions = JSON.parse_string(FileAccess.get_file_as_string(DEFINITIONS))
	profile = career
	shift = run
	var count := 3 if run.number >= 12 else (2 if run.number >= 8 else 1)
	var length_index := 2 if run.number-1 >= 8 else (1 if run.number-1 >= 3 else 0)
	var last: Array = profile.data.get("daily_last",[])
	var calm := []
	var wild := []
	var old_calm := []
	var old_wild := []
	for id: String in definitions:
		var d: Dictionary = definitions[id]
		if d.get("who","") == ("kids" if adult else "adult") or (d.get("need","")=="build" and not has_dump):
			continue
		if d.get("wild",false):
			(old_wild if id in last else wild).append(id)
		else:
			(old_calm if id in last else calm).append(id)
	for pool: Array in [calm,wild,old_calm,old_wild]:
		pool.shuffle()
	calm.append_array(old_calm)
	wild.append_array(old_wild)
	var chosen := []
	for i in count:
		var want_wild: bool = run.number>5 and randf()<.5
		var id := _pick(wild if want_wild else calm,chosen)
		if id.is_empty():id = _pick(calm if want_wild else wild,chosen)
		if id.is_empty():break
		chosen.append(id)
		var d: Dictionary = definitions[id]
		var labels: Array = d.get("kids",d.labels) if not adult else d.labels
		tasks.append({"id":id,"n":int(d.n[length_index]),"label":labels[length_index],"got":0,"done":false,
			"pay":int(d.pay),"src":d.get("src",""),"per":d.get("per","")})
	profile.data.daily_last=chosen
	profile.save()

func _pick(pool: Array, chosen: Array) -> String:
	for i in pool.size():
		var id: String=pool[i]
		var blocked := false
		for group: Array in CLASH:
			if id==group[0]:
				for other in chosen:
					if other in group:blocked=true
			elif id in group and group[0] in chosen:
				blocked=true
		if not blocked:
			pool.remove_at(i)
			return id
	return ""

func clear() -> void:
	tasks.clear()
	earned=0
	shift=null
	profile=null
	introduced=false
	note_time=0
	dented.clear()
	end_order()

func new_order() -> void:
	end_order()
	current_order=true
	for task in tasks:
		if task.per=="order" and not task.done:
			task.got=0

func end_order() -> void:
	current_order=false
	dirty.clear()
	counts.clear()

func step(dt: float, driving: bool) -> void:
	if introduced or tasks.is_empty() or not current_order or not driving:return
	note_time+=dt
	if note_time>1.2:
		introduced=true
		var lines:=PackedStringArray([tr("задания на день")])
		for task in tasks:
			lines.append("%s    +%d ₽" % [tr(task.label),task.pay])
		notice.emit("\n".join(lines),"note",7.3)

func fail(why: String) -> void:
	if tasks.is_empty() or dirty.has(why):return
	dirty[why]=true
	for task in tasks:
		if not task.done and FAIL.get(task.id,"")==why:task.got=0

func vehicle_dented(who: Node, impact: float) -> void:
	if tasks.is_empty() or not is_instance_valid(who) or impact<=8.0:return
	var id:=who.get_instance_id()
	if not dented.has(id):
		dented[id]=true
		tally("car")

func tally(kind: String, amount := 1) -> void:
	if tasks.is_empty() or amount<=0:return
	if kind=="ppl":fail("kill")
	_add_count(kind,amount)
	if kind in TOTAL:_add_count("all",amount)

func _add_count(kind: String, amount: int) -> void:
	if current_order:counts[kind]=int(counts.get(kind,0))+amount
	for task in tasks:
		if task.done or task.src!=kind:continue
		if task.per=="order":
			if current_order:task.got=mini(task.n,counts[kind])
		else:
			_increment(task,amount)

func deliver(on_time: bool, fast: bool, last: bool, bundle_all: bool, excluded := false) -> void:
	if excluded or not current_order or tasks.is_empty():return
	if not on_time:fail("late")
	for task in tasks:
		if task.done:continue
		if task.id=="fast" and fast and on_time:
			_increment(task,1)
		elif last and FAIL.has(task.id) and not dirty.has(FAIL[task.id]):
			_increment(task,1)
		elif last and task.per=="order" and task.got>=task.n:
			_complete(task)
		elif last and task.id=="bundle" and bundle_all:
			_increment(task,1)
	if last:current_order=false

func _increment(task: Dictionary, by: int) -> void:
	task.got=mini(task.n,int(task.got)+by)
	if task.got>=task.n:_complete(task)

func _complete(task: Dictionary) -> void:
	if task.done:return
	task.done=true
	earned+=int(task.pay)
	shift.money+=int(task.pay)
	profile.data.wallet=int(profile.data.wallet)+int(task.pay)
	profile.save()
	paid.emit(task.pay)
	notice.emit("%s\n%s    +%d ₽" % [tr("задание выполнено"),tr(task.label),task.pay],"daily",4.3)

func summary() -> Dictionary:
	if tasks.is_empty():return {}
	var done:=0
	for task in tasks:
		if task.done:done+=1
	return {"done":done,"total":tasks.size(),"earned":earned}
