# tag_label_3d.gd — reusable 3D data-binder primitive: a Label3D pinned to ONE
# tag. Drop it next to (or under) the mesh it annotates, set `tag` and the
# value_min/value_max ramp, and it live-updates text + color from the DataBus:
# green at value_min ramping to red at value_max, grey while offline/stale.
# The twin data-binder attaches these per node later; hand-placing works today.
class_name TagLabel3D
extends Label3D

# Typed handle on the DataBus autoload — by path, not the `DataBus` global
# (the per-file `--check-only` gate does not inject autoload names).
const DataBusScript := preload("res://core/data_bus.gd")

const COLOR_LOW := Color(0.3, 0.85, 0.4)
const COLOR_HIGH := Color(0.92, 0.25, 0.2)
const COLOR_STALE := Color(0.6, 0.6, 0.65)

## Tag name to subscribe to (must match the DataBus stream's `tag` field).
@export var tag := ""
## Value that maps to the green end of the ramp.
@export var value_min := 0.0
## Value that maps to the red end of the ramp.
@export var value_max := 100.0
## printf-style format for the displayed value.
@export var value_format := "%.2f"

@onready var _data_bus: DataBusScript = get_node("/root/DataBus")


func _ready() -> void:
	billboard = BaseMaterial3D.BILLBOARD_ENABLED
	text = "%s\n--" % tag
	modulate = COLOR_STALE
	_data_bus.tag_update.connect(_on_data_bus_tag_update)
	_data_bus.connection_changed.connect(_on_data_bus_connection_changed)


func _on_data_bus_tag_update(
	update_tag: String, value: float, _seq: int, _latency_ms: float
) -> void:
	if update_tag != tag:
		return
	text = "%s\n%s" % [tag, value_format % value]
	var ramp := 1.0
	if not is_equal_approx(value_min, value_max):
		ramp = clampf(inverse_lerp(value_min, value_max, value), 0.0, 1.0)
	modulate = COLOR_LOW.lerp(COLOR_HIGH, ramp)


func _on_data_bus_connection_changed(up: bool) -> void:
	if not up:
		modulate = COLOR_STALE
