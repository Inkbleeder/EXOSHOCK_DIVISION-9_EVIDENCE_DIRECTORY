/*
===========================================================
DIVISION-9 EVIDENCE ARCHIVE - ENTRIES

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
    archiveName: "DIVISION 9 // EVIDENCE ARCHIVE",
    version: "1.0",
    prompt: "D9>",
    categoryOrder: ["Communications", "Surveillance", "Administration", "Personnel", "External"]
};

const D9_EVIDENCE = [];
function add(entry){ D9_EVIDENCE.push(entry); }

add({
    title: "Facility Ambient Recording",
    category: "Communications",
    subcategory: "Facility Audio",
    file: "hum_60hz.mp3",
    description: "Baseline facility hum recorded in Sublevel 2. Provided for comparison against anomalous recordings.",
    tags: ["audio", "ambient", "baseline"],
    related: ["Unidentified Transmission 01"],
});

add({
    title: "Diagnostic Signal Recording",
    category: "Communications",
    subcategory: "Signal Analysis",
    file: "signal_test.mp4",
    description: "Standard carrier test pattern transmitted from Relay Station 7 during the outage window.",
    tags: ["signal", "test", "station"],
    related: ["Facility Ambient Recording", "Internal Memo 001 - Comms Outage"],
});

add({
    title: "Unidentified Transmission 01",
    category: "Communications",
    subcategory: "Signal Analysis",
    file: "transmission_01.mp3",
    description: "Low-frequency signal recorded on the maintenance band. Repeats at fixed intervals. No voice content isolated.",
    tags: ["audio", "transmission", "signal"],
    related: ["Diagnostic Signal Recording", "Internal Memo 001 - Comms Outage"],
});

add({
    title: "Corridor Camera Loop",
    category: "Surveillance",
    subcategory: "Corridor B",
    file: "cam_loop.gif",
    description: "Short animation assembled from corridor camera frames. Lighting fluctuation visible at 2s intervals.",
    tags: ["station", "camera", "loop"],
    related: ["Station 7 - Corridor Photo"],
});

add({
    title: "Station 7 - Corridor Photo",
    category: "Surveillance",
    subcategory: "Corridor B",
    file: "station_corridor.jpg",
    description: "Recovered still. Corridor B, Deck 3. Source of the image has not been identified.",
    tags: ["station", "corridor", "deck3"],
    related: ["Corridor Camera Loop", "Sublevel 2 - Access Shaft"],
});

add({
    title: "Sublevel 2 - Access Shaft",
    category: "Surveillance",
    subcategory: "Sublevel 2",
    file: "sublevel_02.jpg",
    description: "Access shaft photographed during the recovery sweep. Corroborates corridor camera loop (EV-003).",
    tags: ["sublevel", "shaft", "recovery"],
    related: ["Station 7 - Corridor Photo", "Corridor Camera Loop"],
});

add({
    title: "Damaged Plate - Unrecoverable",
    category: "Surveillance",
    subcategory: "Sublevel 2",
    file: "photo_damaged.jpg",
    description: "Index entry retained for completeness. The physical plate was destroyed before digitization. No image survives.",
    tags: ["damaged"],
});

add({
    title: "Division Directive 9 - Cover Sheet",
    category: "Administration",
    subcategory: "Directives",
    file: "directive_9.jpg",
    description: "Scanned cover sheet of the founding directive. Full text stored under separate clearance.",
    tags: ["directive", "document", "scan"],
    related: ["Evidence Manifest (Excerpt)"],
});

add({
    title: "Evidence Manifest (Excerpt)",
    category: "Administration",
    subcategory: "Manifests",
    file: "manifest_002.txt",
    description: "Partial inventory of materials transferred to this archive. Several entries redacted.",
    tags: ["manifest", "inventory"],
    related: ["Internal Memo 001 - Comms Outage"],
});

add({
    title: "Internal Memo 001 - Comms Outage",
    category: "Administration",
    subcategory: "Memoranda",
    file: "memo_001.txt",
    description: "Typed memorandum describing the comms outage preceding the incident.",
    tags: ["memo", "outage", "comms"],
    related: ["Diagnostic Signal Recording", "Unidentified Transmission 01"],
});

add({
    title: "Sealed Personnel Record",
    category: "Personnel",
    subcategory: "Sealed Records",
    file: "personnel_record.txt",
    description: "Sealed record. Not indexed. Access by exact title only.",
    tags: ["personnel", "sealed"],
    hidden: true,
});

add({
    title: "External Briefing (Reference Link)",
    category: "External",
    subcategory: "Referenced Material",
    description: "Material held outside this archive. Opens in a new tab.",
    tags: ["external", "briefing"],
    externalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
});

