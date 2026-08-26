/**
 * How much can actually get from the sources to the machines, computed rather than
 * approached.
 *
 * The first solver pushed supply forward round after round until the numbers stopped
 * moving. That is fine on a line and wrong on anything else, and it was wrong here in the
 * worst way: a schematic worth 2,402 power a second came out at 648, because every round
 * re-applied each carrier's rate cap and a network that loops multiplies by a fraction
 * below one on every pass. The number did not merely drift, it decayed.
 *
 * This is the ordinary answer to the ordinary question. A factory is a flow network: the
 * intakes are a source, the machines are a sink, and the carriers are edges with a
 * capacity. What gets through is a maximum flow, and a maximum flow is exact, terminates,
 * and does not care whether the graph has cycles.
 *
 * Dinic's algorithm, because it is short and because the alternative on a graph this size
 * is not measurably worse but is longer to read. A schematic is a few hundred nodes; this
 * finishes in under a millisecond.
 */

/** An edge and the room left on it. */
class Network {
  constructor(size) {
    this.size = size;
    this.edges = [];
    this.out = Array.from({ length: size }, () => []);
  }

  /**
   * A one-way edge, stored with its own reverse.
   *
   * The reverse starts empty and is what lets the algorithm take back a bad decision: flow
   * pushed down a branch that turns out to be a dead end is returned along it. Without the
   * pair, a greedy first choice is permanent and the answer is whatever the first path
   * happened to be.
   */
  link(from, to, capacity) {
    this.out[from].push(this.edges.length);
    this.edges.push({ to, capacity, flow: 0 });
    this.out[to].push(this.edges.length);
    this.edges.push({ to: from, capacity: 0, flow: 0 });
  }

  /** How far each node is from the source, along edges with room left. */
  levels(source, sink) {
    const level = new Int32Array(this.size).fill(-1);
    level[source] = 0;
    const queue = [source];
    for (let head = 0; head < queue.length; head++) {
      const at = queue[head];
      for (const id of this.out[at]) {
        const edge = this.edges[id];
        if (level[edge.to] === -1 && edge.capacity - edge.flow > 1e-9) {
          level[edge.to] = level[at] + 1;
          queue.push(edge.to);
        }
      }
    }
    return level[sink] === -1 ? null : level;
  }

  /** Push as much as will fit along one shortest path, deepest first. */
  push(at, sink, amount, level, cursor) {
    if (at === sink) return amount;
    for (; cursor[at] < this.out[at].length; cursor[at]++) {
      const id = this.out[at][cursor[at]];
      const edge = this.edges[id];
      const room = edge.capacity - edge.flow;
      if (level[edge.to] !== level[at] + 1 || room <= 1e-9) continue;

      const sent = this.push(edge.to, sink, Math.min(amount, room), level, cursor);
      if (sent > 1e-9) {
        edge.flow += sent;
        this.edges[id ^ 1].flow -= sent;
        return sent;
      }
    }
    return 0;
  }

  solve(source, sink) {
    let total = 0;
    for (;;) {
      const level = this.levels(source, sink);
      if (!level) break;
      const cursor = new Int32Array(this.size);
      for (;;) {
        const sent = this.push(source, sink, Infinity, level, cursor);
        if (sent <= 1e-9) break;
        total += sent;
      }
    }
    return total;
  }

  /** What ended up flowing along each original edge, by the order they were added. */
  flows() {
    const out = [];
    for (let id = 0; id < this.edges.length; id += 2) {
      out.push(Math.max(0, this.edges[id].flow));
    }
    return out;
  }
}

/**
 * How much of one resource reaches the machines that want it.
 *
 * Run once per resource, because the networks do not share: water and coal travel on
 * different carriers, and a pipe full of water is not a belt with room for coal.
 *
 * `capacity(index)` is what a node can pass per second, and `wants(index)` what a machine
 * will take. A node with no stated capacity is unconstrained, which is the honest reading:
 * an invented limit is worse than an absent one.
 */
export function throughput(graph, { supply, capacity, wants }) {
  const nodes = graph.nodes.length;
  const SOURCE = nodes * 2;
  const SINK = SOURCE + 1;
  const network = new Network(SINK + 1);

  // Each block is split in two, with its own capacity on the edge between the halves.
  // A capacity belongs to the block, not to the ways in or out of it, and putting it on
  // the edges would let a belt with three feeders carry three belts' worth.
  const inOf = (index) => index * 2;
  const outOf = (index) => index * 2 + 1;

  for (let index = 0; index < nodes; index++) {
    network.link(inOf(index), outOf(index), capacity(index));
  }

  const spans = [];
  for (const [from, to] of graph.edges) {
    spans.push(network.edges.length);
    network.link(outOf(from), inOf(to), Infinity);
  }

  for (const [index, rate] of Object.entries(supply)) {
    if (rate > 0) network.link(SOURCE, inOf(Number(index)), rate);
  }
  for (let index = 0; index < nodes; index++) {
    const appetite = wants(index);
    if (appetite > 0) network.link(outOf(index), SINK, appetite);
  }

  const total = network.solve(SOURCE, SINK);

  // What each machine actually received, which is the number the report is about.
  const received = new Float64Array(nodes);
  let cursor = 0;
  for (let id = 0; id < network.edges.length; id += 2) {
    cursor++;
  }
  const arriving = new Float64Array(nodes);
  for (let index = 0; index < nodes; index++) {
    for (const id of network.out[outOf(index)]) {
      const edge = network.edges[id];
      if (edge.to === SINK) arriving[index] = Math.max(0, edge.flow);
    }
    received[index] = arriving[index];
  }

  return { total, received, spans, network };
}
