/*
===========================================================
DIVISION-9 EVIDENCE DIRECTORY

media.js

Contains every audio, video, and image file the directory
knows about.

Entry names must be lowercase.
Terminal searches these keys.

---------------------------------------------------------
HOW TO ADD A NEW ENTRY:

Copy this block, paste it inside the media object below,
and fill it in. A brand new category name automatically
becomes a real, searchable category - there is no separate
list to update. Subcategory works the same way and is
entirely optional.

"your entry key": {

    category: "Category Name",       // e.g. "Sound Files", "Videos", "Images"

    subcategory: "Optional Name",    // delete this line if not needed

    type: "audio",                   // "audio", "video", or "image"

    file: "media/sound/yourfile.mp3",

    description: "One line shown when this file is accessed."

},

FILE LOCATIONS - put your actual files here:

    media/sound/    -> audio files (.mp3, .wav, etc.)
    media/video/    -> video files (.mp4, etc.)
    media/images/   -> image files (.jpg, .png, etc.)

Typing 'database' in the terminal shows every category and
how many files are in it.
Typing 'access <category name>' lists every entry in that
category (regardless of subcategory).
Typing 'access <entry name>' loads that specific file into
the viewport, ready for 'play'.
---------------------------------------------------------
===========================================================
*/


const media = {


/*
===========================================================
EXAMPLE - SOUND FILE
Replace with a real entry once you have actual audio files.
===========================================================
*/

"example audio log": {

    category: "Sound Files",

    type: "audio",

    file: "media/sound/example.mp3",

    description: "Placeholder entry - replace the file path once you add real audio."

},



/*
===========================================================
EXAMPLE - VIDEO
Replace with a real entry once you have actual video files.
===========================================================
*/

"example surveillance clip": {

    category: "Videos",

    type: "video",

    file: "media/video/example.mp4",

    description: "Placeholder entry - replace the file path once you add real video."

},



/*
===========================================================
SITE PHOTOGRAPHS
Interior captures pulled from the facility.
===========================================================
*/

"environment photo 1": {

    category: "Site Photographs",

    type: "image",

    file: "media/images/Environment_1.png",

    description: "Interior capture - red-lit chamber, raised platform with twin console housings."

},

"environment photo 2": {

    category: "Site Photographs",

    type: "image",

    file: "media/images/Environment_2.png",

    description: "Interior capture - lounge/seating area, green support column, hex-paneled corridor beyond."

},

"environment photo 3": {

    category: "Site Photographs",

    type: "image",

    file: "media/images/Environment_3.png",

    description: "Interior capture - corridor junction, exposed conduit arcing along the ceiling."

},

"environment photo 4": {

    category: "Site Photographs",

    type: "image",

    file: "media/images/Environment_4.png",

    description: "Interior capture - gated threshold, green floodlighting, marked approach path."

},

"environment photo 5": {

    category: "Site Photographs",

    type: "image",

    file: "media/images/Environment_5.png",

    description: "Interior capture - control room, dual console arrays flanking a central housing."

},

"environment photo 6": {

    category: "Site Photographs",

    type: "image",

    file: "media/images/Environment_6.png",

    description: "Interior capture - stairwell, armed figure visible at range."

},

"environment photo 7": {

    category: "Site Photographs",

    type: "image",

    file: "media/images/Environment_7.png",

    description: "Interior capture - maintenance corridor, green-lit piping and support struts."

},

"unmarked interior capture": {

    category: "Site Photographs",

    subcategory: "Unlogged",

    type: "image",

    file: "media/images/HighresScreenshot00034.png",

    description: "Raw capture, source unlogged - illuminated coolant(?) cells along a maintenance walkway."

},



/*
===========================================================
INSIGNIA
===========================================================
*/

"founders patch": {

    category: "Insignia",

    type: "image",

    file: "media/images/patch_founders3.png",

    description: "Recovered emblem - winged serpent motif over a stylised blade and chevrons."

}



};
