# Crisply2404 Personal Site

This context is a personal site whose homepage is a playable corridor. The corridor connects the site to writing and projects while showing temporary visitors as the same kind of ball used by the game that inspired the site.

## Language

**Game view**:
The homepage mode that renders the corridor, doors, local ball, and temporary visitor balls.
_Avoid_: game page, 3D mode

**List view**:
The homepage mode that lists Notes, Essays and Work from top to bottom using the same visual language as the Game view. Work expands its projects in place along a vertical guide sharing the Entrance ball's center axis. The guide extends from the Work row's center to the last project's center; the ball obscures it. Every title uses the same typography, row height and starting position. Height and opacity transition together. Entrance rows invert their colors on hover or keyboard focus. The header adds a GitHub profile icon beside the mode button.
_Avoid_: normal page, fallback page

**Work project**:
A project entrance listed under Work, configured in `src/site-projects.ts` from the corridor Doors in the Work group. Work contains 击鼓传字 at `/chuan-zi/` and Hockey at `/hockey/`. Each project's source stays in its own repository, while the site publishes its build artifact.

**Entrance ball**:
The single MONO TOWER player ball on a writing page or beside the List view entrance titles. It starts beside the page title and follows a newly hovered or focused entrance with an ease-out movement. Keyboard movement always uses W toward the top of the page, independently of Game view controls. Touch visitors drag from the ball, which follows their finger continuously along its path while preserving the initial grab offset. Releasing or canceling stops it at its current position. Reading, selecting text and ordinary page taps preserve its position. It pushes individual letters and responds to jumping and rotation. View rotation preserves its current screen center. A Cursor block pushes it and preserves its displaced position until the selected entrance changes. The Cursor spike breaks its outline into randomly sized arcs with different trajectories each time; when the spike moves away the ball respawns beside the nearest title. Its colors invert with the row and it remains visible in front of the page header. Scrolling preserves its position; a new page visit, browser refresh, back and forward restore the initial page arrangement.

**Page letter**:
An individual visible letter, Chinese character or other grapheme in the page text. It can move in any direction and rotate freely when pushed by the Entrance ball or another Page letter. Scrolling and resizing preserve displaced letters. Browser refresh, back and forward restore the initial page arrangement.

**Page play state**:
The ball position, selected entrance and individual letter positions belonging to one page address. Scrolling, resizing and changing the homepage mode preserve it. Browser refresh, back and forward restore the page's initial arrangement.

**View toggle hint**:
The animated hint underneath the homepage mode button that explains how to enter the List view. Its upward tip points to that button. It remains available until that visitor first uses the button.

**Game cursor**:
The original standard block with one spike on top, replacing the mouse cursor in the List view. The spike tip marks the pointer position. Its view rotates around its own center with the keyboard. Collision boundaries contain the projected geometry and both visible stroke widths. A moving block transfers its normal velocity to the ball with restitution 0.65 and keeps following the pointer. The ball continues moving and slows through friction. Cursor and ball share one compositing group, which inverts over highlighted rows while preserving white intersections between them. It is hidden for touch input and removed when leaving the List view.

**Corridor**:
A straight, extendable passage whose configured doors are the site's entrances.
_Avoid_: map, hub

**Playground**:
The doorless platform connected beside the Corridor. It uses the same 40 world-unit tile and 20 world-unit player radius, and contains the Blivet and Penrose stairs objects.

**Penrose loop**:
The Playground's single closed square staircase surrounding a central opening. Its 16 treads rise by 6 world units and use a 40 world-unit width. A finite collision chart identifies the ends of the loop; the display maps each tread into a camera-dependent depth page. The seam closes along the viewing ray throughout camera rotation. Sphere contact and a continuous depth-page connection keep the ball visible and supported during repeated upward and downward travel.

**Blivet**:
The Playground's impossible object joining three cylindrical prongs to two rectangular prongs. The outline uses AnonMoos's public-domain Poiuyt drawing with MONO TOWER screen-space strokes and separate opaque surface patches. Its spatial chart contains radius-20 cylinder collision hulls, two rectangular arms and reversible branch connections. A camera-dependent projection atlas maps these surfaces to the classic outline. The ball can walk and jump through all three-to-two connections; a distinct presence space identifies its collision coordinates.

**Door**:
A configured entrance that names a site area and has a side, position, path, and visual treatment.
_Avoid_: link card, portal

**Door graphic**:
A title set in the List view's system sans-serif font with an independently adjustable weight (default 500), or a content symbol in the Door's plane. Notes and Essays use native complete-word layout and kerning at the same font size, with only the initial letter capitalized. Titles remain readable from either side. Notes uses a geometric page; Essays represents informal personal writing with a continuous handwritten stroke. Symbols share their own screen-space stroke width, are centered, and fit within a 38 × 38 world-unit area inside the frame. Symbol Doors have opaque interiors. A Door hiding a visitor ball's center hides the whole ball; an uncovered center keeps the whole ball visible. The drum Door uses its original favicon paths as its symbol alone. The Hockey Door uses a circular paddle and the game's cross-marked puck, preserving their 30:20 radius ratio, as its symbol alone.

**Control tutorial**:
The temporary animated game diagrams shown on a transparent foreground layer when entering the Game view. Desktop and mobile diagrams occupy the upper screen. Objects and input symbols remain opaque. Desktop diagrams demonstrate WASD movement in the selected control mode, adjacent mouse navigation, jumping, view rotation, three control modes and Enter to speak. Mobile diagrams use matching finger outlines with 1px borders to demonstrate a one-finger tap and two independent fingers for zoom and pan, alongside rotation, jumping and tapping one's ball to speak. Repeated loops finish with a fade and resource release.

**View gesture**:
Two fingers on the Game view canvas change orthographic zoom and camera position around their midpoint. Mobile zoom ranges from 1 to 3 and starts at 1.5. The complete local ball stays inside the screen during gestures, camera rotation and resize. Canvas gestures keep the mobile rotation and jump buttons at fixed screen positions and never generate navigation taps.

**Visitor ball**:
A temporary, uniformly styled ball representing one visitor currently in the Game view.
_Avoid_: user avatar, profile ball

**Speech bubble**:
A temporary message or message editor directly above its visitor ball. Only nearby visitors receive the message. New messages appear below earlier messages, which move upward smoothly. Each message expires independently. The editor opens and closes with an animated change in size and visibility; pressing outside it cancels the draft.

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

