/*
===========================================================
DIVISION-9 EVIDENCE DIRECTORY
evidence.js

Sister site to the main BSLSK terminal. Same underlying
mechanics (typewriter print queue, command history, tab
completion) reused on purpose - same quasi-program, no
login/clearance system here though. Just help, database,
and access/play/pause/stop.
===========================================================
*/


const feed   = document.getElementById("terminal-output");
const input  = document.getElementById("command-input");
const status = document.getElementById("connection-status");

const sidebarTree = document.getElementById("sidebar-tree");

const viewportEmpty     = document.getElementById("viewport-empty");
const viewportVideo     = document.getElementById("viewport-video");
const viewportImage     = document.getElementById("viewport-image");
const viewportAudioCard = document.getElementById("viewport-audio-card");
const audioCardName     = document.getElementById("audio-card-name");
const audioCardStatus   = document.getElementById("audio-card-status");

const nowPlaying  = document.getElementById("now-playing");
const audioPlayer = document.getElementById("audio-player");


// Reveal the app immediately - style.css is guaranteed loaded
// by the time this script runs, since <script> tags after
// <link rel="stylesheet"> in the HTML always wait for it.
document.getElementById("app").style.visibility = "visible";



/*
===========================================================
BOOT SEQUENCE
===========================================================
*/

input.disabled = true;

buildSidebar();

bootSequence();


async function bootSequence(){

    await printLine("DIVISION-9 EVIDENCE DIRECTORY", "boot");
    await printLine("--------------------------------------", "system");

    await loading("Mounting evidence archive");

    await loading("Indexing media files");

    await printLine("");

    await printLine("CONNECTION ESTABLISHED", "success");

    await printLine("");

    await printLine("Type 'help' for a list of commands.");

    status.innerText = "ONLINE";
    status.className = "success";

    input.disabled = false;
    input.focus();

}



/*
===========================================================
TYPEWRITER PRINT QUEUE

Identical mechanism to the main site: lines are queued and
typed out one character at a time, in order, regardless of
whether the caller awaits printLine() or not. Any keypress
while printing sets fastForward and instantly completes
everything currently queued.
===========================================================
*/

const TYPE_SPEED = 12; // milliseconds per character

let printQueue = [];
let isPrinting = false;
let fastForward = false;


function printLine(text, type=""){

    return new Promise(resolve=>{

        printQueue.push({ text, type, resolve });

        if(!isPrinting){

            processQueue();

        }

    });

}


async function processQueue(){

    isPrinting = true;

    while(printQueue.length > 0){

        let item = printQueue.shift();

        let line = document.createElement("div");

        line.className = item.type;

        feed.appendChild(line);


        for(let i=0; i<=item.text.length; i++){

            if(fastForward){

                line.textContent = item.text;

                break;

            }

            line.textContent = item.text.slice(0,i);

            feed.scrollTop = feed.scrollHeight;

            await sleep(TYPE_SPEED);

        }

        feed.scrollTop = feed.scrollHeight;


        item.resolve();

    }

    isPrinting = false;

    fastForward = false;

}



async function loading(text){

    let line=document.createElement("div");

    line.className="system";

    feed.appendChild(line);


    let bar="";

    for(let i=0;i<=10;i++){

        bar =
        "["+
        "█".repeat(i)+
        "░".repeat(10-i)
        +"]";


        line.innerText =
        text+" "+bar;


        await sleep(100);

    }


}



function sleep(ms){

    return new Promise(resolve=>setTimeout(resolve,ms));

}



/*
===========================================================
INPUT HANDLING
===========================================================
*/


let commandHistory = [];
let historyIndex = -1;

let tabMatches = [];
let tabIndex = -1;
let tabBase = null;


input.addEventListener(
"keydown",
async function(event){


    // Any keypress while text is still typing out instantly
    // completes everything currently queued.
    if(isPrinting){

        fastForward = true;

        if(event.key === "Enter"){

            event.preventDefault();

            return;

        }

    }


    if(event.key === "ArrowUp"){

        event.preventDefault();

        if(commandHistory.length === 0) return;

        historyIndex = Math.max(historyIndex - 1, 0);

        this.value = commandHistory[historyIndex];

        this.setSelectionRange(this.value.length, this.value.length);

        return;

    }


    if(event.key === "ArrowDown"){

        event.preventDefault();

        if(commandHistory.length === 0) return;

        historyIndex = Math.min(historyIndex + 1, commandHistory.length);

        this.value = commandHistory[historyIndex] || "";

        this.setSelectionRange(this.value.length, this.value.length);

        return;

    }


    if(event.key === "Tab"){

        event.preventDefault();

        autoComplete(this);

        return;

    }


    if(event.key !== "Enter"){

        tabBase = null;

        return;

    }


    let commandLine=this.value.trim();


    if(commandLine==="")
        return;


    await printLine(
        `> ${commandLine}`,
        "system"
    );


    commandHistory.push(commandLine);

    historyIndex = commandHistory.length;

    tabBase = null;


    this.value="";


    execute(commandLine);


});




/*
===========================================================
TAB COMPLETION

Only completes the argument after "access " - matches
against every entry key, category, and subcategory name.
Pressing Tab repeatedly cycles through multiple matches.
===========================================================
*/

function autoComplete(el){

    let value = el.value;

    let parts = value.split(" ");


    if(parts[0].toLowerCase() !== "access") return;


    let query = parts.slice(1).join(" ").toLowerCase();


    let names = new Set();

    Object.keys(media).forEach(key=>names.add(key));

    Object.values(media).forEach(entry=>{

        names.add(entry.category.toLowerCase());

        if(entry.subcategory){

            names.add(entry.subcategory.toLowerCase());

        }

    });


    let candidates = [...names]

        .filter(name => name.startsWith(query))

        .sort();


    if(candidates.length === 0) return;


    if(tabBase !== query){

        tabBase = query;

        tabMatches = candidates;

        tabIndex = 0;

    }

    else{

        tabIndex = (tabIndex + 1) % tabMatches.length;

    }


    el.value = "access " + tabMatches[tabIndex];

}



/*
===========================================================
COMMAND SYSTEM
===========================================================
*/


async function execute(text){


    let args=text.split(" ");

    let command=args[0].toLowerCase();


    switch(command){


        case "clear":

            feed.innerHTML="";

        break;



        case "help":

            printLine(
            "Available commands:",
            "success"
            );

            printLine(
            "database"
            );

            printLine(
            "access <file / category>"
            );

            printLine(
            "play"
            );

            printLine(
            "pause"
            );

            printLine(
            "stop"
            );

            printLine(
            "clear"
            );

        break;



        case "database":

            databaseCommand();

        break;



        case "access":

            accessCommand(
                args.slice(1).join(" ")
            );

        break;



        case "play":

            playCommand();

        break;



        case "pause":

            pauseCommand();

        break;



        case "stop":

            stopCommand(false);

        break;



        default:

            printLine(
            "UNKNOWN COMMAND",
            "error"
            );

        break;


    }


}



/*
===========================================================
SIDEBAR (display-only directory tree)
===========================================================
*/

function buildSidebar(){

    let categories = {};

    Object.keys(media).forEach(key=>{

        let entry = media[key];

        if(!categories[entry.category]){

            categories[entry.category] = { direct: [], subcategories: {} };

        }

        if(entry.subcategory){

            if(!categories[entry.category].subcategories[entry.subcategory]){

                categories[entry.category].subcategories[entry.subcategory] = [];

            }

            categories[entry.category].subcategories[entry.subcategory].push(key);

        }
        else{

            categories[entry.category].direct.push(key);

        }

    });


    sidebarTree.innerHTML = "";

    Object.keys(categories).forEach(cat=>{

        let catEl = document.createElement("div");

        catEl.className = "sidebar-category";

        catEl.textContent = cat.toUpperCase();

        sidebarTree.appendChild(catEl);


        categories[cat].direct.forEach(key=>{

            let entryEl = document.createElement("div");

            entryEl.className = "sidebar-entry";

            entryEl.textContent = key.toUpperCase();

            sidebarTree.appendChild(entryEl);

        });


        Object.keys(categories[cat].subcategories).forEach(sub=>{

            let subEl = document.createElement("div");

            subEl.className = "sidebar-subcategory";

            subEl.textContent = sub.toUpperCase();

            sidebarTree.appendChild(subEl);


            categories[cat].subcategories[sub].forEach(key=>{

                let entryEl = document.createElement("div");

                entryEl.className = "sidebar-entry";

                entryEl.textContent = key.toUpperCase();

                sidebarTree.appendChild(entryEl);

            });

        });

    });

}



/*
===========================================================
DATABASE
===========================================================
*/

function databaseCommand(){

    printLine(
    "EVIDENCE INDEX - CATEGORIES:",
    "success"
    );


    let categories = {};


    Object.values(media).forEach(entry=>{

        if(!categories[entry.category]){

            categories[entry.category] = { direct: 0, subcategories: {} };

        }

        let cat = categories[entry.category];


        if(entry.subcategory){

            if(!cat.subcategories[entry.subcategory]){

                cat.subcategories[entry.subcategory] = 0;

            }

            cat.subcategories[entry.subcategory]++;

        }
        else{

            cat.direct++;

        }

    });


    Object.keys(categories).forEach(cat=>{

        let entry = categories[cat];

        printLine(
        `[${cat.toUpperCase()}]`
        );

        if(entry.direct > 0){

            printLine(
            `${entry.direct} FILES`
            );

        }


        Object.keys(entry.subcategories).forEach(sub=>{

            printLine(
            `    [${sub.toUpperCase()}]`
            );

            printLine(
            `    ${entry.subcategories[sub]} FILES`
            );

        });

    });

}



/*
===========================================================
ACCESS

"access <entry key>" loads that specific file (case-
sensitive exact match, same as the main site's "read").
"access <category or subcategory>" lists everything in it
(case-insensitive).
===========================================================
*/

function accessCommand(name){

    if(!name){

        printLine(
        "USAGE: access <file / category>",
        "error"
        );

        return;

    }


    let direct = media[name];


    if(direct){

        loadItem(name);

        return;

    }


    let matches = Object.keys(media).filter(key=>

        media[key].category.toLowerCase()
        ===
        name.toLowerCase()

    );


    if(matches.length > 0){

        printLine(
        `CATEGORY: ${name.toUpperCase()}`,
        "success"
        );

        matches.forEach(key=>{

            printLine(
            `[${key.toUpperCase()}]`
            );

        });

        return;

    }


    let subMatches = Object.keys(media).filter(key=>

        media[key].subcategory
        &&
        media[key].subcategory.toLowerCase()
        ===
        name.toLowerCase()

    );


    if(subMatches.length > 0){

        printLine(
        `SUBCATEGORY: ${name.toUpperCase()}`,
        "success"
        );

        subMatches.forEach(key=>{

            printLine(
            `[${key.toUpperCase()}]`
            );

        });

        return;

    }


    printLine(
    "FILE NOT FOUND",
    "error"
    );

}



/*
===========================================================
PLAYBACK

One consistent model across all three media types:
"access" loads a file and shows it, "play"/"pause"/"stop"
control it. For images, "play" starts the top-to-bottom
reveal, "pause" freezes it mid-reveal, "stop" resets it -
the reveal is just treated as this file's "playback".
===========================================================
*/

let currentItem = null;
let playbackState = "STOPPED"; // STOPPED | PLAYING | PAUSED

let revealProgress = 0;
let revealFrame = null;
let lastRevealTime = null;

const IMAGE_REVEAL_MS = 4000;


function loadItem(key){

    stopCommand(true); // silently reset whatever was previously loaded


    let entry = media[key];

    currentItem = key;

    playbackState = "STOPPED";

    revealProgress = 0;


    viewportEmpty.classList.add("hidden");
    viewportVideo.classList.add("hidden");
    viewportImage.classList.add("hidden");
    viewportAudioCard.classList.add("hidden");


    if(entry.type === "audio"){

        audioPlayer.src = entry.file;

        audioPlayer.currentTime = 0;

        viewportAudioCard.classList.remove("hidden");

        audioCardName.textContent = key.toUpperCase();

        audioCardStatus.textContent = "STOPPED";

    }
    else if(entry.type === "video"){

        viewportVideo.src = entry.file;

        viewportVideo.currentTime = 0;

        viewportVideo.classList.remove("hidden");

    }
    else if(entry.type === "image"){

        viewportImage.src = entry.file;

        viewportImage.style.clipPath = "inset(0 0 100% 0)";

        viewportImage.classList.remove("hidden");

    }


    updateNowPlaying();


    printLine(
    `FILE LOADED: ${key.toUpperCase()}`,
    "success"
    );

    if(entry.description){

        printLine(entry.description, "system");

    }

    printLine(

        entry.type === "image"
        ? "Type 'play' to begin the reveal."
        : "Type 'play' to begin playback."

    );

}


function playCommand(){

    if(!currentItem){

        printLine("NO FILE LOADED", "error");

        return;

    }


    let entry = media[currentItem];


    if(entry.type === "audio"){

        audioPlayer.play();

        audioCardStatus.textContent = "PLAYING";

        printLine(`PLAYING: ${currentItem.toUpperCase()}`, "success");

    }
    else if(entry.type === "video"){

        viewportVideo.play();

        printLine(`PLAYING: ${currentItem.toUpperCase()}`, "success");

    }
    else if(entry.type === "image"){

        if(revealProgress >= 1){

            printLine("IMAGE ALREADY FULLY REVEALED.", "warning");

            return;

        }

        lastRevealTime = null;

        revealFrame = requestAnimationFrame(stepReveal);

        printLine(`DECRYPTING: ${currentItem.toUpperCase()}`, "success");

    }


    playbackState = "PLAYING";

    updateNowPlaying();

}


function pauseCommand(){

    if(!currentItem){

        printLine("NO FILE LOADED", "error");

        return;

    }


    let entry = media[currentItem];


    if(entry.type === "audio"){

        audioPlayer.pause();

        audioCardStatus.textContent = "PAUSED";

    }
    else if(entry.type === "video"){

        viewportVideo.pause();

    }
    else if(entry.type === "image"){

        if(revealFrame){

            cancelAnimationFrame(revealFrame);

            revealFrame = null;

        }

    }


    playbackState = "PAUSED";

    printLine("PAUSED", "warning");

    updateNowPlaying();

}


function stopCommand(silent){

    if(!currentItem){

        if(!silent){

            printLine("NO FILE LOADED", "error");

        }

        return;

    }


    let entry = media[currentItem];


    if(entry.type === "audio"){

        audioPlayer.pause();

        audioPlayer.currentTime = 0;

        audioCardStatus.textContent = "STOPPED";

    }
    else if(entry.type === "video"){

        viewportVideo.pause();

        viewportVideo.currentTime = 0;

    }
    else if(entry.type === "image"){

        if(revealFrame){

            cancelAnimationFrame(revealFrame);

            revealFrame = null;

        }

        revealProgress = 0;

        viewportImage.style.clipPath = "inset(0 0 100% 0)";

    }


    playbackState = "STOPPED";

    if(!silent){

        printLine("STOPPED", "warning");

    }

    updateNowPlaying();

}


function stepReveal(now){

    if(lastRevealTime === null){

        lastRevealTime = now;

    }

    let dt = now - lastRevealTime;

    lastRevealTime = now;


    revealProgress = Math.min(revealProgress + dt / IMAGE_REVEAL_MS, 1);

    viewportImage.style.clipPath = `inset(0 0 ${(1-revealProgress)*100}% 0)`;


    if(revealProgress < 1 && playbackState === "PLAYING"){

        revealFrame = requestAnimationFrame(stepReveal);

    }
    else if(revealProgress >= 1){

        playbackState = "STOPPED";

        revealFrame = null;

        printLine("REVEAL COMPLETE", "success");

        updateNowPlaying();

    }

}


function updateNowPlaying(){

    if(!currentItem){

        nowPlaying.textContent = "NO FILE LOADED";

        return;

    }

    nowPlaying.textContent = `${currentItem.toUpperCase()}  —  [${playbackState}]`;

}


audioPlayer.addEventListener("ended", ()=>{

    if(currentItem && media[currentItem].type === "audio"){

        playbackState = "STOPPED";

        audioCardStatus.textContent = "STOPPED";

        printLine("PLAYBACK FINISHED", "success");

        updateNowPlaying();

    }

});


viewportVideo.addEventListener("ended", ()=>{

    if(currentItem && media[currentItem].type === "video"){

        playbackState = "STOPPED";

        printLine("PLAYBACK FINISHED", "success");

        updateNowPlaying();

    }

});
