/**
 * Work out where a schematic is meant to be plugged in, and what into each socket.
 *
 * A belt that starts from nowhere is where something arrives. A belt that ends in the air
 * is where something leaves. That is obvious to anyone looking at the picture, and it was
 * being asked of the player instead: "tell me what comes in", when the schematic says so
 * itself.
 *
 * So nothing is asked. The dangling ends are found, each one is followed to see which
 * machines it can reach, and from those machines comes what that particular end has to be
 * fed. A layout then analyses itself at full tilt with no input at all, and the answer
 * names the tile to connect: not "it needs water" but "the pipe at 0,7 wants water".
 */

const TICKS = 60;

/** Following a carrier forward, what machines can it reach. */
function downstream(graph, from) {
  const seen = new Set([from]);
  const stack = [from];
  const reached = [];
  while (stack.length) {
    const index = stack.pop();
    const node = graph.nodes[index];
    if (node.role === "crafter" || node.role === "generator" || node.role === "sink") {
      reached.push(index);
      // A machine is a destination, not a corridor: what it makes travels on from its own
      // outputs, and that is a different question from what this port has to carry.
      continue;
    }
    for (const next of graph.out[index]) {
      if (!seen.has(next)) { seen.add(next); stack.push(next); }
    }
  }
  return reached;
}

/** Walking backwards from a dangling end, what machines feed it. */
function upstream(graph, from) {
  const seen = new Set([from]);
  const stack = [from];
  const reached = [];
  while (stack.length) {
    const index = stack.pop();
    const node = graph.nodes[index];
    if (node.role === "crafter" || node.role === "generator" || node.role === "drill") {
      reached.push(index);
      continue;
    }
    for (const previous of graph.into[index]) {
      if (!seen.has(previous)) { seen.add(previous); stack.push(previous); }
    }
  }
  return reached;
}

/** The box the build occupies, so "on the edge" means something. */
function boundary(graph) {
  let left = Infinity, right = -Infinity, bottom = Infinity, top = -Infinity;
  for (const node of graph.nodes) {
    left = Math.min(left, node.x);
    right = Math.max(right, node.x);
    bottom = Math.min(bottom, node.y);
    top = Math.max(top, node.y);
  }
  return { left, right, bottom, top };
}

const isCarrier = (role) =>
  role === "conveyor" || role === "conduit" || role === "junction" ||
  role === "router" || role === "bridge" || role === "sorter";

/**
 * The sockets: where a line begins with nothing behind it, and where it ends with nothing
 * ahead.
 *
 * `wants` and `gives` are what that end actually carries, worked out from the machines it
 * reaches rather than from the whole layout. Two pipes on one schematic can want different
 * things, and telling a player "it needs water and coal" when one pipe wants each is how a
 * factory gets built back to front.
 */
export function ports(graph, isLiquid, external = null) {
  const inputs = [];
  const outputs = [];
  const box = boundary(graph);

  for (let index = 0; index < graph.nodes.length; index++) {
    const node = graph.nodes[index];
    if (!isCarrier(node.role)) continue;
    const carries = node.block.carries || "item";

    // A dangling start is a socket, and so is a carrier on the edge of the build that
    // leads to a machine the layout cannot feed itself.
    //
    // The first version only looked for dangling starts, which found none at all on the
    // first schematic tried: its pipes run in a loop and the pumps live outside the copy.
    // A player plugs that in at the edge, so that is where the sockets are.
    const dangling = !graph.into[index].length && graph.out[index].length;
    const onEdge = node.x === box.left || node.x === box.right
      || node.y === box.bottom || node.y === box.top;

    if (dangling || (onEdge && graph.out[index].length)) {
      const wants = {};
      for (const target of downstream(graph, index)) {
        const block = graph.nodes[target].block;
        const crafts = block.craft_time ? TICKS / block.craft_time : 0;
        for (const [item, count] of Object.entries(block.input || {})) {
          if ((carries === "liquid") === isLiquid(item)) {
            wants[item] = (wants[item] || 0) + count * crafts;
          }
        }
        for (const [liquid, rate] of Object.entries(block.input_liquid || {})) {
          if (carries === "liquid") wants[liquid] = (wants[liquid] || 0) + rate;
        }
        // A generator that burns whatever it is given names no ingredient, so the port
        // that feeds it is a port for fuel rather than for one particular item.
        if (graph.nodes[target].role === "generator"
            && !Object.keys(block.input || {}).length && crafts && carries === "item") {
          wants["*combustible"] = (wants["*combustible"] || 0) + crafts;
        }
      }
      // Only what the layout cannot make for itself. Every pipe inside a working chain
      // reaches a machine that wants something; saying so for all of them would list forty
      // sockets on a schematic with two.
      const missing = {};
      for (const [resource, rate] of Object.entries(wants)) {
        if (!external || external[resource] || resource.startsWith("*")) {
          missing[resource] = rate;
        }
      }
      if (dangling || Object.keys(missing).length) {
        inputs.push({ index, x: node.x, y: node.y, block: node.name,
                      carries, wants: missing });
      }
    }

    if (!graph.out[index].length) {
      const gives = {};
      for (const source of upstream(graph, index)) {
        const block = graph.nodes[source].block;
        const crafts = block.craft_time ? TICKS / block.craft_time : 0;
        for (const [item, count] of Object.entries(block.output || {})) {
          if (carries === "item") gives[item] = (gives[item] || 0) + count * crafts;
        }
        for (const [liquid, rate] of Object.entries(block.output_liquid || {})) {
          if (carries === "liquid") gives[liquid] = (gives[liquid] || 0) + rate;
        }
      }
      outputs.push({ index, x: node.x, y: node.y, block: node.name, carries, gives });
    }
  }

  return { inputs, outputs };
}

/**
 * Feed every socket exactly what the machines behind it are waiting for.
 *
 * This is what lets a schematic be analysed without a player typing anything: the layout
 * states where it plugs in, so the obvious thing to do is plug it in and see what happens.
 * The rate is what those machines want at full speed, so the answer is what the layout does
 * when nothing is starving it.
 */
export function feedPorts(graph, isLiquid, external = null) {
  const { inputs } = ports(graph, isLiquid, external);
  const carrying = inputs.filter((port) =>
    Object.keys(port.wants).some((r) => !r.startsWith("*")));
  const feeds = {};

  for (const port of carrying) {
    const rates = {};
    for (const [resource, rate] of Object.entries(port.wants)) {
      if (resource.startsWith("*")) continue;
      // Shared between the sockets that want the same thing. Handing each one the full
      // rate would feed a schematic with fifteen edge pipes fifteen times over, which is
      // how one reported fifteen thousand water a minute coming back out.
      const sharing = carrying.filter((other) => other.wants[resource]).length || 1;
      rates[resource] = rate / sharing;
    }
    if (Object.keys(rates).length) feeds[port.index] = rates;
  }
  return feeds;
}
