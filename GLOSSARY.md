# Crisply2404 Personal Site

This context is a personal site whose homepage is a playable corridor. The corridor connects the site to writing and projects while showing temporary visitors as the same kind of ball used by the game that inspired the site.

## Language

**Game view**:
The homepage mode that renders the corridor, doors, local ball, and temporary visitor balls.
_Avoid_: game page, 3D mode

**List view**:
The homepage mode that lists the corridor doors from top to bottom using the same visual language as the Game view. Entrance rows show titles and invert their colors on hover or keyboard focus.
_Avoid_: normal page, fallback page

**Entrance ball**:
The single MONO TOWER player ball beside the List view entrance titles. It starts beside the first entrance and follows a newly hovered or focused title with an ease-out movement. It also responds to the game's keyboard movement, jumping, rotation and control modes. View rotation preserves the ball's current screen center; only movement changes its position. A Cursor block pushes it and preserves its displaced position until the selected entrance changes. The Cursor spike breaks its outline into fragments; when the spike moves away the ball respawns beside the nearest title. Its colors invert with the row. Platform motion preferences preserve the full animation.

**Game cursor**:
The original standard block with one spike on top, replacing the mouse cursor in the List view. The spike tip marks the pointer position. Its view rotates around its own center with the keyboard, and its projected block and spike geometry define the Entrance ball collision areas. Each pixel inverts over highlighted entrance regions while preserving its appearance over black regions. It is hidden for touch input and removed when leaving the List view.

**Corridor**:
A straight, extendable passage whose configured doors are the site's entrances.
_Avoid_: map, hub

**Door**:
A configured entrance that names a site area and has a side, position, path, and visual treatment.
_Avoid_: link card, portal

**Door graphic**:
A title set in the List view's system sans-serif font with an independently adjustable weight (default 500), or a content symbol in the Door's plane. Notes and Essays use native complete-word layout and kerning at the same font size, with only the initial letter capitalized. Titles remain readable from either side. Notes uses a geometric page; Essays represents informal personal writing with a continuous handwritten stroke. Symbols share their own screen-space stroke width, are centered, and fit within a 38 × 38 world-unit area inside the frame. Symbol Doors have opaque interiors. A Door hiding a visitor ball's center hides the whole ball; an uncovered center keeps the whole ball visible. The drum Door uses its original favicon paths as its symbol alone.

**Control tutorial**:
The temporary animated game diagrams shown on a transparent foreground layer when entering the Game view. Desktop and mobile diagrams occupy the upper screen. Objects and input symbols remain opaque. Desktop diagrams demonstrate WASD movement in the selected control mode, adjacent mouse navigation, jumping, view rotation, three control modes and Enter to speak. Mobile diagrams use matching finger outlines with 1px borders to demonstrate a one-finger tap and two independent fingers for zoom and pan, alongside rotation, jumping and tapping one's ball to speak. Repeated loops finish with a fade and resource release.

**View gesture**:
Two fingers on the Game view canvas change orthographic zoom and camera position around their midpoint. Mobile zoom ranges from 1 to 3 and starts at 1.5. The complete local ball stays inside the screen during gestures, camera rotation and resize. Canvas gestures keep the mobile rotation and jump buttons at fixed screen positions and never generate navigation taps.

**Visitor ball**:
A temporary, uniformly styled ball representing one visitor currently in the Game view.
_Avoid_: user avatar, profile ball

**Speech bubble**:
A temporary message or message editor directly above its visitor ball. Only nearby visitors receive the message. The editor opens and closes with an animated change in size and visibility.

**Speech range**:
The maximum distance between visitor balls at which one visitor can receive and read another visitor's message.

**Presence lobby**:
The single temporary group in which Game view visitors exchange current ball positions.
_Avoid_: room history, visitor database

**Safety navigation graph**:
The walkable graph of safe floor, door approach areas, and explicitly configured future jump connections. A path exists only when every node and connection is safe.
_Avoid_: click path, auto route

**MONO TOWER object model**:
The reference vocabulary of standard blocks, spikes, strokes, gates, exit signs, checkpoints, contact markers, and player balls. The site's Corridor uses the configured entrances and player balls described in ADR 0004.
_Avoid_: simplified scene, decorative object

**Screen-space stroke**:
A line that keeps the same visible width for every direction and camera rotation at a given viewing scale.
_Avoid_: Three.js line, variable-width edge

**Navigation ripple**:
The temporary expanding ring displayed on exposed block surfaces after a reachable click in the Game view.

