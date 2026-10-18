/*
===========================================================
DIVISION-9 EVIDENCE DIRECTORY - ENTRIES

HOW TO ADD A RECORD
  1. Drop the file into the media/ folder (any name, no spaces
     is safest).
  2. Copy the block below, paste it ANYWHERE under the last
     add({ ... }); in this file, and fill it in.

add({
    title: "What Actually Displays",       // required, this is what people type
    category: "Category Name",             // required. New names create new categories
    subcategory: "Optional Subcategory",   // optional. New names create new subcategories
    file: "my_file.mp4",                   // file inside media/ (see formats below)
    description: "Optional text.",         // optional, also searched
    tags: ["optional", "words"],           // optional, also searched
    related: ["Another Record Title"],     // optional, titles of related records
});

THAT'S IT. You never need to set a type, an ID, or a path:
  - TYPE is worked out from the file extension.
  - The category/subcategory are matched ignoring upper/lower case
    and extra spaces, so "Surveillance" and "surveillance " land
    in the same place. The first spelling used becomes the display name.
  - Records are grouped by category, then subcategory, automatically.
    Within a group they sort by "order" (if set), then title.
  - Blocks can go in any order. There are no commas BETWEEN blocks.

SUPPORTED FORMATS (type is picked from the extension)
  image     jpg jpeg png webp bmp svg avif
  gif       gif
  video     mp4 webm ogv m4v mov
  audio     mp3 wav ogg oga m4a aac flac
  document  txt md pdf html htm log csv
  Browsers differ: mp4 (H.264) and webm play everywhere, mp3 and
  wav play everywhere. mov/flac/m4a depend on the browser. If a
  record shows "FILE NOT FOUND OR CORRUPTED" for a file that exists,
  convert it to mp4 / mp3.

OPTIONAL FIELDS
    hidden: true,        not listed or searched. Opens only by typing its exact title.
    locked: true,        listed, but refuses to open (restricted).
    order: 1,            lower numbers first inside its group.
    externalUrl: "https://...",   no file: opens a link in a new tab.
    forceDownload: true, downloads automatically when opened.
    type: "video",       only if the extension is missing or misleading.

CATEGORY ORDER (optional): list categories here to pin their order.
Anything not listed follows in the order first used in this file.
===========================================================
*/

const D9_CONFIG = {
    archiveName: "DIVISION 9 // EVIDENCE DIRECTORY",
    version: "1.0",
    prompt: "D9>",
    categoryOrder: ["Surveillance", "Administration", "Personnel"]
};

const D9_EVIDENCE = [];
function add(entry){ D9_EVIDENCE.push(entry); }

add({
    title: "Idle Environment Capture 01",
    category: "Surveillance",
    subcategory: "Idle Enviroment",
    file: "idle_environment_capture_01.png",
    order: 1,
});

add({
    title: "Idle Environment Capture 02",
    category: "Surveillance",
    subcategory: "Idle Enviroment",
    file: "idle_environment_capture_02.png",
    order: 2,
});

add({
    title: "Idle Environment Capture 03",
    category: "Surveillance",
    subcategory: "Idle Enviroment",
    file: "idle_environment_capture_03.png",
    order: 3,
});

add({
    title: "Idle Environment Capture 04",
    category: "Surveillance",
    subcategory: "Idle Enviroment",
    file: "idle_environment_capture_04.png",
    order: 4,
});

add({
    title: "Idle Environment Capture 05",
    category: "Surveillance",
    subcategory: "Idle Enviroment",
    file: "idle_environment_capture_05.png",
    order: 5,
});

add({
    title: "Idle Environment Capture 06",
    category: "Surveillance",
    subcategory: "Idle Enviroment",
    file: "idle_environment_capture_06.png",
    order: 6,
});

add({
    title: "BSLSK-Div9-Founders_Patch",
    category: "Administration",
    subcategory: "Insignia",
    file: "BSLSK-Div9-Founders_Patch.png",
    order: 1,
});

add({
    title: "BSLSK-Div9-Maw_Patch",
    category: "Administration",
    subcategory: "Insignia",
    file: "BSLSK-Div9-Maw_Patch.png",
    order: 2,
});

add({
    title: "BSLSK-Div9-Operative(as last seen by contract HVT)-INS_ONE",
    category: "Personnel",
    subcategory: "Operative",
    file: "BSLSK-Div9-Operative(as last seen by contract HVT)-INS_ONE.png",
    order: 1,
});

add({
    title: "BSLSK-Div9-Operative-Armor-Map",
    category: "Personnel",
    subcategory: "Operative",
    file: "BSLSK-Div9-Operative-Armor-Map.png",
    order: 2,
});

add({
    title: "Idle Environment Capture - Combat Detected 01",
    category: "Surveillance",
    subcategory: "Idle Enviroment",
    file: "idle_environment_capture_combat-detected_01.png",
    order: 7,
});

add({
    title: "Idle Environment Capture - Combat Detected 02",
    category: "Surveillance",
    subcategory: "Idle Enviroment",
    file: "idle_environment_capture_combat-detected_02.png",
    order: 8,
});

add({
    title: "Idle Drone Camera Feed - Mode Inactive",
    category: "Surveillance",
    subcategory: "Drone Camera Feed",
    file: "idle_drone-camera-feed_MODE_inactive.png",
    order: 1,
});

add({
    title: "Mid-Contract Chest Camera - Active Combat Detected 01",
    category: "Surveillance",
    subcategory: "Operative Chest Camera",
    file: "mid_contract_chest_camera_div9_operative_footage_active-combat-detected_01.png",
    order: 1,
});

add({
    title: "Mid-Contract Chest Camera - Active Combat Detected 02",
    category: "Surveillance",
    subcategory: "Operative Chest Camera",
    file: "mid_contract_chest_camera_div9_operative_footage_active-combat-detected_02.png",
    order: 2,
});

add({
    title: "Mid-Contract Chest Camera - Active Combat Detected 03",
    category: "Surveillance",
    subcategory: "Operative Chest Camera",
    file: "mid_contract_chest_camera_div9_operative_footage_active-combat-detected_03.png",
    order: 3,
});

add({
    title: "Mid-Contract Chest Camera - Active Combat Detected 04",
    category: "Surveillance",
    subcategory: "Operative Chest Camera",
    file: "mid_contract_chest_camera_div9_operative_footage_active-combat-detected_04.png",
    order: 4,
});

add({
    title: "Mid-Contract Chest Camera - Active Combat Detected 05",
    category: "Surveillance",
    subcategory: "Operative Chest Camera",
    file: "mid_contract_chest_camera_div9_operative_footage_active-combat-detected_05.png",
    order: 5,
});

add({
    title: "Support Item Drone - Idle Environment Capture",
    category: "Surveillance",
    subcategory: "Drone Camera Feed",
    file: "support_item_drone_idle_environment_capture.png",
    order: 2,
});

add({
    title: "Zephyr Construct Internal Camera Relay - Contract In Progress 01",
    category: "Surveillance",
    subcategory: "Zephyr Construct Camera Relay",
    file: "zephyr-construct-internal-camera-relay-(contract-in-progress)-01.png",
    order: 1,
});

add({
    title: "Zephyr Construct Internal Camera Relay - Contract In Progress 02",
    category: "Surveillance",
    subcategory: "Zephyr Construct Camera Relay",
    file: "zephyr-construct-internal-camera-relay-(contract-in-progress)-02.png",
    order: 2,
});

add({
    title: "Zephyr Construct Internal Camera Relay - Contract In Progress 03",
    category: "Surveillance",
    subcategory: "Zephyr Construct Camera Relay",
    file: "zephyr-construct-internal-camera-relay-(contract-in-progress)-03.png",
    order: 3,
});

add({
    title: "Zephyr Construct Internal Camera Relay - Contract In Progress 04",
    category: "Surveillance",
    subcategory: "Zephyr Construct Camera Relay",
    file: "zephyr-construct-internal-camera-relay-(contract-in-progress)-04.png",
    order: 4,
});
