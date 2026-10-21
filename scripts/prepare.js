
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const source = path.join(root, "public", "index.html");
const output = path.join(root, "www", "index.html");

if (!fs.existsSync(source)) {
  console.error("Missing public/index.html");
  process.exit(1);
}

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.copyFileSync(source, output);

console.log("NEON SNAKE files prepared.");
