extends RefCounted

# One calendar seed belongs to a career. Only completed shifts change its position.
const SEASONS := ["winter","spring","summer","autumn"]
const LENGTHS := [3,3,4,3]
const SEAMS := ["frost","maysnow","hotagain","indian"]
const TRANSITIONS := ["thaw","","leaffall","firstsnow"]
const POSITIONS := {
	"winter": [2.22,2.8], "spring": [3.18,3.72], "summer": [0.12,0.82], "autumn": [1.42,1.88],
	"thaw":[2.99,3.05], "leaffall":[1.18,1.3], "firstsnow":[2.02,2.06], "frost":[2.74,2.8],
	"maysnow":[3.6,3.7], "hotagain":[0.8,0.86], "indian":[1.4,1.5]
}
const QUICK := {"summer":0.45,"autumn":1.45,"winter":2.50,"spring":3.50}
const TRANSITION_SEASONS := {"thaw":"spring","leaffall":"autumn","firstsnow":"winter","frost":"winter",
	"maysnow":"spring","hotagain":"summer","indian":"autumn"}
const PROBABILITY := {
	"winter":{"clear":65,"snowy":35}, "spring":{"clear":64,"rain":25,"storm":8,"hurricane":3},
	"summer":{"clear":62,"heat":15,"rain":13,"storm":7,"hurricane":3},
	"autumn":{"clear":48,"golden":30,"rain":12,"storm":6,"hurricane":4},
	"thaw":{"thaw":100}, "leaffall":{"golden":45,"clear":40,"rain":15}, "firstsnow":{"firstsnow":100},
	"frost":{"snowy":100}, "maysnow":{"maysnow":100}, "hotagain":{"heat":100}, "indian":{"golden":100}
}
var years := {}
var last_seed := -1

static func _mul32(a: int, b: int) -> int:
	return (((a & 65535)*b) + (((a >> 16) & 65535) * (b & 65535) << 16)) & 0xffffffff

static func random01(seed_value: int, n: int) -> float:
	var h := _mul32(seed_value ^ 0x5bd1e995,0x9e3779b1) ^ _mul32(n+0x27d4eb2d,0x85ebca6b)
	h = _mul32(h ^ (h >> 15),0xc2b2ae35)
	h = _mul32(h ^ (h >> 13),0x27d4eb2f)
	return float(h ^ (h >> 16))/4294967296.0

static func pick(table: Dictionary, r: float) -> String:
	var total := 0.0
	for weight: int in table.values():
		total += weight
	var target := total*r
	for id: String in table:
		target -= int(table[id])
		if target < 0.0:
			return id
	return str(table.keys().back())

func _entry(key: String, fraction: float, holiday := "") -> Dictionary:
	var span: Array = POSITIONS[key]
	return {"key":key, "season":TRANSITION_SEASONS.get(key,key),
		"value":lerpf(span[0],span[1],clampf(fraction,0,1)),"holiday":holiday}

func _year(y: int, seed_value: int) -> Array:
	if years.has(y):
		return years[y]
	var entries := []
	for index in SEASONS.size():
		var season_id: String = SEASONS[index]
		var count: int = LENGTHS[index]+(1 if y == 0 and index == 0 else 0)
		for i in count:
			var holiday := ""
			if season_id == "winter" and i == (3 if y == 0 else 1):
				holiday = "newyear"
			elif season_id == "autumn" and i == count-1:
				holiday = "halloween"
			var fraction := (i+0.5)/count + (random01(seed_value,y*97+entries.size())-0.5)*0.08
			entries.append(_entry(season_id,fraction,holiday))
		if (index != 0 or y != 0) and random01(seed_value^0x51ce,y*7+index) < 0.2:
			entries.append(_entry(SEAMS[index],random01(seed_value,y*131+index+10)))
		if TRANSITIONS[index] != "":
			entries.append(_entry(TRANSITIONS[index],random01(seed_value,y*131+index)))
	years[y] = entries
	return entries

func at(number: int, seed_value: int) -> Dictionary:
	if last_seed != seed_value:
		last_seed = seed_value
		years.clear()
	var position := maxi(0,number-1)
	var offset := 0
	for y in 501:
		var entries := _year(y,seed_value)
		if position >= entries.size() and y < 500:
			position -= entries.size()
			offset += entries.size()
			continue
		var previous := ""
		var result := {}
		# A special first-snow shift ends every year independently of the weather roll.
		if y > 0:
			previous = "winter/firstsnow"
		for i in range(mini(position,entries.size()-1)+1):
			var entry: Dictionary = entries[i]
			var id := "clear"
			if offset+i != 0:
				for retry in 16:
					id = pick(PROBABILITY[entry.key],random01(seed_value ^ 0x71e2,(offset+i)*16+retry))
					if id == "hurricane" and offset+i < 8:
						id = "storm"
					if TRANSITION_SEASONS.has(entry.key) or previous != entry.season+"/"+id:
						break
			previous = entry.season+"/"+id
			result = entry.duplicate()
			result.weather = id
		return result
	return {}

static func curve(v: float, points: Array) -> float:
	for i in range(1,points.size()):
		var a: Array = points[i-1]
		var b: Array = points[i]
		if v <= float(b[0]):
			return lerpf(a[1],b[1],inverse_lerp(a[0],b[0],v))
	return points.back()[1]

static func cover(v: float, weather_id: String) -> Dictionary:
	var snow := curve(v,[[0,0],[1.92,0],[2.1,1],[2.85,1],[3.08,0],[4,0]])
	var ice := curve(v,[[0,0],[2.04,0],[2.25,1],[2.82,1],[2.96,0],[4,0]])
	var leaves := curve(v,[[0,1],[1.35,1],[1.85,0],[3.05,0],[3.35,1],[4,1]])
	var yellow := curve(v,[[0,0],[0.92,0],[1.4,1],[2.95,1],[3.0,0],[4,0]])
	var dry := curve(v,[[0,0],[0.8,0.1],[1.1,0.45],[1.55,1],[2.9,1],[3.1,0],[4,0]])
	var soil_wet := curve(v,[[0,0],[1.5,0],[1.75,0.5],[1.95,0],[2.85,0],[3.08,1],[3.4,0.35],[3.7,0],[4,0]])
	match weather_id:
		"golden":
			leaves = maxf(leaves,0.85)
			yellow = 1
			dry = maxf(dry,0.6)
			soil_wet = 0
		"heat":
			dry = 1
			yellow = 0
			soil_wet = 0
		"snowy":
			snow = maxf(snow,0.95)
			ice = maxf(ice,0.9)
		"rain": soil_wet = maxf(soil_wet,0.65)
		"storm","hurricane": soil_wet = maxf(soil_wet,0.85)
		"thaw": soil_wet = maxf(soil_wet,0.9)
		"maysnow":
			snow = maxf(snow,0.6)
			soil_wet = maxf(soil_wet,0.4)
	return {"snow":snow,"ice":ice,"leaves":leaves,"yellow":yellow,"dry":dry,"soil_wet":soil_wet}
