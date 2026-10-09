# Keep visitor physics local

The presence service relays current temporary visitor states and does not calculate collisions. Each browser computes visitor overlap locally and prevents visible ball overlap without pushing, accepting occasional position differences between browsers to keep the presence service small and independent from the game physics.

