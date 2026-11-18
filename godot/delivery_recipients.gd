extends Node

# The same JSON-compatible identity goes into the save, invoice, street actor and payment.
const DATA := "res://assets/recipients/people.json"
const FACES := "res://assets/recipients/faces.png"
const AVATARS := "res://assets/recipients/avatars.png"
const SWIMMERS := "res://assets/recipients/swimmers.png"
const BEACH_SHADER := preload("res://beach_swimwear.gdshader")
const AVATAR_TYPES := ["q","bat","fat","scribble","cat","car","sunset","eye","pix","dark","flower","dick"]
const WEIGHTS := [12,7,7,9,9,6,7,5,7,6,6,5]
const WRONG_KEYS := "йцукенгшщзхъфывапролджэячсмитьбю"
const LATIN_KEYS := "qwertyuiop[]asdfghjkl;'zxcvbnm,."
const LOOKS := [0,1,2,3,4]
const MOODS := ["","happy","ok","angry"]
const SHIRT_KEYS := [Vector3(93,141,37),Vector3(25,111,37),Vector3(93,141,37),Vector3(54,115,190),Vector3(93,93,93)]
const SHIRTS := ["#d95d5d","#4f7fd6","#59b06a","#e0b13f","#8e6fd0","#e08a4f","#3fa8a0","#f4f1ea","#2b2a30",
	"#c9476b","#7fb3e0","#a3c46a","#f2d0a0","#6b4a8a","#b8b2aa","#e86f9a","#355e3b","#9a3b2e"]
const SKINS := [Vector3(235,173,130),Vector3(139,69,31),Vector3(222,147,90),Vector3(206,127,73),Vector3(100,46,19)]
const SWIM := ["#e0503c","#2e6fb8","#1d1d1b","#f2c230","#5fbf6a","#f08ab0","#8e6fd0","#2fb5b0"]
var data: Dictionary = {}
var _faces: Texture2D
var _avatars: Texture2D
var _swimmers: Texture2D
var _portraits := {}
var _clothes := {}

func _ready() -> void:
	_load()

func _load() -> void:
	if data.is_empty():
		data = JSON.parse_string(FileAccess.get_file_as_string(DATA))
	if not _faces:
		_faces = _texture(FACES)
		_avatars = _texture(AVATARS)

func _texture(path: String) -> Texture2D:
	if (not FileAccess.file_exists(path) or FileAccess.file_exists(path+".import")) and ResourceLoader.exists(path):
		var imported := ResourceLoader.load(path) as Texture2D
		if imported:
			return imported
	var raw := Image.new()
	return ImageTexture.create_from_image(raw) if raw.load(path)==OK else null

func prepare(order: Dictionary, profile: Dictionary, shift_number: int, order_number: int, adult: bool) -> void:
	if not order.get("recipients",[]).is_empty():
		return
	_load()
	var history: Array = profile.get("recipient_labels",[])
	var recent := []
	for previous: Dictionary in history:
		if int(previous.shift) >= shift_number-5:
			recent.append(previous)
	var assigned := []
	var locale := TranslationServer.get_locale().get_slice("_",0).get_slice("-",0)
	var family := locale if data.names.has(locale) else ("ru" if locale in ["be","kk","uz"] else "en")
	var count := maxi(1,int(order.get("people",1))) if not order.get("people") is Array else maxi(1,order.people.size())
	var at := str(order.get("name",""))
	var salt := str(profile.get("seed",1))+"/"+str(shift_number)+"/"+str(order_number)+"/"+at
	for i in count:
		var rng := RandomNumberGenerator.new()
		var id := (salt+"/"+str(i)).hash()
		rng.seed = id
		var person := _person(rng,id,family,adult,recent)
		if order.get("beach",false):
			person.swim = int(order.get("swim",0))
		if order.get("story",false):
			person.name = tr("Геннадий")
			person.label = person.name
			person.first = person.name
			person.avatar = "gennady"
		elif order.get("tutorial",false) or order.get("tut",false):
			person.name = tr("Степан Тугарев")
			person.label = person.name
			person.first = tr("Степан")
			person.female = false
			person.model = 0
			person.avatar = "face"
		assigned.append(person)
		if not recent.any(func(entry: Dictionary): return int(entry.seed)==id):
			recent.append({"normal":_normal(person.label),"seed":id,"label":person.label,"shift":shift_number})
	profile.recipient_labels = recent
	order.recipients = assigned

func _person(rng: RandomNumberGenerator, id: int, language: String, adult: bool, recent: Array) -> Dictionary:
	var model := rng.randi_range(0,LOOKS.size()-1)
	var female := model==1 or model==3
	var pool: Dictionary = data.names[language]
	var first: String = _pick(rng,pool.f if female else pool.m)
	var last: String = _pick(rng,pool.s)
	if female and language=="ru":
		if ["ов","ев","ёв","ин","ын"].any(func(ending): return last.ends_with(ending)):
			last += "а"
		elif ["ий","ый","ой"].any(func(ending): return last.ends_with(ending)):
			last = last.left(-2)+"ая"
	var full_name := last+first if language=="zh" else (last+" "+first if language=="ja" else first+" "+last)
	var aliases := []
	for raw: String in (data.ru if language in ["ru","uk"] else data.en):
		var pieces := raw.split(":")
		var allowed := true
		for i in range(pieces.size()-1):
			var tag := pieces[i]
			if (tag.contains("a") and not adult) or (tag.contains("m") and female) or (tag.contains("f") and not female):
				allowed = false
		if allowed:
			aliases.append(pieces[-1])
	var x := rng.randf()
	var nick: String = _pick(rng,aliases) if x<0.55 else _plain(rng,first,last,full_name,female,language)
	if x>=0.90:
		nick = _typo(rng,nick)
	nick = _claim(nick,id,aliases,recent,rng)
	var kind := "face"
	if rng.randf() >= 0.40:
		var weight := rng.randi_range(0,85 if adult else 80)
		for i in AVATAR_TYPES.size():
			weight -= int(WEIGHTS[i])
			if weight<0:
				kind = AVATAR_TYPES[i]
				break
	return {"seed":id,"name":full_name,"first":first,"label":nick,"female":female,"model":model,
		"avatar":kind,"variant":rng.randi_range(0,7),"shirt":rng.randi_range(0,SHIRTS.size()-1)}

func _plain(rng: RandomNumberGenerator, first: String, last: String, full_name: String, female: bool, language: String) -> String:
	var k := rng.randf()
	if k<0.32:
		return first
	if language=="ru" and k<0.58:
		var patronym: Array = _pick(rng,data.patronymic)
		return first+" "+str(patronym[int(female)])
	if k<0.80:
		return str(data.pet.get(first,first))+" "+last.left(1)+"."
	return full_name

func _typo(rng: RandomNumberGenerator, value: String) -> String:
	var kind := rng.randi_range(0,11)
	if kind<3:
		var i := rng.randi_range(1,maxi(1,value.length()-3))
		if i+1<value.length() and value[i]!=" " and value[i+1]!=" ":
			return value.left(i)+value[i+1]+value[i]+value.substr(i+2)
	elif kind<5:
		var i := rng.randi_range(1,maxi(1,value.length()-2))
		return value.left(i)+value.substr(i+1)
	elif kind==5:
		var i := rng.randi_range(0,value.length()-1)
		return value.left(i)+value.substr(i,1)+value.substr(i)
	elif kind in [9,10]:
		return value.to_upper()
	elif kind==11:
		var result := ""
		for ch in value:
			var at := WRONG_KEYS.find(ch.to_lower())
			result += (LATIN_KEYS[at] if ch.to_lower()==ch else LATIN_KEYS[at].to_upper()) if at>=0 else ch
		return result
	return value.to_lower().replace("ё","е")

func _claim(label: String, id: int, aliases: Array, recent: Array, rng: RandomNumberGenerator) -> String:
	var occupied := {}
	for entry: Dictionary in recent:
		if int(entry.seed)==id:
			return entry.label
		occupied[entry.normal] = true
	if not occupied.has(_normal(label)):
		return label
	var offset := rng.randi_range(0,aliases.size()-1)
	for i in aliases.size():
		var candidate: String = aliases[(i+offset)%aliases.size()]
		if not occupied.has(_normal(candidate)):
			return candidate
	return label+str(id%10000)

static func _normal(value: String) -> String:
	return value.strip_edges().to_lower().replace("ё","е")

static func _pick(rng: RandomNumberGenerator, pool: Array) -> Variant:
	return pool[rng.randi_range(0,pool.size()-1)]

func worker(seed_value: int) -> Dictionary:
	_load()
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_value
	var language := TranslationServer.get_locale().get_slice("_",0).get_slice("-",0)
	var person := _person(rng,seed_value,language if data.names.has(language) else "en",false,[])
	person.avatar = "face"
	person.label = person.name
	return person

func clothing(person: Dictionary, base: Material) -> Material:
	if not base is ShaderMaterial or not person.has("shirt"):
		return base
	var model := clampi(int(person.get("model",0)),0,SHIRT_KEYS.size()-1)
	if person.has("swim"):
		var swim := clampi(int(person.swim),0,SWIM.size()-1)
		var swim_key := Vector2i(model+100,swim)
		if not _clothes.has(swim_key):
			var beach := ShaderMaterial.new()
			beach.shader = BEACH_SHADER
			var color := Color(SWIM[swim]).srgb_to_linear()
			beach.set_shader_parameter("original_top",SHIRT_KEYS[model]/255.0)
			beach.set_shader_parameter("skin",SKINS[model]/255.0)
			beach.set_shader_parameter("swimsuit",Vector3(color.r,color.g,color.b))
			beach.set_shader_parameter("female",person.female)
			_clothes[swim_key] = beach
		return _clothes[swim_key]
	var shirt := clampi(int(person.shirt),0,SHIRTS.size()-1)
	var key := Vector2i(model,shirt)
	if not _clothes.has(key):
		var paint := base.duplicate() as ShaderMaterial
		var color := Color(SHIRTS[shirt]).srgb_to_linear()
		paint.set_shader_parameter("change_shirt",true)
		paint.set_shader_parameter("original_shirt",SHIRT_KEYS[model]/255.0)
		paint.set_shader_parameter("new_shirt",Vector3(color.r,color.g,color.b))
		_clothes[key] = paint
	return _clothes[key]

func portrait(person: Dictionary, mood := "") -> Texture2D:
	if person.is_empty():
		return null
	_load()
	var kind := str(person.get("avatar","face"))
	var face := kind in ["face","gennady"]
	var column := (5 if kind=="gennady" else int(person.get("model",0))) if face else AVATAR_TYPES.find(kind)
	var row := int(person.get("shirt",0)) if kind=="face" else 0
	if kind=="face" and person.has("swim"):
		kind = "swimmer"
		row = clampi(int(person.swim),0,SWIM.size()-1)
		if not _swimmers:
			_swimmers = _texture(SWIMMERS)
	if not face:
		row = int(person.get("variant",0)) + 8 * maxi(0,MOODS.find(mood))
	var key := "%s/%d/%d" % [kind,column,row]
	if not _portraits.has(key):
		var tile := AtlasTexture.new()
		var side := 128 if face else 64
		tile.atlas = (_swimmers if kind=="swimmer" else _faces) if face else _avatars
		tile.region = Rect2(maxi(0,column)*side,row*side,side,side)
		tile.filter_clip = true
		_portraits[key] = tile
	return _portraits[key]
