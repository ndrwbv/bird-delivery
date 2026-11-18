extends RefCounted

## Keys are directed pairs of point IDs on streets open to traffic. A reverse
## direction is opened only when the entire branch would otherwise trap cars.
static func reverse_edges(directions: Dictionary) -> Array[Vector2i]:
	var outgoing := {}
	var incoming := {}
	for pair: Vector2i in directions:
		if not outgoing.has(pair.x):
			outgoing[pair.x] = []
		if not incoming.has(pair.y):
			incoming[pair.y] = []
		outgoing[pair.x].append(pair.y)
		incoming[pair.y].append(pair)
	var work: Array = directions.keys()
	var trapped := {}
	while not work.is_empty():
		var pair: Vector2i = work.pop_back()
		if trapped.has(pair) or directions.has(Vector2i(pair.y,pair.x)):
			continue
		var escape := false
		for end: int in outgoing.get(pair.y,[]):
			if end != pair.x and not trapped.has(Vector2i(pair.y,end)):
				escape = true
				break
		if not escape:
			trapped[pair] = true
			work.append_array(incoming.get(pair.x,[]))
	var result: Array[Vector2i] = []
	for pair: Vector2i in trapped:
		result.append(Vector2i(pair.y,pair.x))
	return result
