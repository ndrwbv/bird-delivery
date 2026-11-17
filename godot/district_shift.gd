extends RefCounted

const DEPOT_RADIUS := 7.0
const DISPATCH_DELAY := 0.8

var delivered := 0
var money := 0
var fee := 0
var settled := false
var depot_time := 0.0


func accept(order: Dictionary) -> void:
	fee = roundi((640.0+1.12*float(order.meters))/10.0)*10
	settled = false
	depot_time = 0.0


func settle(tips_allowed: bool, failed: bool) -> void:
	if settled:
		return
	settled = true
	if failed:
		money = maxi(0,money-fee)
		return
	delivered += 1
	money += fee
	if tips_allowed and randf() < 0.25:
		money += roundi(fee*randf_range(0.1,0.4)/10.0)*10


func wait_for_dispatch(delta: float, near: bool) -> bool:
	depot_time = depot_time+delta if near else 0.0
	return depot_time >= DISPATCH_DELAY
