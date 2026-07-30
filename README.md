DIVISION-9 EVIDENCE DIRECTORY - setup notes
=============================================

FOLDER STRUCTURE
----------------
Put your actual files in:

  media/sound/    -> audio files (.mp3, .wav, etc.)
  media/video/    -> video files (.mp4, etc.)
  media/images/   -> image files (.jpg, .png, etc.)

Then add an entry for each one in media.js - there's a
copy-paste template at the top of that file. Every entry
needs a category, a type ("audio"/"video"/"image"), a file
path, and can optionally have a subcategory and a
description line.

media.js currently ships with THREE PLACEHOLDER ENTRIES
(one per type) pointing at files that don't exist yet -
replace their `file:` paths with real ones, or delete them
once you've added your own.

CACHE-BUSTING
-------------
index.html loads media.js and evidence.js with a "?v=1" on
the end. Bump that number (?v=2, ?v=3...) every time you
edit either file and want to guarantee browsers grab the
fresh version instead of a cached one - same trick used on
the main terminal site.

HOW THE PLAYBACK MODEL WORKS
-----------------------------
`access <name>` loads a file into the viewport but does NOT
start it automatically. `play`, `pause`, and `stop` control
whatever's currently loaded - and this applies to images
too: `play` starts the top-to-bottom reveal, `pause` freezes
it mid-reveal, `stop` resets it back to fully hidden. One
consistent set of commands across all three media types.

THE SIDEBAR
-----------
The directory tree on the left is generated automatically
from media.js and is purely visual - there's no click
handling on it on purpose. All interaction happens through
the typed commands (access / play / pause / stop), matching
the main site's philosophy of "no mouse selection."

QUALITY OF LIFE
---------------
Same as the main site: Up/Down arrows recall command
history, Tab autocompletes the argument after "access "
(press Tab again to cycle multiple matches), and any
keypress while text is mid-typewriter-animation instantly
completes it.

NO LOGIN / NO ACCOUNTS
-----------------------
This site has none of the main site's login or clearance
system on purpose - it's meant to be immediately open. If
that ever needs to change, say so and it can be added the
same way the main site's accounts work.
