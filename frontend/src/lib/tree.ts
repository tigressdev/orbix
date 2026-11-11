// Pure scenario/tree transformations. A "scenario" is an independent decision tree; a "branch" is the path from its root to a node.
// Same persisted shape (v1) as the previous studio, so plans saved there keep working. Costs are NEVER summed here: the server evaluates each path.
import type { Leg, Scenario, TreeNode } from '@/types';

let counter = 0;
export const uid = () => `${Date.now().toString(36)}${(counter++).toString(36)}`;

export function makeScenario(name: string): Scenario {
  const root: TreeNode = { id: uid(), parent: null, children: [], leg: null, collapsed: false, note: '' };
  return { id: uid(), name, saved: false, createdAt: Date.now(), rootId: root.id, focusId: root.id, nodes: { [root.id]: root } };
}

export function pathNodes(sc: Scenario, nid: string): TreeNode[] {
  const out: TreeNode[] = [];
  for (let n: TreeNode | undefined = sc.nodes[nid]; n; n = n.parent ? sc.nodes[n.parent] : undefined) out.unshift(n);
  return out;
}
export const pathKeys = (sc: Scenario, nid: string) => pathNodes(sc, nid).flatMap((n) => (n.leg ? [n.leg.key] : []));
export const pathLegs = (sc: Scenario, nid: string) => pathNodes(sc, nid).flatMap((n) => (n.leg ? [n.leg] : []));

export function subtreeIds(sc: Scenario, nid: string): string[] {
  const ids = [nid];
  for (let i = 0; i < ids.length; i++) ids.push(...(sc.nodes[ids[i]!]?.children ?? []));
  return ids;
}

/** Adds `leg` under `parentId`; if the same flight is already a child, focuses it instead (no duplicates). */
export function addChild(sc: Scenario, parentId: string, leg: Leg, warn: string[] = []): Scenario {
  const parent = sc.nodes[parentId];
  if (!parent) return sc;
  const dup = parent.children.map((id) => sc.nodes[id]).find((n) => n?.leg?.key === leg.key);
  if (dup) return { ...sc, focusId: dup.id };
  const node: TreeNode = { id: uid(), parent: parentId, children: [], leg, collapsed: false, note: '', warn };
  return {
    ...sc, focusId: node.id,
    nodes: { ...sc.nodes, [node.id]: node, [parentId]: { ...parent, children: [...parent.children, node.id], collapsed: false } },
  };
}

export function removeNode(sc: Scenario, nid: string): Scenario {
  const n = sc.nodes[nid];
  if (!n || !n.parent) return sc;
  const ids = new Set(subtreeIds(sc, nid));
  const nodes = Object.fromEntries(Object.entries(sc.nodes).filter(([id]) => !ids.has(id)));
  const parent = nodes[n.parent]!;
  nodes[n.parent] = { ...parent, children: parent.children.filter((c) => c !== nid) };
  return { ...sc, nodes, focusId: nodes[sc.focusId] ? sc.focusId : n.parent };
}

export function duplicateScenario(sc: Scenario, name = `${sc.name} (copy)`): Scenario {
  const copy = makeScenario(name);
  if (sc.research) copy.research = { ...sc.research };
  const map: Record<string, string> = {};
  const clone = (id: string, parent: string | null): TreeNode => {
    const o = sc.nodes[id]!;
    const n: TreeNode = id === sc.rootId ? copy.nodes[copy.rootId]! : { id: uid(), parent, children: [], leg: o.leg, collapsed: o.collapsed, note: o.note, warn: o.warn ?? [] };
    map[id] = n.id;
    copy.nodes[n.id] = n;
    for (const c of o.children) n.children.push(clone(c, n.id).id);
    return n;
  };
  clone(sc.rootId, null);
  copy.focusId = map[sc.focusId] ?? copy.rootId;
  return copy;
}

/** Linear scenario holding exactly the legs from the root to `nid` (a branch promoted to its own plan). */
export function branchToScenario(sc: Scenario, nid: string, name: string): Scenario {
  const copy = makeScenario(name);
  if (sc.research) copy.research = { ...sc.research };
  let parent = copy.nodes[copy.rootId]!;
  for (const n of pathNodes(sc, nid).filter((x) => x.leg)) {
    const c: TreeNode = { id: uid(), parent: parent.id, children: [], leg: n.leg, collapsed: false, note: n.note };
    copy.nodes[c.id] = c;
    parent.children.push(c.id);
    parent = c;
  }
  copy.focusId = parent.id;
  return copy;
}

export const leaves = (sc: Scenario) => Object.values(sc.nodes).filter((n) => !n.children.length && n.leg);

/** A plan built from a ready-made list of legs (for example an Insights recommendation opened in the studio). */
export function scenarioFromLegs(name: string, legs: Leg[]): Scenario {
  const sc = makeScenario(name);
  let parent = sc.nodes[sc.rootId]!;
  for (const leg of legs) {
    const c: TreeNode = { id: uid(), parent: parent.id, children: [], leg, collapsed: false, note: '' };
    sc.nodes[c.id] = c;
    parent.children.push(c.id);
    parent = c;
  }
  sc.focusId = parent.id;
  return sc;
}
