import { buildGraph, useCatalogue } from "./site/public/forge/analyse.js";
import { simulate } from "./site/public/forge/engine/run.js";
import { readFileSync } from "node:fs";
const cat = useCatalogue(JSON.parse(readFileSync("./site/public/forge/blocks.json","utf8")));
const copper = cat.items.copper.id;
const tiles = [
  {x:0,y:0,block:"item-source",rotation:0,config:{type:5,content:0,id:copper}},
  {x:1,y:0,block:"conveyor",rotation:0,config:null},
  {x:2,y:0,block:"conveyor",rotation:0,config:null},
  {x:4,y:0,block:"mass-driver",rotation:0,config:{type:7,dx:8,dy:0}},
  {x:12,y:0,block:"mass-driver",rotation:0,config:{type:7,dx:-8,dy:0}},
  {x:14,y:0,block:"conveyor",rotation:0,config:null},
  {x:15,y:0,block:"vault",rotation:0,config:null},
];
const graph = buildGraph(tiles);
graph.nodes.forEach((n,i)=>console.log(i,n.name,"role=",n.role,"link=",JSON.stringify(n.link)));
const out = simulate(graph, { seconds: 20, warmup: 5 });
console.log("left:", out.left, "consumed:", out.consumed);
console.log("delivered/arriving keys:", Object.keys(out));
console.log("delivered:", out.delivered);
console.log("offered:", out.offered);
console.log("refused:", out.refused);
for (const b of out.world.builds) {
  console.log(b.node.name, b.node.x, "items=", JSON.stringify([...b.items.counts]), "state.queue?", b.state?.slots?.length ?? "");
}
console.log("---detail---");
for (const b of out.world.builds) console.log(b.node.name, b.node.x, JSON.stringify(b.state).slice(0,200), "configured=", b.node.configured);
