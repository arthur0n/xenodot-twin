# camera_rig.gd — the viewer camera. Two modes, toggled with Tab:
#   ORBIT (default): left-drag rotates around the focus point, wheel zooms.
#   FLY: captured mouse looks, WASD moves (Q/E down/up), Shift is fast. Esc exits.
# Node contract: attach to a Node3D with the child chain Pitch (Node3D) -> Camera3D.
# The rig node itself is the yaw axis and, in orbit mode, the focus point.
extends Node3D

enum Mode { ORBIT, FLY }

const ORBIT_SENSITIVITY := 0.008
const FLY_SENSITIVITY := 0.003
const PITCH_LIMIT := 1.53  # rad — stop short of straight up/down
const ZOOM_STEP := 1.12
const MIN_DISTANCE := 0.5
const MAX_DISTANCE := 2000.0
const FLY_SPEED := 8.0
const FLY_FAST_MULTIPLIER := 4.0

var mode := Mode.ORBIT

var _distance := 12.0

@onready var _pitch: Node3D = $Pitch
@onready var _camera: Camera3D = $Pitch/Camera3D


func _ready() -> void:
	position = Vector3(0.0, 1.0, 0.0)
	_pitch.rotation.x = deg_to_rad(-28.0)
	_camera.position.z = _distance


func _process(delta: float) -> void:
	if mode != Mode.FLY:
		return
	var wish := Vector3.ZERO
	if Input.is_physical_key_pressed(KEY_W):
		wish.z -= 1.0
	if Input.is_physical_key_pressed(KEY_S):
		wish.z += 1.0
	if Input.is_physical_key_pressed(KEY_A):
		wish.x -= 1.0
	if Input.is_physical_key_pressed(KEY_D):
		wish.x += 1.0
	if Input.is_physical_key_pressed(KEY_Q):
		wish.y -= 1.0
	if Input.is_physical_key_pressed(KEY_E):
		wish.y += 1.0
	if wish == Vector3.ZERO:
		return
	var speed := FLY_SPEED
	if Input.is_physical_key_pressed(KEY_SHIFT):
		speed *= FLY_FAST_MULTIPLIER
	var cam_basis := _camera.global_transform.basis
	global_position += (cam_basis * wish).normalized() * speed * delta


func _unhandled_input(event: InputEvent) -> void:
	var key := event as InputEventKey
	if key != null:
		if key.pressed and not key.echo:
			if key.physical_keycode == KEY_TAB:
				set_mode(Mode.FLY if mode == Mode.ORBIT else Mode.ORBIT)
				get_viewport().set_input_as_handled()
			elif key.physical_keycode == KEY_ESCAPE and mode == Mode.FLY:
				set_mode(Mode.ORBIT)
				get_viewport().set_input_as_handled()
		return
	var motion := event as InputEventMouseMotion
	if motion != null:
		if mode == Mode.FLY:
			_rotate_by(motion.relative * FLY_SENSITIVITY)
		elif Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT):
			_rotate_by(motion.relative * ORBIT_SENSITIVITY)
		return
	var button := event as InputEventMouseButton
	if button != null and button.pressed and mode == Mode.ORBIT:
		if button.button_index == MOUSE_BUTTON_WHEEL_UP:
			_set_distance(_distance / ZOOM_STEP)
		elif button.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			_set_distance(_distance * ZOOM_STEP)


## Switch modes while keeping the camera's global pose continuous.
func set_mode(new_mode: Mode) -> void:
	if new_mode == mode:
		return
	mode = new_mode
	if mode == Mode.FLY:
		# Collapse the orbit arm: the rig moves to the camera, which becomes free.
		var cam_pos := _camera.global_position
		global_position = cam_pos
		_camera.position.z = 0.0
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	else:
		# Re-extend the arm: focus lands _distance ahead of the current view.
		var cam_pos := _camera.global_position
		var forward := -_camera.global_transform.basis.z
		global_position = cam_pos + forward * _distance
		_camera.position.z = _distance
		Input.mouse_mode = Input.MOUSE_MODE_VISIBLE


## Center the orbit focus on `bounds` and back off far enough to see all of it.
## Used by main.gd after a runtime model load.
func frame(bounds: AABB) -> void:
	set_mode(Mode.ORBIT)
	global_position = bounds.get_center()
	_set_distance(maxf(bounds.get_longest_axis_size() * 1.4, MIN_DISTANCE * 4.0))


func _rotate_by(delta_px: Vector2) -> void:
	rotation.y -= delta_px.x
	_pitch.rotation.x = clampf(_pitch.rotation.x - delta_px.y, -PITCH_LIMIT, PITCH_LIMIT)


func _set_distance(new_distance: float) -> void:
	_distance = clampf(new_distance, MIN_DISTANCE, MAX_DISTANCE)
	if mode == Mode.ORBIT:
		_camera.position.z = _distance
