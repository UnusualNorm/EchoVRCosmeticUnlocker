type ItemAssignment = Record<string, Record<string, string[]>>;

const item_assignment: ItemAssignment = JSON.parse(
  await Deno.readTextFile("./item_assignment.json"),
);

const items = new Set<string>();
for (const item1 of Object.values(item_assignment)) {
  for (const item2 of Object.values(item1)) {
    for (const item3 of item2) {
      items.add(item3);
    }
  }
}

await Deno.writeTextFile(
  "./items.json",
  JSON.stringify(Array.from(items), null, 2),
);
