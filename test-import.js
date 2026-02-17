const fs = require('fs');

async function test() {
    try {
        console.log("Attempting dynamic import of pdf-parse...");
        const pdf = await import("pdf-parse");
        console.log("Imported pdf-parse successfully:", pdf.default ? "Has Default" : "No Default");
    } catch (e) {
        console.error("Import failed with error:", e);
    }
}

test();
