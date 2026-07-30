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
EXAMPLE - IMAGE
Replace with a real entry once you have actual image files.
===========================================================
*/

"example photograph": {

    category: "Images",

    type: "image",

    file: "media/images/example.jpg",

    description: "Placeholder entry - replace the file path once you add real images."

}



};
