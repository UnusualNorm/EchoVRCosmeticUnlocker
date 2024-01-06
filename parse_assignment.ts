type ItemAssignment = Record<string, Record<string, string[]>>;

const item_assignment: ItemAssignment = JSON.parse(
  await Deno.readTextFile("./item_assignment.json"),
);

let items: string[] = [];
for (const item1 of Object.values(item_assignment)) {
  for (const item2 of Object.values(item1)) {
    items = items.concat(item2);
  }
}

await Deno.writeTextFile("./items.json", JSON.stringify(items, null, 2));
