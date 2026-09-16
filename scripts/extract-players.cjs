const fs = require("fs");
const src = fs.readFileSync(
  "C:/Users/User/Desktop/DynastyDraft/app/src/main/java/com/locksmithlabs/dynastydraft/data/SamplePlayers.kt",
  "utf8",
);
const re =
  /p\("([^"]+)", "([^"]+)", Position\.(\w+), "([^"]+)", (\d+), (\d+), (\d+), (\d+)\)/g;
const rows = [];
let m;
while ((m = re.exec(src))) {
  rows.push({
    id: m[1],
    name: m[2],
    position: m[3],
    team: m[4],
    careerStart: Number(m[5]),
    careerEnd: Number(m[6]),
    standardRank: Number(m[7]),
    pprRank: Number(m[8]),
  });
}
fs.mkdirSync("C:/Users/User/Desktop/DynastyDraftWeb/src/lib", { recursive: true });
fs.writeFileSync(
  "C:/Users/User/Desktop/DynastyDraftWeb/src/lib/players.json",
  JSON.stringify(rows, null, 2),
);
console.log(rows.length);
